// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CoopRegistry} from "./CoopRegistry.sol";

/// @title PatronageVault — Risturn Kasası
/// @notice Rochdale 3. ilke: üyelerin ekonomik katılımı. Kâr sermaye payına göre
///         DEĞİL, üyenin kooperatifle yaptığı işlem hacmine göre dağıtılır.
/// @dev Kooperatifi şirketten ayıran tek finansal mekanizma budur. Hesap dönem
///      bazlıdır: dönem içinde hacim ve gelir birikir, dönem kapanınca paylar sabitlenir.
contract PatronageVault {
    struct Period {
        uint256 totalUnits;   // dönem içinde kaydedilen toplam işlem hacmi
        uint256 revenue;      // dönemin risturn matrahı (wei)
        uint256 claimed;      // çekilen toplam
        bool closed;
    }

    CoopRegistry public immutable registry;
    address public steward;
    bool public governanceLocked;

    uint256 public currentPeriod = 1;
    mapping(uint256 => Period) public periods;
    mapping(uint256 => mapping(address => uint256)) public unitsOf;     // dönem → üye → hacim
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    mapping(address => bool) public recorders;

    uint256 private _locked = 1;

    event RecorderSet(address indexed recorder, bool allowed);
    event PatronageRecorded(uint256 indexed period, address indexed member, uint256 units, uint256 total);
    event RevenueReceived(uint256 indexed period, uint256 amount, uint256 total);
    event PeriodClosed(uint256 indexed period, uint256 totalUnits, uint256 revenue);
    event RefundClaimed(uint256 indexed period, address indexed member, uint256 amount);
    event GovernanceLocked(address indexed governance);

    error OnlySteward();
    error OnlyRecorder();
    error AlreadyLocked();
    error ZeroAddress();
    error ZeroUnits();
    error NoRevenue();
    error PeriodNotClosed();
    error PeriodAlreadyClosed();
    error NothingToClaim();
    error AlreadyClaimed();
    error TransferFailed();
    error Reentrancy();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    modifier onlyRecorder() {
        if (!recorders[msg.sender]) revert OnlyRecorder();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(CoopRegistry _registry, address _steward) {
        if (address(_registry) == address(0) || _steward == address(0)) revert ZeroAddress();
        registry = _registry;
        steward = _steward;
    }

    function lockGovernance(address governance) external onlySteward {
        if (governanceLocked) revert AlreadyLocked();
        if (governance == address(0)) revert ZeroAddress();
        steward = governance;
        governanceLocked = true;
        emit GovernanceLocked(governance);
    }

    function setRecorder(address recorder, bool allowed) external onlySteward {
        recorders[recorder] = allowed;
        emit RecorderSet(recorder, allowed);
    }

    // ---------------------------------------------------------------- kayıt

    /// @notice Üyenin kooperatifle yaptığı işlem hacmini döneme işler.
    /// @dev Satış kesinleştiğinde CoopMarket tarafından çağrılır.
    ///
    ///      Burada BİLEREK üyelik kontrolü yapılmaz. Hak, ürün havuza konduğu
    ///      anda doğar; üretici sonradan ayrılsa bile emeğinin karşılığı durur.
    ///      Kontrol konulduğunda, havuza katkı vermiş tek bir üyenin ayrılması
    ///      o havuzdan yapılan satışı kilitliyor ve alıcının bedeli emanette
    ///      hapsoluyordu.
    function recordPatronage(address member, uint256 units) external onlyRecorder {
        if (units == 0) revert ZeroUnits();
        if (member == address(0)) revert ZeroAddress();

        Period storage p = periods[currentPeriod];
        if (p.closed) revert PeriodAlreadyClosed();

        unitsOf[currentPeriod][member] += units;
        p.totalUnits += units;
        emit PatronageRecorded(currentPeriod, member, units, p.totalUnits);
    }

    /// @notice Risturn matrahını alır. TreasuryRouter buraya gönderir.
    receive() external payable {
        Period storage p = periods[currentPeriod];
        p.revenue += msg.value;
        emit RevenueReceived(currentPeriod, msg.value, p.revenue);
    }

    // ---------------------------------------------------------------- dönem

    /// @notice Dönemi kapatır; paylar bu andan itibaren sabittir ve çekilebilir.
    function closePeriod() external onlySteward returns (uint256 closedPeriod) {
        Period storage p = periods[currentPeriod];
        if (p.closed) revert PeriodAlreadyClosed();
        if (p.revenue == 0) revert NoRevenue();
        if (p.totalUnits == 0) revert ZeroUnits();

        p.closed = true;
        closedPeriod = currentPeriod;
        emit PeriodClosed(closedPeriod, p.totalUnits, p.revenue);
        currentPeriod += 1;
    }

    /// @notice Üyenin dönemde hak ettiği risturn — çekmiş olsa da değişmez.
    /// @dev Muhasebe kaydıdır: geçmişe dönük hesap sorulabilsin diye çekim
    ///      sonrası da aynı tutarı döndürür.
    function entitlementOf(uint256 period, address member) public view returns (uint256) {
        Period storage p = periods[period];
        if (!p.closed || p.totalUnits == 0) return 0;
        return (unitsOf[period][member] * p.revenue) / p.totalUnits;
    }

    /// @notice Üyenin şu an çekebileceği tutar — çekildiyse sıfırdır.
    function refundOf(uint256 period, address member) public view returns (uint256) {
        if (hasClaimed[period][member]) return 0;
        return entitlementOf(period, member);
    }

    function claim(uint256 period) external nonReentrant {
        Period storage p = periods[period];
        if (!p.closed) revert PeriodNotClosed();
        if (hasClaimed[period][msg.sender]) revert AlreadyClaimed();

        uint256 amount = (unitsOf[period][msg.sender] * p.revenue) / p.totalUnits;
        if (amount == 0) revert NothingToClaim();

        hasClaimed[period][msg.sender] = true;
        p.claimed += amount;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RefundClaimed(period, msg.sender, amount);
    }

    // Not: Bölmeden kalan küsurat (wei mertebesinde) kasada bırakılır ve bir
    // sonraki dönemin matrahına eklenir. Küsuratı dışarı aktaran bir fonksiyon
    // BİLEREK yoktur: "kalan" hesabı, üyeler paylarını çekmeden çağrıldığında
    // dönemin tüm gelirini boşaltmaya yarıyordu.

    // ---------------------------------------------------------------- karşılaştırma

    /// @notice Aynı dönemin gelirini SERMAYE PAYINA göre dağıtsaydık üye ne alırdı?
    /// @dev Hiçbir para hareketi yapmaz. Sunumda kooperatif ile şirket modelini
    ///      yan yana göstermek için vardır — projenin tezini tek satırda kanıtlar.
    function capitalModelShareOf(uint256 period, address member) external view returns (uint256) {
        Period storage p = periods[period];
        uint256 totalCapital = registry.totalCapital();
        if (!p.closed || totalCapital == 0) return 0;
        return (registry.capitalOf(member) * p.revenue) / totalCapital;
    }
}
