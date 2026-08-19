// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CoopRegistry} from "./CoopRegistry.sol";
import {EducationSBT} from "./EducationSBT.sol";

/// @title CoopGovernance — Bir Üye, Bir Oy
/// @notice Rochdale 2. ilke: demokratik üye kontrolü. Oy gücü sermayeden, token
///         bakiyesinden ve kooperatife kattığı üründen tamamen bağımsızdır.
/// @dev Klasik DAO'larda oy gücü token bakiyesidir ve sermaye yoğunlaşması yönetişimi
///      ele geçirir. Burada oy ağırlığı sabit 1'dir ve değiştirilemez — bu sözleşmede
///      oy gücünü artıran hiçbir fonksiyon yoktur.
contract CoopGovernance {
    enum State {
        None,
        Active,
        Defeated,   // reddedildi ya da yeter sayı tutmadı
        Succeeded,  // kabul edildi, yürütme bekliyor
        Executed
    }

    struct Proposal {
        address proposer;
        string metadataURI;
        address target;      // çağrılacak sözleşme
        uint256 value;       // gönderilecek tutar
        bytes data;          // çağrı verisi
        uint256 startsAt;
        uint256 endsAt;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 snapshotMembers; // oylama açıldığı andaki aktif üye sayısı
        bool executed;
    }

    CoopRegistry public immutable registry;
    EducationSBT public immutable educationSBT;

    uint256 public votingPeriod = 3 days;
    /// @notice Yeter sayı: oylamaya katılması gereken asgari üye oranı (baz puan).
    uint256 public quorumBps = 3000; // %30

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 private _locked = 1;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address indexed target, string metadataURI, uint256 endsAt);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed proposalId, bytes result);
    event VotingPeriodUpdated(uint256 newPeriod);
    event QuorumUpdated(uint256 newQuorumBps);

    error OnlySelf();
    error OnlyMember();
    error EducationRequired();
    error ZeroAddress();
    error VotingClosed();
    error VotingOngoing();
    error AlreadyVoted();
    error NotSucceeded();
    error AlreadyExecuted();
    error ExecutionFailed(bytes reason);
    error InvalidQuorum();
    error Reentrancy();

    /// @dev Kendi parametrelerini yalnızca kendi kararıyla değiştirir — yani üye oylamasıyla.
    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelf();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(CoopRegistry _registry, EducationSBT _educationSBT) {
        if (address(_registry) == address(0)) revert ZeroAddress();
        registry = _registry;
        educationSBT = _educationSBT;
    }

    receive() external payable {}

    // ---------------------------------------------------------------- teklif

    /// @notice Teklif verebilmek için üye olmak ve eğitimi tamamlamış olmak gerekir.
    /// @dev Rochdale 5. ilkenin yönetişime bağlandığı yer burasıdır.
    function propose(address target, uint256 value, bytes calldata data, string calldata metadataURI)
        external
        returns (uint256 proposalId)
    {
        if (!registry.isActiveMember(msg.sender)) revert OnlyMember();
        if (address(educationSBT) != address(0) && !educationSBT.hasCredential(msg.sender)) {
            revert EducationRequired();
        }
        if (target == address(0)) revert ZeroAddress();

        proposalId = ++proposalCount;
        Proposal storage p = proposals[proposalId];
        p.proposer = msg.sender;
        p.metadataURI = metadataURI;
        p.target = target;
        p.value = value;
        p.data = data;
        p.startsAt = block.timestamp;
        p.endsAt = block.timestamp + votingPeriod;
        p.snapshotMembers = registry.activeMemberCount();

        emit ProposalCreated(proposalId, msg.sender, target, metadataURI, p.endsAt);
    }

    /// @notice Oy verir. Her aktif üyenin ağırlığı 1'dir — istisnasız.
    function castVote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        if (block.timestamp > p.endsAt || p.endsAt == 0) revert VotingClosed();
        if (!registry.isActiveMember(msg.sender)) revert OnlyMember();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        hasVoted[proposalId][msg.sender] = true;

        uint256 weight = 1; // Rochdale 2. ilke — sabit, sermayeden bağımsız
        if (support) p.forVotes += weight;
        else p.againstVotes += weight;

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    function state(uint256 proposalId) public view returns (State) {
        Proposal storage p = proposals[proposalId];
        if (p.endsAt == 0) return State.None;
        if (p.executed) return State.Executed;
        if (block.timestamp <= p.endsAt) return State.Active;

        uint256 turnout = p.forVotes + p.againstVotes;
        uint256 required = (p.snapshotMembers * quorumBps) / 10_000;
        if (turnout < required) return State.Defeated;
        return p.forVotes > p.againstVotes ? State.Succeeded : State.Defeated;
    }

    function execute(uint256 proposalId) external nonReentrant returns (bytes memory result) {
        Proposal storage p = proposals[proposalId];
        if (p.executed) revert AlreadyExecuted();
        if (block.timestamp <= p.endsAt) revert VotingOngoing();
        if (state(proposalId) != State.Succeeded) revert NotSucceeded();

        p.executed = true;

        (bool ok, bytes memory ret) = p.target.call{value: p.value}(p.data);
        if (!ok) revert ExecutionFailed(ret);

        emit ProposalExecuted(proposalId, ret);
        return ret;
    }

    // ---------------------------------------------------------------- parametreler

    function setVotingPeriod(uint256 newPeriod) external onlySelf {
        votingPeriod = newPeriod;
        emit VotingPeriodUpdated(newPeriod);
    }

    /// @dev Alt sınır, yeter sayının bir oylamayla sıfırlanıp yönetişimin
    ///      tek kişilik hale getirilmesini engeller.
    uint256 public constant MIN_QUORUM_BPS = 1_000; // %10

    function setQuorumBps(uint256 newQuorumBps) external onlySelf {
        if (newQuorumBps > 10_000 || newQuorumBps < MIN_QUORUM_BPS) revert InvalidQuorum();
        quorumBps = newQuorumBps;
        emit QuorumUpdated(newQuorumBps);
    }

    // ---------------------------------------------------------------- görünümler

    function quorumRequired(uint256 proposalId) external view returns (uint256) {
        return (proposals[proposalId].snapshotMembers * quorumBps) / 10_000;
    }

    function turnoutOf(uint256 proposalId) external view returns (uint256) {
        Proposal storage p = proposals[proposalId];
        return p.forVotes + p.againstVotes;
    }

    function votesOf(uint256 proposalId) external view returns (uint256 forVotes, uint256 againstVotes) {
        Proposal storage p = proposals[proposalId];
        return (p.forVotes, p.againstVotes);
    }
}
