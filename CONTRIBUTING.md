# Katkı Rehberi

Bu proje kooperatif ilkelerini yazılıma çevirmeye çalışıyor. Aynı ilkeleri
projenin kendi işleyişinde de uygulamak istiyoruz: katkı kapısı herkese açık,
karar süreci görünür, emek görünür kalır.

Türkçe veya İngilizce katkı kabul edilir. Kod ve teknik terimler İngilizce,
açıklama ve yorumlar Türkçe yazılır — mevcut koda bakarak aynı düzeni sürdür.

## Nereden başlanır

Kod yazmaya başlamadan önce şu üçünü okumanı öneririz:

1. `README.md` — projenin ne yaptığı ve nasıl çalıştırılacağı
2. `docs/mimari.md` — sözleşmelerin sorumlulukları ve birbirine nasıl bağlandığı
3. `contracts/test/Coop.t.sol` — sistemin ne vaat ettiği testlerde yazılı

`good first issue` etiketli konular ilk katkı için ayrılmıştır.

## Geliştirme ortamı

```bash
# sözleşmeler
cd contracts
forge build
forge test

# arayüz
cd app
bun install
bun run dev
```

Yerel bir zincire ihtiyacın var:

```bash
anvil
# ayrı terminalde
cd contracts
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

## Değişiklik göndermeden önce

Aşağıdakiler CI'da da çalışır; yerelde geçirmen zaman kazandırır:

```bash
cd contracts && forge test          # tüm testler geçmeli
cd app && bun run build             # tip kontrolü + derleme
```

**Sözleşme değiştirdiysen ABI'leri yeniden dışa aktar:**

```bash
cd contracts && forge build
python - <<'PY'
import json
for c in ['CoopRegistry','SupplyPool','CoopMarket','PatronageVault',
          'TreasuryRouter','EducationSBT','CoopGovernance']:
    d = json.load(open(f'out/{c}.sol/{c}.json'))
    json.dump(d['abi'], open(f'../app/src/chain/{c}.abi.json','w'))
PY
```

## Sözleşme değişikliklerinde beklentiler

Bu sözleşmeler para taşıyor. Katkı gönderirken:

- **Her davranış değişikliği bir testle gelir.** Testsiz sözleşme değişikliği
  birleştirilmez.
- **Erişim kontrolünü açıkça belirt.** Yeni bir dış fonksiyon eklerken kimin
  çağırabileceğini ve neden öyle olduğunu yorumla yaz.
- **Değeri dışarı gönderen kod CEI sırasını korur** — önce durum güncellenir,
  sonra dış çağrı yapılır. `nonReentrant` mevcut kalıba uygun kullanılır.
- **Oy gücünü değiştiren öneriler ayrı tartışılır.** `CoopGovernance` içinde oy
  ağırlığı bilinçli olarak sabit 1'dir; bunu değiştiren bir PR önce bir issue
  üzerinden konuşulmalıdır.
- Gas iyileştirmesi güzeldir ama okunabilirlikten önce gelmez.

## Commit ve dal düzeni

Conventional Commits kullanıyoruz:

```
feat(market): kismi iade destegi
fix(pool): orantili tuketimde kusurat kaybi
docs(readme): base sepolia adimlari
test(vault): cift cekim senaryosu
```

Dal adı: `feat/kisa-aciklama`, `fix/kisa-aciklama`.
Her mantıksal değişiklik ayrı commit olur.

## Pull request

PR açıklamasında şunlar olsun:

- Ne değişti ve neden
- Hangi ilkeyi/işleyişi etkiliyor
- Nasıl test edildi (komut çıktısı yapıştırılabilir)
- Sözleşme değiştiyse: dağıtım gerektiriyor mu?

Küçük PR'lar daha hızlı birleşir. Büyük bir değişiklik planlıyorsan önce issue
aç, yönü birlikte netleştirelim.

## Güvenlik açığı bildirimi

Fon kaybına yol açabilecek bir açık bulursan **issue açma.** Doğrudan proje
sahiplerine yaz; düzeltme yayınlandıktan sonra katkın açıkça belirtilir.

## Kapsam dışı

Aşağıdakiler bilinçli olarak bu deponun dışındadır; PR göndermeden önce konuş:

- Emtia tokenizasyonu ve elektronik ürün senedi entegrasyonu (mevzuat gerektirir)
- Kendi jetonunu çıkarma önerileri — bu protokolün jetonu yok ve olması planlanmıyor
- Oy gücünü sermayeye veya ürün miktarına bağlayan mekanizmalar
