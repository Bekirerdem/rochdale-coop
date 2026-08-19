# Rochdale Kooperatif Protokolü

Bir kooperatifin üyeliğini, ortak arz havuzunu, satışını ve kâr dağıtımını
zincir üzerinde yürüten açık kaynaklı sözleşme ailesi ve arayüzü.

**Kanıtladığı tek şey:** kâr sermaye payına göre değil, üyenin kooperatifle
yaptığı işlem hacmine göre dağıtılır — ve bu kuralı kurucu bile tek başına
değiştiremez, yalnızca genel kurul değiştirir.

Ömür Demirel'in kavramsal modeli üzerine kurulmuştur.
Mimari ayrıntısı: [`docs/mimari.md`](docs/mimari.md)

## Ne yapabilirsin

Arayüz beş bölümden oluşur ve **zincire yazan her eylem kendi cüzdanınla
imzalanır**:

| Bölüm | Yapabildiklerin |
|---|---|
| **Üyelik** | Üyelik başvurusu gönder, ayrıl; yönetimdeysen başvuruları kabul et |
| **Ortak Havuz** | Havuz aç, ürününü havuza koy, kilitli olmayanı geri çek |
| **Pazar** | Kooperatif adına teklif yayınla, satın al, teslimatı onayla |
| **Risturn** | Dönem paylarını gör, kendi payını çek, şirket modeliyle karşılaştır |
| **Genel Kurul** | Dağıtım oranı teklifi ver, oy kullan, kabul edilen kararı uygula |

Cüzdan bağlamadan da gezebilirsin; tüm veriler zincirden okunur.

## Kurulum

Gereksinimler: [Foundry](https://book.getfoundry.sh/getting-started/installation),
[Bun](https://bun.sh), bir tarayıcı cüzdanı (MetaMask).

```bash
git clone <depo-adresi>
cd rochdale-coop

cd contracts && forge install && forge build && forge test
cd ../app && bun install
```

### Yerel zincirde çalıştırma

Üç terminal:

```bash
# 1) zincir
anvil

# 2) sözleşmeleri kur
cd contracts
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast

# 3) arayüz
cd app && bun run dev
```

Cüzdanına Anvil ağını ekle (RPC `http://127.0.0.1:8545`, zincir kimliği `31337`)
ve dağıtımı yapan hesabı içe aktar — o hesap kooperatif yönetimidir.

Yerel ağda ayrıca bir **Sunum** sekmesi görünür: sekiz adımlı senaryoyu tek
tıkla oynatır, anlatım için hazırlanmıştır.

### Test ağında çalıştırma

Base Sepolia veya Ethereum Sepolia:

```bash
cd contracts
PRIVATE_KEY=0x...  ./deploy-base-sepolia.sh          # Base Sepolia
RPC=https://ethereum-sepolia-rpc.publicnode.com \
PRIVATE_KEY=0x...  ./deploy-base-sepolia.sh          # Ethereum Sepolia
```

Çıktıdaki satırları `app/.env.local` dosyasına yapıştır:

```
VITE_BASE_REGISTRY=0x…
VITE_BASE_POOL=0x…
…
VITE_NET=baseSepolia
```

(Ethereum Sepolia için önek `VITE_SEPOLIA_`.) Arayüzdeki ağ seçici kurulu
ağlar arasında geçiş yapar; işlem bağlantıları blok kâşifine gider.

Test ETH: [Base Sepolia faucet](https://portal.cdp.coinbase.com/products/faucet) ·
[Ethereum Sepolia faucet](https://www.alchemy.com/faucets/ethereum-sepolia)

## Sözleşmeler

| Sözleşme | Sorumluluk |
|----------|------------|
| `CoopRegistry` | Üye kütüğü. Başvuru herkese açık, kabul kooperatif kararı. Oy gücü sabit 1. |
| `SupplyPool` | Ortak arz havuzu. Satış tüm üreticileri payları oranında etkiler. |
| `CoopMarket` | Teklif, emanet, teslimat, mutabakat. Giren para ile dağıtılan para birebir eşittir. |
| `PatronageVault` | Risturn. Dönem bazlı, işlem hacmine orantılı. |
| `TreasuryRouter` | Geliri beş fona böler. Oranları yalnızca oylama değiştirir. |
| `EducationSBT` | Devredilemez eğitim belgesi. Teklif vermenin ön koşulu. |
| `CoopGovernance` | Bir üye bir oy. Oy gücünü artıran fonksiyon yoktur. |

```bash
cd contracts && forge test
```

## Katkı

Katkıya açığız. Başlamadan önce [`CONTRIBUTING.md`](CONTRIBUTING.md) dosyasını
oku — geliştirme ortamı, sözleşme değişikliği beklentileri ve PR düzeni orada.

`good first issue` etiketli konular ilk katkı için ayrılmıştır. Büyük bir
değişiklik planlıyorsan önce bir issue aç.

Sözleşmeler para taşıdığı için iki kural katıdır: **her davranış değişikliği
bir testle gelir**, ve **oy gücünü sermayeye bağlayan öneriler ayrı tartışılır**.

## Bilinçli sınırlar

Bu bir MVP'dir. Kapsam dışı bırakılanlar ve gerekçeleri:

- **Emtia tokenizasyonu / elektronik ürün senedi** — 7518 sayılı Kanun sermaye
  piyasası aracı tokenizasyonunda münhasır yetkiyi SPK'ya verir. Lisans meselesidir.
- **Gerçek Aragon OSx eklentisi** — yönetişim burada bağımsız bir sözleşmedir.
- **Cüzdan soyutlama (passkey)** — kooperatif üyesi cüzdan kullanmaz; ürünleşme
  yolunda ilk çözülmesi gereken sorun budur.
- **Fiziksel teslimat doğrulaması** — teslimat onayı alıcının beyanıdır.

## Lisans

[MIT](LICENSE)
