// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CoopRegistry} from "./CoopRegistry.sol";
import {SupplyPool} from "./SupplyPool.sol";
import {PatronageVault} from "./PatronageVault.sol";
import {TreasuryRouter} from "./TreasuryRouter.sol";

/// @title CoopMarket — Kooperatif Pazarı ve Emanet
/// @notice Ortak havuzdaki ürünün satışını, bedelin emanette tutulmasını ve
///         teslimat sonrası gelirin kooperatif kurallarına göre dağıtılmasını yürütür.
/// @dev Boson Protocol'ün teklif → emanet → teslim → mutabakat akışı referans alınmış,
///      ancak dışarıya bağımlılık olmadan kooperatifin kendi sözleşmesinde kurulmuştur.
///      Alıcının ödediği para bu sözleşmede durur ve teslimat onayında TAM OLARAK
///      buradan dağıtıma çıkar — ikinci bir ödeme kaynağı yoktur.
contract CoopMarket {
    enum ExchangeState {
        None,
        Escrowed,   // bedel emanette, teslimat bekleniyor
        Completed,  // teslim onaylandı, gelir dağıtıldı
        Refunded    // iptal edildi, bedel alıcıya iade edildi
    }

    struct Offer {
        address seller;
        uint256 poolId;
        uint256 pricePerUnit;
        uint256 reservedUnits;   // havuzda bu teklif için kilitlenen toplam
        uint256 remainingUnits;  // henüz satılmamış kısım
        bool open;
        string metadataURI;
    }

    struct Exchange {
        uint256 offerId;
        address buyer;
        uint256 units;
        uint256 amount;        // emanetteki bedel
        uint256 escrowedAt;
        ExchangeState state;
    }

    CoopRegistry public immutable registry;
    SupplyPool public immutable supplyPool;
    PatronageVault public immutable patronageVault;
    TreasuryRouter public immutable treasuryRouter;

    address public steward;
    bool public governanceLocked;

    /// @notice Alıcı bu süre içinde teslimatı onaylamazsa satış kendiliğinden kesinleşir.
    /// @dev Boson'un iyimser (optimistic) mutabakat modeli: itiraz gelmezse işlem başarılıdır.
    uint256 public deliveryWindow = 7 days;

    uint256 public offerCount;
    uint256 public exchangeCount;
    mapping(uint256 => Offer) public offers;
    mapping(uint256 => Exchange) public exchanges;

    uint256 public totalEscrowed;
    uint256 private _locked = 1;

    event OfferCreated(uint256 indexed offerId, address indexed seller, uint256 indexed poolId, uint256 units, uint256 pricePerUnit);
    event OfferClosed(uint256 indexed offerId, uint256 releasedUnits);
    event Escrowed(uint256 indexed exchangeId, uint256 indexed offerId, address indexed buyer, uint256 units, uint256 amount);
    event Settled(uint256 indexed exchangeId, uint256 amount, uint256 producerCount);
    event Refunded(uint256 indexed exchangeId, address indexed buyer, uint256 amount);
    event DeliveryWindowUpdated(uint256 newWindow);
    event GovernanceLocked(address indexed governance);

    error OnlySteward();
    error OnlyMember();
    error OnlySeller();
    error OnlyBuyer();
    error AlreadyLocked();
    error ZeroAddress();
    error ZeroUnits();
    error OfferNotOpen();
    error NotEnoughUnits();
    error WrongPayment(uint256 expected, uint256 sent);
    error NotEscrowed();
    error WindowNotElapsed();
    error TransferFailed();
    error Reentrancy();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        CoopRegistry _registry,
        SupplyPool _supplyPool,
        PatronageVault _patronageVault,
        TreasuryRouter _treasuryRouter,
        address _steward
    ) {
        if (_steward == address(0)) revert ZeroAddress();
        registry = _registry;
        supplyPool = _supplyPool;
        patronageVault = _patronageVault;
        treasuryRouter = _treasuryRouter;
        steward = _steward;
    }

    function lockGovernance(address governance) external onlySteward {
        if (governanceLocked) revert AlreadyLocked();
        if (governance == address(0)) revert ZeroAddress();
        steward = governance;
        governanceLocked = true;
        emit GovernanceLocked(governance);
    }

    function setDeliveryWindow(uint256 newWindow) external onlySteward {
        deliveryWindow = newWindow;
        emit DeliveryWindowUpdated(newWindow);
    }

    // ---------------------------------------------------------------- teklif

    /// @notice Kooperatif adına havuzdaki ürün için satış teklifi açar.
    /// @dev Teklifi açan kişi kendi ürününü değil, HAVUZUN ürününü satar; gelir
    ///      tek bir satıcıya değil, havuza katkı veren tüm üreticilere dağılır.
    function createOffer(uint256 poolId, uint256 units, uint256 pricePerUnit, string calldata metadataURI)
        external
        returns (uint256 offerId)
    {
        if (!registry.isActiveMember(msg.sender)) revert OnlyMember();
        if (units == 0 || pricePerUnit == 0) revert ZeroUnits();

        supplyPool.reserveUnits(poolId, units);

        offerId = ++offerCount;
        offers[offerId] = Offer({
            seller: msg.sender,
            poolId: poolId,
            pricePerUnit: pricePerUnit,
            reservedUnits: units,
            remainingUnits: units,
            open: true,
            metadataURI: metadataURI
        });

        emit OfferCreated(offerId, msg.sender, poolId, units, pricePerUnit);
    }

    /// @notice Teklifi kapatır ve satılmamış birimleri havuza geri bırakır.
    function closeOffer(uint256 offerId) external {
        Offer storage o = offers[offerId];
        if (!o.open) revert OfferNotOpen();
        if (msg.sender != o.seller && msg.sender != steward) revert OnlySeller();

        uint256 toRelease = o.remainingUnits;
        o.open = false;
        o.remainingUnits = 0;

        if (toRelease > 0) supplyPool.releaseUnits(o.poolId, toRelease);
        emit OfferClosed(offerId, toRelease);
    }

    // ---------------------------------------------------------------- emanet

    /// @notice Alıcı bedeli öder; para teslimat onayına kadar bu sözleşmede emanettedir.
    function buy(uint256 offerId, uint256 units)
        external
        payable
        nonReentrant
        returns (uint256 exchangeId)
    {
        Offer storage o = offers[offerId];
        if (!o.open) revert OfferNotOpen();
        if (units == 0) revert ZeroUnits();
        if (units > o.remainingUnits) revert NotEnoughUnits();

        uint256 price = units * o.pricePerUnit;
        if (msg.value != price) revert WrongPayment(price, msg.value);

        o.remainingUnits -= units;
        totalEscrowed += msg.value;

        exchangeId = ++exchangeCount;
        exchanges[exchangeId] = Exchange({
            offerId: offerId,
            buyer: msg.sender,
            units: units,
            amount: msg.value,
            escrowedAt: block.timestamp,
            state: ExchangeState.Escrowed
        });

        emit Escrowed(exchangeId, offerId, msg.sender, units, msg.value);
    }

    /// @notice Alıcı teslimatı onaylar; gelir kooperatif kurallarına göre dağıtılır.
    function confirmDelivery(uint256 exchangeId) external nonReentrant {
        Exchange storage e = exchanges[exchangeId];
        if (e.state != ExchangeState.Escrowed) revert NotEscrowed();
        if (msg.sender != e.buyer) revert OnlyBuyer();
        _settle(exchangeId, e);
    }

    /// @notice Teslimat süresi itirazsız dolduysa satışı kesinleştirir.
    /// @dev Herkes çağırabilir — satıcının parasının alıcının sessizliğine takılmasını önler.
    function finalizeExpired(uint256 exchangeId) external nonReentrant {
        Exchange storage e = exchanges[exchangeId];
        if (e.state != ExchangeState.Escrowed) revert NotEscrowed();
        if (block.timestamp < e.escrowedAt + deliveryWindow) revert WindowNotElapsed();
        _settle(exchangeId, e);
    }

    /// @notice Satıcı veya kooperatif kararı ile bedel alıcıya iade edilir.
    function refund(uint256 exchangeId) external nonReentrant {
        Exchange storage e = exchanges[exchangeId];
        if (e.state != ExchangeState.Escrowed) revert NotEscrowed();

        Offer storage o = offers[e.offerId];
        if (msg.sender != o.seller && msg.sender != steward) revert OnlySeller();

        e.state = ExchangeState.Refunded;
        totalEscrowed -= e.amount;

        // Satılamayan birimler havuza geri döner.
        supplyPool.releaseUnits(o.poolId, e.units);

        (bool ok,) = payable(e.buyer).call{value: e.amount}("");
        if (!ok) revert TransferFailed();

        emit Refunded(exchangeId, e.buyer, e.amount);
    }

    // ---------------------------------------------------------------- görünümler

    function isFinalizable(uint256 exchangeId) external view returns (bool) {
        Exchange storage e = exchanges[exchangeId];
        return e.state == ExchangeState.Escrowed && block.timestamp >= e.escrowedAt + deliveryWindow;
    }

    // ---------------------------------------------------------------- iç

    /// @dev Emanetteki bedeli üretici paylarına ve gelir dağıtımına bağlar.
    ///      Sıra önemlidir: önce durum güncellenir, sonra dış çağrılar yapılır.
    function _settle(uint256 exchangeId, Exchange storage e) private {
        e.state = ExchangeState.Completed;
        uint256 amount = e.amount;
        totalEscrowed -= amount;

        Offer storage o = offers[e.offerId];

        // Havuzdaki rezerv tüketilir; hangi üreticiden ne kadar çıktığı geri döner.
        SupplyPool.ConsumedShare[] memory shares =
            supplyPool.consumeReservedUnits(o.poolId, e.units);

        // Her üreticinin işlem hacmi risturn kasasına yazılır.
        for (uint256 i = 0; i < shares.length; i++) {
            patronageVault.recordPatronage(shares[i].producer, shares[i].units);
        }

        // Emanetteki bedelin tamamı dağıtıma çıkar.
        treasuryRouter.routeRevenue{value: amount}();

        emit Settled(exchangeId, amount, shares.length);
    }
}
