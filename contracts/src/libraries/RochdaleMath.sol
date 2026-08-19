// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title RochdaleMath
/// @notice Kooperatif gelirinin Rochdale İlkeleri'ne göre bölünmesini tanımlar.
/// @dev Ömür Demirel'in özgün tasarımı korunmuştur; küsurat son paya verilerek
///      kasada toz bakiye kalması engellenir.
library RochdaleMath {
    uint256 internal constant TOTAL_BPS = 10_000;

    /// @param patronageRefundBps      Risturn — üyeye işlem hacmine göre iade
    /// @param communityFundBps        Topluluk fonu — demokratik kararla harcanır
    /// @param reinvestmentBps         Yeniden yatırım — kooperatifin kendi gelişimi
    /// @param educationFundBps        Eğitim fonu — Rochdale 5. ilke
    /// @param interCooperationBps     Kooperatifler arası dayanışma — Rochdale 6. ilke
    struct DistributionPolicy {
        uint256 patronageRefundBps;
        uint256 communityFundBps;
        uint256 reinvestmentBps;
        uint256 educationFundBps;
        uint256 interCooperationBps;
    }

    error InvalidTotalBps(uint256 given);

    function validate(DistributionPolicy memory policy) internal pure {
        uint256 total = policy.patronageRefundBps
            + policy.communityFundBps
            + policy.reinvestmentBps
            + policy.educationFundBps
            + policy.interCooperationBps;
        if (total != TOTAL_BPS) revert InvalidTotalBps(total);
    }

    function split(DistributionPolicy memory policy, uint256 amount)
        internal
        pure
        returns (
            uint256 patronage,
            uint256 community,
            uint256 reinvestment,
            uint256 education,
            uint256 interCooperation
        )
    {
        patronage = (amount * policy.patronageRefundBps) / TOTAL_BPS;
        community = (amount * policy.communityFundBps) / TOTAL_BPS;
        reinvestment = (amount * policy.reinvestmentBps) / TOTAL_BPS;
        education = (amount * policy.educationFundBps) / TOTAL_BPS;
        // Küsurat son paya: toplam her zaman amount'a eşit kalır.
        interCooperation = amount - (patronage + community + reinvestment + education);
    }

    /// @notice Karşılaştırma için: aynı tutarın sermaye payına göre dağılımı.
    /// @dev Sunumda "şirket modeli" kolonunu üretmek için kullanılır.
    function capitalShare(uint256 amount, uint256 memberCapital, uint256 totalCapital)
        internal
        pure
        returns (uint256)
    {
        if (totalCapital == 0) return 0;
        return (amount * memberCapital) / totalCapital;
    }
}
