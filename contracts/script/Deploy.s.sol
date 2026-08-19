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
    constructor(string memory _label) { label = _label; }
    receive() external payable {}
}

/// @title Deploy — kurulum ve yetki devri
/// @notice Sıra önemlidir: sözleşmeler kurucu yetkisiyle doğar, bağlantılar kurulur,
///         en son yönetim GERİ ALINAMAZ biçimde üye oylamasına kilitlenir.
contract Deploy is Script {
    // Stack derinliğini aşmamak için dağıtılan adresler durumda tutulur.
    CoopRegistry   registry;
    EducationSBT   sbt;
    PatronageVault vault;
    TreasuryRouter router;
    SupplyPool     pool;
    CoopMarket     market;
    CoopGovernance gov;

    CoopTreasury community;
    CoopTreasury reinvestment;
    CoopTreasury education;
    CoopTreasury interCoop;

    bytes32 constant COURSE = keccak256("KOOPERATIFCILIK_101");

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        _deployCore(deployer);
        _wire();
        _seedMembers(deployer);
        vm.stopBroadcast();

        _report();
    }

    function _deployCore(address deployer) private {
        community    = new CoopTreasury("topluluk");
        reinvestment = new CoopTreasury("yeniden-yatirim");
        education    = new CoopTreasury("egitim");
        interCoop    = new CoopTreasury("dayanisma");

        registry = new CoopRegistry(unicode"Ayvalık Zeytinyağı Kooperatifi", deployer);
        sbt      = new EducationSBT(deployer);
        vault    = new PatronageVault(registry, deployer);

        router = new TreasuryRouter(
            deployer,
            address(vault),
            address(community),
            address(reinvestment),
            address(education),
            address(interCoop)
        );

        pool   = new SupplyPool(registry, deployer);
        market = new CoopMarket(registry, pool, vault, router, deployer);
        gov    = new CoopGovernance(registry, sbt);
    }

    function _wire() private {
        pool.setMarketOperator(address(market), true);
        vault.setRecorder(address(market), true);
    }

    function _seedMembers(address deployer) private {
        address[4] memory founders = [
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8, // Ali   — uretici
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, // Veli  — uretici
            0x90F79bf6EB2c4f870365E785982E1f101E93b906, // Ayse  — uretici
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  // Alici — toptanci
        ];

        registry.stewardAdmit(deployer, registry.ROLE_PRODUCER(), "ipfs://uye/kurucu");
        sbt.issue(deployer, COURSE, "ipfs://sertifika/kurucu");

        for (uint256 i = 0; i < 4; i++) {
            bytes32 role = i == 3 ? registry.ROLE_CONSUMER() : registry.ROLE_PRODUCER();
            registry.stewardAdmit(founders[i], role, "ipfs://uye");
            if (i < 3) sbt.issue(founders[i], COURSE, "ipfs://sertifika");
        }

        // Sermaye payları — SADECE karşılaştırma tablosu için, oy gücü DEĞİL.
        registry.recordCapital(founders[0], 10_000);  // Ali:  az sermaye, çok emek
        registry.recordCapital(founders[1], 90_000);  // Veli: çok sermaye, az emek

        // Dağıtım oranları — kooperatifin "anayasası" — kurucudan alınıp kalıcı
        // olarak üye oylamasına devredilir. Bu andan sonra risturn payını
        // kurucu bile tek başına değiştiremez; yalnızca genel kurul kararı değiştirir.
        router.lockGovernance(address(gov));
    }

    function _report() private view {
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
        console.log("NOT: yonetim kilidi (lockGovernance) demo icin BILINCLI atilmadi.");
        console.log("Gercek kurulumda kilit son adimdir ve geri alinamaz.");
    }
}
