// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {RochdaleMath} from "./libraries/RochdaleMath.sol";

/// @title TreasuryRouter — Gelir Dağıtım Yönlendiricisi
/// @notice Her satış geliri, Rochdale İlkeleri'ne karşılık gelen beş fona bölünür.
/// @dev Oranlar sabit değildir; yalnızca yönetişim kararıyla (bir üye bir oy)
///      değiştirilebilir. Kooperatifin "programlanabilir anayasası" burada durur.
contract TreasuryRouter {
    using RochdaleMath for RochdaleMath.DistributionPolicy;

    address public steward;
    bool public governanceLocked;

    address public patronageVault;        // risturn → üyeye hacme göre
    address public communityTreasury;     // topluluk fonu → demokratik harcama
    address public reinvestmentTreasury;  // yeniden yatırım → kooperatifin kendisi
    address public educationTreasury;     // eğitim fonu → Rochdale 5. ilke
    address public interCoopTreasury;     // dayanışma → Rochdale 6. ilke

    RochdaleMath.DistributionPolicy public policy;

    uint256 public totalRouted;

    event RevenueRouted(
        uint256 amount,
        uint256 patronage,
        uint256 community,
        uint256 reinvestment,
        uint256 education,
        uint256 interCooperation
    );
    event PolicyUpdated(
        uint256 patronageBps,
        uint256 communityBps,
        uint256 reinvestmentBps,
        uint256 educationBps,
        uint256 interCoopBps
    );
    event TreasuryUpdated(string indexed name, address indexed target);
    event GovernanceLocked(address indexed governance);

    error OnlySteward();
    error AlreadyLocked();
    error ZeroAddress();
    error NoRevenue();
    error TransferFailed();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    constructor(
        address _steward,
        address _patronageVault,
        address _communityTreasury,
        address _reinvestmentTreasury,
        address _educationTreasury,
        address _interCoopTreasury
    ) {
        if (
            _steward == address(0) || _patronageVault == address(0)
                || _communityTreasury == address(0) || _reinvestmentTreasury == address(0)
                || _educationTreasury == address(0) || _interCoopTreasury == address(0)
        ) revert ZeroAddress();

        steward = _steward;
        patronageVault = _patronageVault;
        communityTreasury = _communityTreasury;
        reinvestmentTreasury = _reinvestmentTreasury;
        educationTreasury = _educationTreasury;
        interCoopTreasury = _interCoopTreasury;

        // Başlangıç anayasası: gelirin yarısı doğrudan üreticiye geri döner.
        policy = RochdaleMath.DistributionPolicy({
            patronageRefundBps: 5000,
            communityFundBps: 1500,
            reinvestmentBps: 2000,
            educationFundBps: 1000,
            interCooperationBps: 500
        });
    }

    function lockGovernance(address governance) external onlySteward {
        if (governanceLocked) revert AlreadyLocked();
        if (governance == address(0)) revert ZeroAddress();
        steward = governance;
        governanceLocked = true;
        emit GovernanceLocked(governance);
    }

    // ---------------------------------------------------------------- dağıtım

    /// @notice Satış gelirini beş fona böler ve anında dağıtır.
    function routeRevenue() external payable {
        if (msg.value == 0) revert NoRevenue();

        RochdaleMath.DistributionPolicy memory p = policy;
        (
            uint256 patronage,
            uint256 community,
            uint256 reinvestment,
            uint256 education,
            uint256 interCooperation
        ) = p.split(msg.value);

        totalRouted += msg.value;

        _send(patronageVault, patronage);
        _send(communityTreasury, community);
        _send(reinvestmentTreasury, reinvestment);
        _send(educationTreasury, education);
        _send(interCoopTreasury, interCooperation);

        emit RevenueRouted(msg.value, patronage, community, reinvestment, education, interCooperation);
    }

    /// @notice Gelen tutarın nasıl bölüneceğini önceden gösterir (arayüz için).
    function preview(uint256 amount)
        external
        view
        returns (uint256 patronage, uint256 community, uint256 reinvestment, uint256 education, uint256 interCooperation)
    {
        RochdaleMath.DistributionPolicy memory p = policy;
        return p.split(amount);
    }

    // ---------------------------------------------------------------- yönetişim

    /// @notice Dağıtım oranlarını değiştirir. Yalnızca üye oylamasıyla.
    function setPolicy(RochdaleMath.DistributionPolicy calldata newPolicy) external onlySteward {
        RochdaleMath.DistributionPolicy memory p = newPolicy;
        p.validate();
        policy = p;
        emit PolicyUpdated(
            p.patronageRefundBps,
            p.communityFundBps,
            p.reinvestmentBps,
            p.educationFundBps,
            p.interCooperationBps
        );
    }

    function setCommunityTreasury(address target) external onlySteward {
        if (target == address(0)) revert ZeroAddress();
        communityTreasury = target;
        emit TreasuryUpdated("community", target);
    }

    function setEducationTreasury(address target) external onlySteward {
        if (target == address(0)) revert ZeroAddress();
        educationTreasury = target;
        emit TreasuryUpdated("education", target);
    }

    // ---------------------------------------------------------------- iç

    function _send(address target, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = payable(target).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
