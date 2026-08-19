// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {CoopRegistry} from "../src/CoopRegistry.sol";
import {SupplyPool} from "../src/SupplyPool.sol";
import {PatronageVault} from "../src/PatronageVault.sol";
import {TreasuryRouter} from "../src/TreasuryRouter.sol";
import {CoopMarket} from "../src/CoopMarket.sol";
import {EducationSBT} from "../src/EducationSBT.sol";
import {CoopGovernance} from "../src/CoopGovernance.sol";
import {RochdaleMath} from "../src/libraries/RochdaleMath.sol";

/// @dev Ödemeyi kabul eden basit hazine — topluluk/eğitim/yatırım fonlarını temsil eder.
contract Treasury {
    receive() external payable {}
}

abstract contract CoopBase is Test {
    CoopRegistry   reg;
    SupplyPool     pool;
    PatronageVault vault;
    TreasuryRouter router;
    CoopMarket     market;
    EducationSBT   sbt;
    CoopGovernance gov;

    Treasury community;
    Treasury reinvestment;
    Treasury education;
    Treasury interCoop;

    address ali   = makeAddr("ali");    // uretici
    address veli  = makeAddr("veli");   // uretici
    address ayse  = makeAddr("ayse");   // uretici
    address alici = makeAddr("alici");  // toptanci

    bytes32 constant PRODUCER = keccak256("PRODUCER");
    bytes32 constant CONSUMER = keccak256("CONSUMER");
    bytes32 constant COURSE   = keccak256("KOOPERATIFCILIK_101");

    uint256 poolId;

    function setUp() public virtual {
        community    = new Treasury();
        reinvestment = new Treasury();
        education    = new Treasury();
        interCoop    = new Treasury();

        reg   = new CoopRegistry("Ayvalik Zeytinyagi Kooperatifi", address(this));
        sbt   = new EducationSBT(address(this));
        vault = new PatronageVault(reg, address(this));
        router = new TreasuryRouter(
            address(this), address(vault),
            address(community), address(reinvestment), address(education), address(interCoop)
        );
        pool   = new SupplyPool(reg, address(this));
        market = new CoopMarket(reg, pool, vault, router, address(this));
        gov    = new CoopGovernance(reg, sbt);

        pool.setMarketOperator(address(market), true);
        vault.setRecorder(address(market), true);

        reg.stewardAdmit(ali,   PRODUCER, "ipfs://ali");
        reg.stewardAdmit(veli,  PRODUCER, "ipfs://veli");
        reg.stewardAdmit(ayse,  PRODUCER, "ipfs://ayse");
        reg.stewardAdmit(alici, CONSUMER, "ipfs://alici");

        // Havuz: 100 litre erken hasat zeytinyagi, litresi 1 ether
        vm.prank(ali);
        poolId = pool.createPool("ipfs://erken-hasat-2026", 1 ether);
    }

    function _fillPool(uint256 a, uint256 v, uint256 y) internal {
        if (a > 0) { vm.prank(ali);  pool.addUnits(poolId, a); }
        if (v > 0) { vm.prank(veli); pool.addUnits(poolId, v); }
        if (y > 0) { vm.prank(ayse); pool.addUnits(poolId, y); }
    }

    function _sell(uint256 units, uint256 pricePerUnit) internal returns (uint256 exchangeId) {
        vm.prank(ali);
        uint256 offerId = market.createOffer(poolId, units, pricePerUnit, "ipfs://teklif");

        uint256 cost = units * pricePerUnit;
        vm.deal(alici, cost);
        vm.prank(alici);
        exchangeId = market.buy{value: cost}(offerId, units);

        vm.prank(alici);
        market.confirmDelivery(exchangeId);
    }
}

// ---------------------------------------------------------------------------
//  1. Uctan uca akis — sunumda gosterilecek senaryo
// ---------------------------------------------------------------------------
contract EndToEndTest is CoopBase {
    function test_TamAkis_ParaKaybolmadanDagitiliyor() public {
        _fillPool(60, 40, 0); // Ali 60 litre, Veli 40 litre

        uint256 exId = _sell(100, 1 ether); // 100 litre x 1 ether = 100 ether
        exId; // kullanilmiyor

        // Emanet bosalmis olmali — para market'te takili kalmiyor
        assertEq(address(market).balance, 0, "market'te para kaldi");
        assertEq(market.totalEscrowed(), 0, "escrow muhasebesi bozuk");

        // 100 ether tam olarak bes fona bolunmus olmali
        assertEq(address(vault).balance,        50 ether, "risturn %50");
        assertEq(address(community).balance,    15 ether, "topluluk %15");
        assertEq(address(reinvestment).balance, 20 ether, "yatirim %20");
        assertEq(address(education).balance,    10 ether, "egitim %10");
        assertEq(address(interCoop).balance,     5 ether, "dayanisma %5");

        uint256 toplam = address(vault).balance + address(community).balance
            + address(reinvestment).balance + address(education).balance
            + address(interCoop).balance;
        assertEq(toplam, 100 ether, "wei kaybi var");

        // Donem kapatilir, uyeler risturnunu ceker
        uint256 period = vault.closePeriod();

        vm.prank(ali);  vault.claim(period);
        vm.prank(veli); vault.claim(period);

        assertEq(ali.balance,  30 ether, "Ali 60 litre -> 30 ether");
        assertEq(veli.balance, 20 ether, "Veli 40 litre -> 20 ether");
        assertEq(address(vault).balance, 0, "kasada bakiye kaldi");
    }

    function test_UyeOlmayanSatinAlabilir_AmaRisturnAlamaz() public {
        _fillPool(100, 0, 0);
        _sell(100, 1 ether);
        uint256 period = vault.closePeriod();

        // Alici uye ama uretici degil: hacmi yok, risturnu da yok
        assertEq(vault.refundOf(period, alici), 0);
        vm.prank(alici);
        vm.expectRevert(PatronageVault.NothingToClaim.selector);
        vault.claim(period);
    }
}

// ---------------------------------------------------------------------------
//  2. Projenin tezi: hacme gore mi, sermayeye gore mi?
// ---------------------------------------------------------------------------
contract RisturnVsSermayeTest is CoopBase {
    function test_AyniGelir_IkiFarkliKural_FarkliSonuc() public {
        // Veli kooperatife cok sermaye koydu ama az urun verdi.
        // Ali az sermaye koydu, cok urun verdi.
        reg.recordCapital(ali,   10_000);
        reg.recordCapital(veli,  90_000);

        _fillPool(80, 20, 0); // Ali 80 litre, Veli 20 litre
        _sell(100, 1 ether);
        uint256 period = vault.closePeriod();

        uint256 aliKoop  = vault.refundOf(period, ali);
        uint256 veliKoop = vault.refundOf(period, veli);

        uint256 aliSirket  = vault.capitalModelShareOf(period, ali);
        uint256 veliSirket = vault.capitalModelShareOf(period, veli);

        console.log("--- 50 ether risturn matrahi ---");
        console.log("KOOPERATIF (islem hacmine gore)");
        console.log("  Ali  (80 litre, 10k sermaye):", aliKoop  / 1e18, "ether");
        console.log("  Veli (20 litre, 90k sermaye):", veliKoop / 1e18, "ether");
        console.log("SIRKET (sermaye payina gore)");
        console.log("  Ali :", aliSirket  / 1e18, "ether");
        console.log("  Veli:", veliSirket / 1e18, "ether");

        assertEq(aliKoop,  40 ether, "kooperatif: emegi olan kazanir");
        assertEq(veliKoop, 10 ether);
        assertEq(aliSirket,   5 ether, "sirket: sermayesi olan kazanir");
        assertEq(veliSirket, 45 ether);

        // Ayni gelir, ayni kisiler, ters sonuc.
        assertGt(aliKoop, aliSirket);
        assertLt(veliKoop, veliSirket);
    }
}

// ---------------------------------------------------------------------------
//  3. Hocanin kodundaki kirikliklar — hepsi duzeldi mi?
// ---------------------------------------------------------------------------
contract RegresyonTest is CoopBase {
    /// Eski kod: 100 rezerve edilip 50 tuketilince shares dizisinde (address(0), 0)
    /// kaliyor ve recordPatronage NOT_MEMBER ile revert ediyordu.
    function test_KismiSatis_ArtikKilitlenmiyor() public {
        _fillPool(60, 40, 0);

        vm.prank(ali);
        uint256 offerId = market.createOffer(poolId, 100, 1 ether, "ipfs://teklif");

        // Teklifin yalnizca yarisi satiliyor
        vm.deal(alici, 50 ether);
        vm.prank(alici);
        uint256 exId = market.buy{value: 50 ether}(offerId, 50);

        vm.prank(alici);
        market.confirmDelivery(exId); // eski kodda burasi revert ediyordu

        uint256 period = vault.closePeriod();

        // 50 litre orantili tuketildi: Ali 30, Veli 20
        assertEq(vault.unitsOf(period, ali),  30, "Ali orantili pay");
        assertEq(vault.unitsOf(period, veli), 20, "Veli orantili pay");

        // Kalan 50 litre hala havuzda ve rezerve
        assertEq(pool.availableUnits(poolId), 0);
        vm.prank(ali);
        market.closeOffer(offerId);
        assertEq(pool.availableUnits(poolId), 50, "satilmayan urun havuza dondu");
    }

    /// Eski kod: alicinin parasi MockBoson'da kilitli kaliyor, dagitim icin
    /// ikinci bir odeme gerekiyordu.
    function test_TekOdeme_CiftOdemeGerekmiyor() public {
        _fillPool(100, 0, 0);

        uint256 alicininOdedigi = 100 ether;
        _sell(100, 1 ether);

        uint256 dagitilan = address(vault).balance + address(community).balance
            + address(reinvestment).balance + address(education).balance
            + address(interCoop).balance;

        assertEq(dagitilan, alicininOdedigi, "dagitilan = alicinin odedigi");
    }

    /// Eski kod: completeExchange herkese acikti.
    function test_TeslimatiSadeceAliciOnaylar() public {
        _fillPool(100, 0, 0);
        vm.prank(ali);
        uint256 offerId = market.createOffer(poolId, 100, 1 ether, "ipfs://teklif");
        vm.deal(alici, 100 ether);
        vm.prank(alici);
        uint256 exId = market.buy{value: 100 ether}(offerId, 100);

        vm.prank(makeAddr("yabanci"));
        vm.expectRevert(CoopMarket.OnlyBuyer.selector);
        market.confirmDelivery(exId);
    }

    /// Alici sessiz kalirsa uretici parasini alabilmeli (iyimser mutabakat).
    function test_SureDolunca_SatisKendiliginden_Kesinlesir() public {
        _fillPool(100, 0, 0);
        vm.prank(ali);
        uint256 offerId = market.createOffer(poolId, 100, 1 ether, "ipfs://teklif");
        vm.deal(alici, 100 ether);
        vm.prank(alici);
        uint256 exId = market.buy{value: 100 ether}(offerId, 100);

        vm.expectRevert(CoopMarket.WindowNotElapsed.selector);
        market.finalizeExpired(exId);

        vm.warp(block.timestamp + 7 days);
        market.finalizeExpired(exId);
        assertEq(address(vault).balance, 50 ether);
    }
}

// ---------------------------------------------------------------------------
//  4. Bir uye bir oy
// ---------------------------------------------------------------------------
contract YonetisimTest is CoopBase {
    function setUp() public override {
        super.setUp();
        // Yonetisim, sozlesmelerin steward'i olur — kilit tek yonludur
        reg.lockGovernance(address(gov));
        pool.lockGovernance(address(gov));
        vault.lockGovernance(address(gov));
        router.lockGovernance(address(gov));
        market.lockGovernance(address(gov));
    }

    function test_SermayeOyGucuVermez() public {
        assertEq(reg.votingPower(ali), 1);
        assertEq(reg.votingPower(veli), 1);
        assertEq(reg.votingPower(makeAddr("yabanci")), 0);
    }

    function test_EgitimsizUyeTeklifVeremez() public {
        vm.prank(ali);
        vm.expectRevert(CoopGovernance.EducationRequired.selector);
        gov.propose(address(router), 0, "", "ipfs://teklif");
    }

    function test_UyelerRisturnOraniniDegistirebilir() public {
        sbt.issue(ali, COURSE, "ipfs://sertifika");

        // Teklif: risturn payini %50'den %70'e cikar
        RochdaleMath.DistributionPolicy memory yeni = RochdaleMath.DistributionPolicy({
            patronageRefundBps: 7000,
            communityFundBps: 1000,
            reinvestmentBps: 1000,
            educationFundBps: 700,
            interCooperationBps: 300
        });
        bytes memory data = abi.encodeCall(TreasuryRouter.setPolicy, (yeni));

        vm.prank(ali);
        uint256 pid = gov.propose(address(router), 0, data, "ipfs://risturn-artisi");

        vm.prank(ali);   gov.castVote(pid, true);
        vm.prank(veli);  gov.castVote(pid, true);
        vm.prank(ayse);  gov.castVote(pid, false);

        vm.warp(block.timestamp + 3 days + 1);
        assertEq(uint256(gov.state(pid)), uint256(CoopGovernance.State.Succeeded));

        gov.execute(pid);

        (uint256 patronageBps,,,,) = router.policy();
        assertEq(patronageBps, 7000, "anayasa uye oylamasiyla degisti");
    }

    function test_YeterSayiTutmazsaKararDusser() public {
        sbt.issue(ali, COURSE, "ipfs://sertifika");
        vm.prank(ali);
        uint256 pid = gov.propose(address(router), 0, "", "ipfs://bos");

        // 4 aktif uye var, yeter sayi %30 = 1.2 -> 1 oy yeterli olurdu;
        // hic oy kullanilmazsa dusser
        vm.warp(block.timestamp + 3 days + 1);
        assertEq(uint256(gov.state(pid)), uint256(CoopGovernance.State.Defeated));
    }

    function test_KilitGeriAlinamaz() public {
        vm.expectRevert(CoopRegistry.AlreadyLocked.selector);
        vm.prank(address(gov));
        reg.lockGovernance(makeAddr("baskasi"));
    }

    function test_KilitSonrasiKurucununYetkisiYok() public {
        // Bu test sozlesmesi (kurucu) artik steward degil
        vm.expectRevert(CoopRegistry.OnlySteward.selector);
        reg.stewardAdmit(makeAddr("yeni"), PRODUCER, "ipfs://x");
    }
}

// ---------------------------------------------------------------------------
//  5. Uyelik: acik ama Sybil'e kapali
// ---------------------------------------------------------------------------
contract UyelikTest is CoopBase {
    function test_HerkesBasvurabilir_AmaKendiKendineUyeOlamaz() public {
        address yabanci = makeAddr("yabanci");

        vm.prank(yabanci);
        reg.requestMembership(PRODUCER, "ipfs://basvuru");

        (CoopRegistry.Status durum,,,,) = reg.members(yabanci);
        assertEq(uint256(durum), uint256(CoopRegistry.Status.Pending));
        assertFalse(reg.isActiveMember(yabanci), "basvuru tek basina uyelik degil");

        reg.admitMember(yabanci);
        assertTrue(reg.isActiveMember(yabanci), "kooperatif karariyla uye oldu");
    }

    function test_UyeGonulluAyrilabilir() public {
        assertEq(reg.activeMemberCount(), 4);
        vm.prank(veli);
        reg.resign();
        assertFalse(reg.isActiveMember(veli));
        assertEq(reg.activeMemberCount(), 3);
    }

    function test_EgitimBelgesiDevredilemez() public {
        sbt.issue(ali, COURSE, "ipfs://sertifika");
        assertTrue(sbt.hasCredential(ali));

        vm.prank(ali);
        vm.expectRevert(EducationSBT.NonTransferable.selector);
        sbt.transferFrom(ali, veli, 0);
    }
}

// ---------------------------------------------------------------------------
//  6. Dagitim matematigi — kusurat kaybolmuyor
// ---------------------------------------------------------------------------
contract DagitimMatematigiTest is CoopBase {
    function testFuzz_ToplamHepsiKorunur(uint96 amount) public {
        vm.assume(amount > 0);
        (uint256 a, uint256 b, uint256 c, uint256 d, uint256 e) = router.preview(amount);
        assertEq(a + b + c + d + e, uint256(amount), "kusurat kayboldu");
    }

    function test_UcUretici_OrantiliDagitim() public {
        _fillPool(50, 30, 20); // toplam 100
        _sell(100, 1 ether);
        uint256 period = vault.closePeriod();

        assertEq(vault.refundOf(period, ali),  25 ether); // 50/100 * 50
        assertEq(vault.refundOf(period, veli), 15 ether); // 30/100 * 50
        assertEq(vault.refundOf(period, ayse), 10 ether); // 20/100 * 50
    }

    function test_AyniUyeIkiKezCekemez() public {
        _fillPool(100, 0, 0);
        _sell(100, 1 ether);
        uint256 period = vault.closePeriod();

        vm.prank(ali); vault.claim(period);
        vm.prank(ali);
        vm.expectRevert(PatronageVault.AlreadyClaimed.selector);
        vault.claim(period);
    }
}
