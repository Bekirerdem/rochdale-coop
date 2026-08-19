// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./Coop.t.sol";

/// @dev Kapatilan iki acigin geri gelmedigini bekleyen testler.
contract GuvenlikTest is CoopBase {
    /// Havuza urun koyan bir uretici sonradan ayrilsa bile satis tamamlanmali
    /// ve hak ettigi risturn durmali. (Onceden satis revert ediyor, alicinin
    /// bedeli emanette kilitleniyordu.)
    function test_AyrilanUretici_SatisiKilitlemiyor() public {
        _fillPool(60, 40, 0);

        vm.prank(ali);
        uint256 offerId = market.createOffer(poolId, 100, 1 ether, "ipfs://teklif");

        vm.deal(alici, 100 ether);
        vm.prank(alici);
        uint256 exId = market.buy{value: 100 ether}(offerId, 100);

        vm.prank(veli);
        reg.resign();
        assertFalse(reg.isActiveMember(veli), "Veli ayrildi");

        vm.prank(alici);
        market.confirmDelivery(exId);

        assertEq(address(market).balance, 0, "emanet bosaldi");
        assertEq(address(vault).balance, 50 ether, "risturn matrahi olustu");

        uint256 period = vault.closePeriod();
        assertEq(vault.entitlementOf(period, veli), 20 ether, "ayrilan uyenin hakki duruyor");

        vm.prank(veli);
        vault.claim(period);
        assertEq(veli.balance, 20 ether, "ayrilan uye emeginin karsiligini aldi");
    }

    /// Kasadaki tutari disari aktaran bir fonksiyon olmamali.
    function test_KasayiBosaltanFonksiyonYok() public {
        _fillPool(60, 40, 0);
        _sell(100, 1 ether);
        uint256 period = vault.closePeriod();

        assertEq(address(vault).balance, 50 ether);

        // sweepDust kaldirildi: steward artik uyelerin payini disari cikaramaz.
        (bool bulundu,) = address(vault).call(
            abi.encodeWithSignature("sweepDust(uint256,address)", period, address(this))
        );
        assertFalse(bulundu, "kasayi bosaltan fonksiyon hala var");

        vm.prank(ali);  vault.claim(period);
        vm.prank(veli); vault.claim(period);
        assertEq(ali.balance, 30 ether);
        assertEq(veli.balance, 20 ether);
    }

    /// Yeter sayi bir oylamayla sifira cekilip yonetisim tek kisilik yapilamamali.
    function test_YeterSayiSifirlanamaz() public {
        reg.lockGovernance(address(gov));
        sbt.issue(ali, COURSE, "ipfs://sertifika");

        bytes memory data = abi.encodeCall(CoopGovernance.setQuorumBps, (0));
        vm.prank(ali);
        uint256 pid = gov.propose(address(gov), 0, data, "ipfs://quorum-sifirla");

        vm.prank(ali);  gov.castVote(pid, true);
        vm.prank(veli); gov.castVote(pid, true);
        vm.warp(block.timestamp + 3 days + 1);

        vm.expectRevert();
        gov.execute(pid);
        assertEq(gov.quorumBps(), 3000, "yeter sayi degismedi");
    }

    /// Dort fonun da adresi guncellenebilmeli (onceden ikisinin yolu yoktu).
    function test_DortFonunDaAdresiGuncellenebilir() public {
        address yeni = makeAddr("yeniHazine");
        router.setTreasury(TreasuryRouter.Fon.Topluluk, yeni);
        router.setTreasury(TreasuryRouter.Fon.YenidenYatirim, yeni);
        router.setTreasury(TreasuryRouter.Fon.Egitim, yeni);
        router.setTreasury(TreasuryRouter.Fon.Dayanisma, yeni);

        assertEq(router.communityTreasury(), yeni);
        assertEq(router.reinvestmentTreasury(), yeni);
        assertEq(router.educationTreasury(), yeni);
        assertEq(router.interCoopTreasury(), yeni);
    }
}
