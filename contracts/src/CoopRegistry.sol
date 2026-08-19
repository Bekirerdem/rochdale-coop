// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title CoopRegistry — Kooperatif Üye Kütüğü
/// @notice Rochdale 1. ve 2. ilkeleri: gönüllü ve açık üyelik + demokratik üye kontrolü.
/// @dev Açık üyelik ile Sybil direnci arasındaki gerilim, iki aşamalı kapı ile çözülür:
///      herkes başvurabilir (açık), ancak kütüğe geçiş kooperatif kararıyla olur (Sybil'e kapalı).
///      Kayıt yetkisi başlangıçta kurucudadır ve lockGovernance ile GERİ ALINAMAZ biçimde
///      yönetişim sözleşmesine devredilir.
contract CoopRegistry {
    enum Status {
        None,       // hiç başvurmamış
        Pending,    // başvurdu, karar bekliyor
        Active,     // üye
        Removed,    // üyelikten çıktı/çıkarıldı
        Rejected    // başvurusu reddedildi
    }

    struct Member {
        Status status;
        bytes32 role;        // keccak256("PRODUCER") | keccak256("CONSUMER")
        string metadataURI;  // profil / ortaklık belgesi
        uint256 joinedAt;
        uint256 capital;     // sermaye payı — SADECE karşılaştırma içindir, oy gücü DEĞİLDİR
    }

    bytes32 public constant ROLE_PRODUCER = keccak256("PRODUCER");
    bytes32 public constant ROLE_CONSUMER = keccak256("CONSUMER");

    string public coopName;
    address public steward;
    bool public governanceLocked;

    mapping(address => Member) public members;
    address[] private _memberList;
    mapping(address => bool) private _inList;

    uint256 public activeMemberCount;
    uint256 public totalCapital;

    event MembershipRequested(address indexed account, bytes32 indexed role, string metadataURI);
    event MemberAdmitted(address indexed account, bytes32 indexed role);
    event MemberRejected(address indexed account);
    event MemberRemoved(address indexed account);
    event MemberResigned(address indexed account);
    event CapitalRecorded(address indexed account, uint256 amount, uint256 total);
    event GovernanceLocked(address indexed governance);

    error OnlySteward();
    error AlreadyLocked();
    error ZeroAddress();
    error NotPending();
    error NotActiveMember();
    error AlreadyMember();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    constructor(string memory _coopName, address _steward) {
        if (_steward == address(0)) revert ZeroAddress();
        coopName = _coopName;
        steward = _steward;
    }

    /// @notice Yönetimi kalıcı olarak yönetişim sözleşmesine devreder. Tek yönlüdür.
    /// @dev Kilit sonrası kurucunun hiçbir ayrıcalığı kalmaz; steward artık DAO'dur.
    function lockGovernance(address governance) external onlySteward {
        if (governanceLocked) revert AlreadyLocked();
        if (governance == address(0)) revert ZeroAddress();
        steward = governance;
        governanceLocked = true;
        emit GovernanceLocked(governance);
    }

    // ---------------------------------------------------------------- üyelik

    /// @notice Rochdale 1. ilke: üyelik gönüllü ve açıktır — herkes başvurabilir.
    function requestMembership(bytes32 role, string calldata metadataURI) external {
        Member storage m = members[msg.sender];
        if (m.status == Status.Active) revert AlreadyMember();
        m.status = Status.Pending;
        m.role = role;
        m.metadataURI = metadataURI;
        emit MembershipRequested(msg.sender, role, metadataURI);
    }

    /// @notice Başvuruyu kabul eder. Kilit öncesi kurucu, sonrası DAO oylaması çağırır.
    function admitMember(address account) external onlySteward {
        Member storage m = members[account];
        if (m.status != Status.Pending) revert NotPending();
        _activate(account, m);
    }

    /// @notice Kurucu aşamasında kurucu üyeleri tek adımda kütüğe işler.
    function stewardAdmit(address account, bytes32 role, string calldata metadataURI)
        external
        onlySteward
    {
        Member storage m = members[account];
        if (m.status == Status.Active) revert AlreadyMember();
        m.role = role;
        m.metadataURI = metadataURI;
        _activate(account, m);
    }

    function rejectMembership(address account) external onlySteward {
        Member storage m = members[account];
        if (m.status != Status.Pending) revert NotPending();
        m.status = Status.Rejected;
        emit MemberRejected(account);
    }

    function removeMember(address account) external onlySteward {
        Member storage m = members[account];
        if (m.status != Status.Active) revert NotActiveMember();
        m.status = Status.Removed;
        activeMemberCount -= 1;
        emit MemberRemoved(account);
    }

    /// @notice Rochdale 1. ilke: üyelik gönüllüdür — üye kendi iradesiyle ayrılabilir.
    function resign() external {
        Member storage m = members[msg.sender];
        if (m.status != Status.Active) revert NotActiveMember();
        m.status = Status.Removed;
        activeMemberCount -= 1;
        emit MemberResigned(msg.sender);
    }

    // ---------------------------------------------------------------- sermaye

    /// @notice Üyenin sermaye payını kaydeder.
    /// @dev Bu rakam yönetişimde HİÇBİR ağırlık taşımaz. Yalnızca sunumda
    ///      "şirket modeli olsaydı ne olurdu" karşılaştırmasını üretmek için tutulur.
    function recordCapital(address account, uint256 amount) external onlySteward {
        if (members[account].status != Status.Active) revert NotActiveMember();
        members[account].capital += amount;
        totalCapital += amount;
        emit CapitalRecorded(account, amount, totalCapital);
    }

    // ---------------------------------------------------------------- görünümler

    function isActiveMember(address account) external view returns (bool) {
        return members[account].status == Status.Active;
    }

    /// @notice Rochdale 2. ilke: oy gücü sermayeden bağımsızdır, her üye 1 oydur.
    function votingPower(address account) external view returns (uint256) {
        return members[account].status == Status.Active ? 1 : 0;
    }

    function capitalOf(address account) external view returns (uint256) {
        return members[account].capital;
    }

    function memberCount() external view returns (uint256) {
        return _memberList.length;
    }

    function memberAt(uint256 index) external view returns (address) {
        return _memberList[index];
    }

    function allMembers() external view returns (address[] memory) {
        return _memberList;
    }

    // ---------------------------------------------------------------- iç

    function _activate(address account, Member storage m) private {
        m.status = Status.Active;
        m.joinedAt = block.timestamp;
        activeMemberCount += 1;
        if (!_inList[account]) {
            _inList[account] = true;
            _memberList.push(account);
        }
        emit MemberAdmitted(account, m.role);
    }
}
