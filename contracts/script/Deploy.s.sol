// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CoopRegistry} from "../src/CoopRegistry.sol";
import {SupplyPool} from "../src/SupplyPool.sol";
import {PatronageVault} from "../src/PatronageVault.sol";
import {TreasuryRouter} from "../src/TreasuryRouter.sol";
import {CoopMarket} from "../src/CoopMarket.sol";
import {EducationSBT} from "../src/EducationSBT.sol";
import {CoopGovernance} from "../src/CoopGovernance.sol";

/// @dev Topluluk / eğitim / yatırım / dayanışma fonlarını temsil eden basit kasa.
///      Gerçek kurulumda bunların yerine Aragon OSx DAO hazinesi konur.
contract CoopTreasury {
    string public label;

    constructor(string memory _label) {
        label = _label;
    }

    receive() external payable {}
}

/// @title Deploy — kurulum ve yetki devri
/// @notice Sıra önemlidir. Sözleşmeler dağıtımı yapan cüzdanın yetkisiyle doğar,
///         bağlantılar ve kurucu kayıtlar o yetkiyle kurulur, EN SON yönetim
///         devredilir. Devir tek yönlüdür; sonrasında dağıtım cüzdanının
///         hiçbir ayrıcalığı kalmaz.
///
/// Ortam değişkenleri:
///   PRIVATE_KEY  — dağıtımı yapacak cüzdan (tek kullanımlık olması önerilir)
///   STEWARD      — kooperatif yönetiminin devredileceği adres (varsayılan: dağıtan)
contract Deploy is Script {
    // Stack derinliğini aşmamak için dağıtılan adresler durumda tutulur.
    CoopRegistry registry;
    EducationSBT sbt;
    PatronageVault vault;
    TreasuryRouter router;
    SupplyPool pool;
    CoopMarket market;
    CoopGovernance gov;

    CoopTreasury community;
    CoopTreasury reinvestment;
    CoopTreasury education;
    CoopTreasury interCoop;

    bytes32 constant COURSE = keccak256("KOOPERATIFCILIK_101");

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address dagitan = vm.addr(pk);
        address yonetim = vm.envOr("STEWARD", dagitan);

        vm.startBroadcast(pk);
        _deployCore(dagitan);
        _wire();
        _seedMembers(dagitan, yonetim);
        _handOver(dagitan, yonetim);
        vm.stopBroadcast();

        _report(yonetim, dagitan);
    }

    function _deployCore(address dagitan) private {
        community = new CoopTreasury("topluluk");
        reinvestment = new CoopTreasury("yeniden-yatirim");
        education = new CoopTreasury("egitim");
        interCoop = new CoopTreasury("dayanisma");

        registry = new CoopRegistry(unicode"Ayvalık Zeytinyağı Kooperatifi", dagitan);
        sbt = new EducationSBT(dagitan);
        vault = new PatronageVault(registry, dagitan);

        router = new TreasuryRouter(
            dagitan,
            address(vault),
            address(community),
            address(reinvestment),
            address(education),
            address(interCoop)
        );

        pool = new SupplyPool(registry, dagitan);
        market = new CoopMarket(registry, pool, vault, router, dagitan);
        gov = new CoopGovernance(registry, sbt);
    }

    /// @dev Pazarın havuzda rezervasyon ve kasada hacim kaydı yapabilmesi için
    ///      gereken yetkiler. Yönetim devrinden ÖNCE kurulmalıdır.
    function _wire() private {
        pool.setMarketOperator(address(market), true);
        vault.setRecorder(address(market), true);
    }

    /// @dev Kurucu ortaklar kütüğe işlenir ve eğitim belgesi alır; böylece
    ///      kurulumdan hemen sonra havuz açılabilir ve teklif verilebilir.
    ///      Yönetim adresi dağıtandan farklıysa o da kurucu ortak olur —
    ///      aksi halde yönetici kendi kooperatifinde işlem yapamazdı.
    function _seedMembers(address dagitan, address yonetim) private {
        registry.stewardAdmit(dagitan, registry.ROLE_PRODUCER(), "ipfs://uye/kurucu");
        sbt.issue(dagitan, COURSE, "ipfs://sertifika/kurucu");

        if (yonetim != dagitan) {
            registry.stewardAdmit(yonetim, registry.ROLE_PRODUCER(), "ipfs://uye/yonetim");
            sbt.issue(yonetim, COURSE, "ipfs://sertifika/yonetim");
        }
    }

    /// @dev Yönetimi hedef adrese GERİ ALINAMAZ biçimde devreder.
    ///      Dağıtım oranları doğrudan genel kurula (CoopGovernance) kilitlenir —
    ///      kooperatifin anayasası olduğu için ilk kilitlenmesi gereken yer orasıdır.
    function _handOver(address dagitan, address yonetim) private {
        router.lockGovernance(address(gov));

        if (yonetim != dagitan) {
            registry.lockGovernance(yonetim);
            pool.lockGovernance(yonetim);
            vault.lockGovernance(yonetim);
            market.lockGovernance(yonetim);
            sbt.lockGovernance(yonetim);
        }
    }

    function _report(address yonetim, address dagitan) private view {
        console.log("");
        console.log("=== ROCHDALE KOOPERATIF PROTOKOLU ===");
        console.log("CoopRegistry   :", address(registry));
        console.log("SupplyPool     :", address(pool));
        console.log("CoopMarket     :", address(market));
        console.log("PatronageVault :", address(vault));
        console.log("TreasuryRouter :", address(router));
        console.log("EducationSBT   :", address(sbt));
        console.log("CoopGovernance :", address(gov));
        console.log("--- fonlar ---");
        console.log("Topluluk       :", address(community));
        console.log("YenidenYatirim :", address(reinvestment));
        console.log("Egitim         :", address(education));
        console.log("Dayanisma      :", address(interCoop));
        console.log("");
        console.log("Kooperatif yonetimi :", yonetim);
        console.log("Dagitimi yapan      :", dagitan);
        if (yonetim != dagitan) {
            console.log("Yonetim devredildi; dagitim cuzdaninin yetkisi kalmadi.");
        } else {
            console.log("Yonetim dagitim cuzdaninda. Uretimde STEWARD ile ayirin.");
        }
        console.log("Dagitim oranlari kalici olarak genel kurula kilitlendi.");
    }
}
