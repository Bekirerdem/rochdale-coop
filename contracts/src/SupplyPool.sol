// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CoopRegistry} from "./CoopRegistry.sol";

/// @title SupplyPool — Ortak Arz Havuzu
/// @notice Üreticiler ürünlerini bireysel olarak değil ortak havuza koyar; satış
///         gerçekleştiğinde havuzdaki paylar ORANTILI olarak tüketilir.
/// @dev Orantılı tüketim bilinçli bir tercihtir: sıraya göre (FIFO) tüketim, havuza
///      önce giren üreticiye avantaj sağlar ve kolektif arz fikrini bozar. Burada
///      her satış, tüm üreticileri payları oranında etkiler.
contract SupplyPool {
    struct Pool {
        bool active;
        string metadataURI;   // ürün tanımı: hasat yılı, menşe, asitlik
        uint256 unitPrice;    // birim (litre) fiyatı, wei
        uint256 totalUnits;   // havuzdaki toplam
        uint256 reservedUnits;// satışa kilitlenmiş
    }

    struct ConsumedShare {
        address producer;
        uint256 units;
    }

    /// @dev Rezervasyon döngüsünün gas sınırında kalması için havuz başına üretici tavanı.
    uint256 public constant MAX_PRODUCERS_PER_POOL = 250;

    CoopRegistry public immutable registry;
    address public steward;
    bool public governanceLocked;

    uint256 public poolCount;
    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => uint256)) public unitsOf;      // toplam katkı
    mapping(uint256 => mapping(address => uint256)) public reservedOf;   // kilitli kısım
    mapping(uint256 => address[]) private _producers;
    mapping(uint256 => mapping(address => bool)) private _isProducer;

    mapping(address => bool) public marketOperators;

    event PoolCreated(uint256 indexed poolId, address indexed creator, string metadataURI, uint256 unitPrice);
    event UnitsAdded(uint256 indexed poolId, address indexed producer, uint256 units);
    event UnitsWithdrawn(uint256 indexed poolId, address indexed producer, uint256 units);
    event UnitsReserved(uint256 indexed poolId, uint256 units);
    event UnitsReleased(uint256 indexed poolId, uint256 units);
    event UnitsConsumed(uint256 indexed poolId, address indexed producer, uint256 units);
    event MarketOperatorSet(address indexed operator, bool allowed);
    event GovernanceLocked(address indexed governance);

    error OnlySteward();
    error OnlyMarketOperator();
    error OnlyMember();
    error AlreadyLocked();
    error ZeroAddress();
    error PoolInactive();
    error ZeroUnits();
    error InsufficientAvailable();
    error InsufficientReserved();
    error TooManyProducers();

    modifier onlySteward() {
        if (msg.sender != steward) revert OnlySteward();
        _;
    }

    modifier onlyMarketOperator() {
        if (!marketOperators[msg.sender]) revert OnlyMarketOperator();
        _;
    }

    modifier onlyMember() {
        if (!registry.isActiveMember(msg.sender)) revert OnlyMember();
        _;
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

    function setMarketOperator(address operator, bool allowed) external onlySteward {
        marketOperators[operator] = allowed;
        emit MarketOperatorSet(operator, allowed);
    }

    // ---------------------------------------------------------------- havuz

    function createPool(string calldata metadataURI, uint256 unitPrice)
        external
        onlyMember
        returns (uint256 poolId)
    {
        if (unitPrice == 0) revert ZeroUnits();
        poolId = ++poolCount;
        pools[poolId] = Pool({
            active: true,
            metadataURI: metadataURI,
            unitPrice: unitPrice,
            totalUnits: 0,
            reservedUnits: 0
        });
        emit PoolCreated(poolId, msg.sender, metadataURI, unitPrice);
    }

    function addUnits(uint256 poolId, uint256 units) external onlyMember {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (units == 0) revert ZeroUnits();

        if (!_isProducer[poolId][msg.sender]) {
            if (_producers[poolId].length >= MAX_PRODUCERS_PER_POOL) revert TooManyProducers();
            _isProducer[poolId][msg.sender] = true;
            _producers[poolId].push(msg.sender);
        }

        unitsOf[poolId][msg.sender] += units;
        p.totalUnits += units;
        emit UnitsAdded(poolId, msg.sender, units);
    }

    /// @notice Üretici, satışa kilitlenmemiş ürününü havuzdan geri çekebilir.
    function withdrawUnits(uint256 poolId, uint256 units) external {
        uint256 free = unitsOf[poolId][msg.sender] - reservedOf[poolId][msg.sender];
        if (units == 0) revert ZeroUnits();
        if (units > free) revert InsufficientAvailable();

        unitsOf[poolId][msg.sender] -= units;
        pools[poolId].totalUnits -= units;
        emit UnitsWithdrawn(poolId, msg.sender, units);
    }

    // ---------------------------------------------------------------- rezervasyon

    function availableUnits(uint256 poolId) public view returns (uint256) {
        Pool storage p = pools[poolId];
        return p.totalUnits - p.reservedUnits;
    }

    function reserveUnits(uint256 poolId, uint256 units) external onlyMarketOperator {
        Pool storage p = pools[poolId];
        if (units == 0) revert ZeroUnits();
        uint256 free = p.totalUnits - p.reservedUnits;
        if (units > free) revert InsufficientAvailable();

        _distribute(poolId, units, free, true);
        p.reservedUnits += units;
        emit UnitsReserved(poolId, units);
    }

    function releaseUnits(uint256 poolId, uint256 units) external onlyMarketOperator {
        Pool storage p = pools[poolId];
        if (units == 0) revert ZeroUnits();
        if (units > p.reservedUnits) revert InsufficientReserved();

        _distribute(poolId, units, p.reservedUnits, false);
        p.reservedUnits -= units;
        emit UnitsReleased(poolId, units);
    }

    /// @notice Satış kesinleşince rezerve birimleri tüketir ve üretici paylarını döndürür.
    /// @return shares Yalnızca gerçekten tüketilen üreticiler — boş kayıt DÖNMEZ.
    function consumeReservedUnits(uint256 poolId, uint256 units)
        external
        onlyMarketOperator
        returns (ConsumedShare[] memory shares)
    {
        Pool storage p = pools[poolId];
        if (units == 0) revert ZeroUnits();
        if (units > p.reservedUnits) revert InsufficientReserved();

        address[] memory list = _producers[poolId];
        shares = new ConsumedShare[](list.length);
        uint256 filled;

        uint256 basis = p.reservedUnits;
        uint256 remaining = units;

        // 1. geçiş — orantılı pay
        for (uint256 i = 0; i < list.length && remaining > 0; i++) {
            address producer = list[i];
            uint256 res = reservedOf[poolId][producer];
            if (res == 0) continue;

            uint256 take = (units * res) / basis;
            if (take > remaining) take = remaining;
            if (take == 0) continue;

            reservedOf[poolId][producer] = res - take;
            unitsOf[poolId][producer] -= take;
            remaining -= take;

            shares[filled] = ConsumedShare({producer: producer, units: take});
            filled++;
            emit UnitsConsumed(poolId, producer, take);
        }

        // 2. geçiş — bölmeden kalan küsuratı sırayla dağıt
        for (uint256 i = 0; i < list.length && remaining > 0; i++) {
            address producer = list[i];
            uint256 res = reservedOf[poolId][producer];
            if (res == 0) continue;

            uint256 take = res > remaining ? remaining : res;
            reservedOf[poolId][producer] = res - take;
            unitsOf[poolId][producer] -= take;
            remaining -= take;

            // Aynı üretici 1. geçişte de pay almış olabilir; kaydı birleştir.
            bool merged;
            for (uint256 j = 0; j < filled; j++) {
                if (shares[j].producer == producer) {
                    shares[j].units += take;
                    merged = true;
                    break;
                }
            }
            if (!merged) {
                shares[filled] = ConsumedShare({producer: producer, units: take});
                filled++;
            }
            emit UnitsConsumed(poolId, producer, take);
        }

        p.reservedUnits -= units;
        p.totalUnits -= units;

        // Diziyi gerçek uzunluğa kısalt — boş (address(0), 0) kaydı dışarı sızmaz.
        assembly {
            mstore(shares, filled)
        }
    }

    // ---------------------------------------------------------------- görünümler

    function producersOf(uint256 poolId) external view returns (address[] memory) {
        return _producers[poolId];
    }

    function producerCount(uint256 poolId) external view returns (uint256) {
        return _producers[poolId].length;
    }

    function freeUnitsOf(uint256 poolId, address producer) external view returns (uint256) {
        return unitsOf[poolId][producer] - reservedOf[poolId][producer];
    }

    // ---------------------------------------------------------------- iç

    /// @dev reserve=true ise serbest birimlerden kilitler, false ise kilidi çözer.
    function _distribute(uint256 poolId, uint256 units, uint256 basis, bool reserve) private {
        address[] memory list = _producers[poolId];
        uint256 remaining = units;

        for (uint256 i = 0; i < list.length && remaining > 0; i++) {
            address producer = list[i];
            uint256 pool_ = reserve
                ? unitsOf[poolId][producer] - reservedOf[poolId][producer]
                : reservedOf[poolId][producer];
            if (pool_ == 0) continue;

            uint256 take = (units * pool_) / basis;
            if (take > remaining) take = remaining;
            if (take == 0) continue;

            if (reserve) reservedOf[poolId][producer] += take;
            else reservedOf[poolId][producer] -= take;
            remaining -= take;
        }

        for (uint256 i = 0; i < list.length && remaining > 0; i++) {
            address producer = list[i];
            uint256 pool_ = reserve
                ? unitsOf[poolId][producer] - reservedOf[poolId][producer]
                : reservedOf[poolId][producer];
            if (pool_ == 0) continue;

            uint256 take = pool_ > remaining ? remaining : pool_;
            if (reserve) reservedOf[poolId][producer] += take;
            else reservedOf[poolId][producer] -= take;
            remaining -= take;
        }
    }
}
