# Mimari

Sistem yedi sözleşmeden oluşur. Her biri tek bir sorumluluk taşır ve
diğerlerine yalnızca ihtiyaç duyduğu kadarıyla bağlıdır.

```
                    CoopRegistry
                 (kim ortak, oy gücü 1)
                    ▲    ▲    ▲
                    │    │    │
        SupplyPool ─┘    │    └─ CoopGovernance ── EducationSBT
      (ortak arz havuzu) │        (bir üye bir oy)   (eğitim belgesi)
              ▲          │               │
              │          │               │ steward
          CoopMarket ────┘               ▼
        (teklif · emanet)          TreasuryRouter
              │                   (geliri beşe böler)
              │ tüketim + hacim          │
              ▼                          ▼
        PatronageVault ◄─────────── risturn payı
        (hacme göre risturn)
```

## Sorumluluklar

**CoopRegistry** — üye kütüğü. Üyelik iki aşamalıdır: herkes
`requestMembership` ile başvurabilir (Rochdale 1), kütüğe geçiş kooperatif
kararıyla olur. Bu, açık üyelik ile Sybil direncini birlikte tutmanın yoludur:
kapı herkese açıktır ama arkasında bir karar vardır.

`votingPower()` her aktif üye için sabit `1` döner. `capital` alanı yalnızca
kayıt amaçlıdır ve yönetişimde hiçbir ağırlığı yoktur — varlığının tek sebebi,
"şirket modeli olsaydı ne olurdu" karşılaştırmasını üretebilmektir.

**SupplyPool** — ortak arz havuzu. Üreticiler ürünlerini bireysel olarak değil
havuza koyar. Satış gerçekleştiğinde tüketim **orantılıdır**: her üretici
payı oranında etkilenir. Sıraya göre (FIFO) tüketim bilinçli olarak
reddedilmiştir; erken gelen üreticiye avantaj sağlar ve kolektif arz fikrini
bozardı.

**CoopMarket** — teklif, emanet, teslimat, mutabakat. Boson Protocol'ün
akış mantığı referans alınmış, ancak dış bağımlılık olmadan kurulmuştur.
Alıcının ödediği bedel bu sözleşmede durur ve teslimat onayında **tam olarak
buradan** dağıtıma çıkar; ikinci bir ödeme kaynağı yoktur. Alıcı sessiz
kalırsa `finalizeExpired` ile satış kendiliğinden kesinleşir (iyimser
mutabakat) — üreticinin parası alıcının ihmaline takılmaz.

**PatronageVault** — risturn. Kooperatifi şirketten ayıran tek finansal
mekanizma budur. Hesap dönem bazlıdır: dönem içinde hacim ve gelir birikir,
`closePeriod` ile paylar sabitlenir, üyeler `claim` ile çeker. Pay formülü:

```
pay = (üyenin dönem hacmi × dönem geliri) / dönemin toplam hacmi
```

`capitalModelShareOf` aynı geliri sermaye payına göre böler — hiçbir para
hareketi yapmaz, yalnızca karşılaştırma içindir.

**TreasuryRouter** — geliri beş fona böler: risturn, topluluk fonu, yeniden
yatırım, eğitim, kooperatifler arası dayanışma. Oranlar sabit değildir;
`setPolicy` yalnızca `steward` tarafından çağrılabilir ve kurulumda steward
`CoopGovernance` olur. Yani dağıtım oranı bir yönetim kararı değil, genel
kurul kararıdır.

**EducationSBT** — devredilemez eğitim belgesi (Rochdale 5). Teklif verebilmenin
ön koşuludur: kooperatifin geleceğini şekillendirmek için önce onu anlamak
gerekir. `transferFrom` bilinçli olarak revert eder.

**CoopGovernance** — bir üye bir oy (Rochdale 2). `castVote` içinde oy ağırlığı
sabit `1`'dir ve bu sözleşmede oy gücünü artıran hiçbir fonksiyon yoktur.
Yeter sayı, teklif açıldığı andaki aktif üye sayısının yüzdesi olarak
hesaplanır. Kendi parametrelerini yalnızca `onlySelf` ile değiştirir — yani
ancak bir üye oylamasıyla.

## Yetki devri

Sözleşmeler kurucu yetkisiyle doğar, bağlantılar kurulur, sonra yetki
**geri alınamaz** biçimde yönetişime devredilir:

```solidity
router.lockGovernance(address(gov));   // tek yönlü, ikinci çağrı revert eder
```

`lockGovernance` çağrıldıktan sonra `governanceLocked` kalıcı olarak `true`
olur; kurucunun o sözleşme üzerindeki yetkisi biter. Dağıtım betiği bunu
`TreasuryRouter` için uygular — dağıtım oranları kooperatifin "anayasası"
olduğu için ilk kilitlenmesi gereken yer orasıdır.

Diğer sözleşmeler demo kolaylığı için kurucuda bırakılmıştır. Gerçek bir
kurulumda kurucu üye kayıtları tamamlandıktan sonra hepsi kilitlenir.

## Para akışı

```
alıcı ─── buy() ──► CoopMarket (emanet)
                         │
                confirmDelivery()
                         │
         ┌───────────────┼────────────────┐
         ▼               ▼                ▼
  consumeReserved   recordPatronage   routeRevenue()
  (havuz tüketimi)  (hacim kaydı)          │
                                  ┌────────┼────────┬─────────┬──────────┐
                                  ▼        ▼        ▼         ▼          ▼
                              risturn  topluluk  yatırım   eğitim   dayanışma
                                  │
                            closePeriod()
                                  │
                              claim() ──► üye cüzdanı
```

Toplamın korunduğu `testFuzz_ToplamHepsiKorunur` ile doğrulanır: bölmeden
kalan küsurat son paya eklenir, kasada toz bakiye birikmez.

## Bilinçli sınırlar

- **Teslimat doğrulaması zincir dışıdır.** `confirmDelivery` alıcının beyanıdır.
  Fiziksel doğrulama (IoT, lisanslı depo, GS1 EPCIS) bu deponun kapsamı dışında.
- **Emtia tokenizasyonu yoktur.** Havuzdaki birimler ürün senedi değil, iç
  muhasebe kaydıdır. Elektronik ürün senedi entegrasyonu mevzuat gerektirir.
- **Aragon OSx eklentisi değildir.** Yönetişim bağımsız bir sözleşmedir;
  `PluginSetup`/`PluginRepo` entegrasyonu sonraki adımdır.
- **Üye sayısı sınırlıdır.** `SupplyPool` havuz başına 250 üretici ile sınırlıdır;
  rezervasyon döngüsünün gas sınırında kalması için. Daha büyük kooperatifler
  için toplu (batch) yaklaşım gerekir.
