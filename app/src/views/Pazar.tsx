import { useCallback, useEffect, useState } from "react";
import { parseEther, formatEther, type Address } from "viem";
import type { useCoop } from "../chain/useCoop";
import { kisaAdres } from "../chain/useCoop";
import { Alan, Bos, Islem, Kart, Rozet, Satir } from "../ui";

type Teklif = {
  id: bigint;
  satici: Address;
  havuzId: bigint;
  fiyat: bigint;
  kalan: bigint;
  acik: boolean;
  bilgi: string;
};

type Takas = {
  id: bigint;
  teklifId: bigint;
  alici: Address;
  litre: bigint;
  tutar: bigint;
  zaman: bigint;
  durum: number; // 1 emanet, 2 tamam, 3 iade
};

const DURUM: Record<number, { ad: string; tur: "iyi" | "uyari" | "notr" }> = {
  1: { ad: "emanette", tur: "uyari" },
  2: { ad: "tamamlandı", tur: "iyi" },
  3: { ad: "iade edildi", tur: "notr" },
};

export default function Pazar({ c }: { c: ReturnType<typeof useCoop> }) {
  const { ag, hesap, oku, yaz, bekle } = c;
  const a = ag.adresler!;

  const [teklifler, setTeklifler] = useState<Teklif[]>([]);
  const [takaslar, setTakaslar] = useState<Takas[]>([]);
  const [uye, setUye] = useState(false);
  const [emanet, setEmanet] = useState(0n);
  const [sure, setSure] = useState(0n);

  const [havuzId, setHavuzId] = useState("1");
  const [litre, setLitre] = useState("100");
  const [fiyat, setFiyat] = useState("0.001");
  const [alim, setAlim] = useState<Record<string, string>>({});

  const yenile = useCallback(async () => {
    const [tSayi, xSayi, bakiye, pencere] = await Promise.all([
      oku<bigint>("market", a.market, "offerCount"),
      oku<bigint>("market", a.market, "exchangeCount"),
      c.publicClient.getBalance({ address: a.market }),
      oku<bigint>("market", a.market, "deliveryWindow"),
    ]);
    setEmanet(bakiye);
    setSure(pencere);

    const tl: Teklif[] = [];
    for (let i = 1n; i <= tSayi; i++) {
      const o = await oku<[Address, bigint, bigint, bigint, bigint, boolean, string]>(
        "market", a.market, "offers", [i],
      );
      tl.push({ id: i, satici: o[0], havuzId: o[1], fiyat: o[2], kalan: o[4], acik: o[5], bilgi: o[6] });
    }
    setTeklifler(tl.reverse());

    const xl: Takas[] = [];
    for (let i = 1n; i <= xSayi; i++) {
      const x = await oku<[bigint, Address, bigint, bigint, bigint, number]>(
        "market", a.market, "exchanges", [i],
      );
      xl.push({ id: i, teklifId: x[0], alici: x[1], litre: x[2], tutar: x[3], zaman: x[4], durum: Number(x[5]) });
    }
    setTakaslar(xl.reverse());

    if (hesap) setUye(await oku<boolean>("registry", a.registry, "isActiveMember", [hesap]));
  }, [oku, a, hesap, c.publicClient]);

  useEffect(() => {
    yenile().catch(() => {});
  }, [yenile]);

  const simdi = BigInt(Math.floor(Date.now() / 1000));

  return (
    <div className="izgara">
      <Kart
        baslik="Kooperatif adına satış teklifi"
        not="Teklifi açan üye kendi ürününü değil, havuzun ürününü satar. Gelir tek satıcıya değil, havuza katkı veren herkese dağılır."
      >
        <Alan etiket="Havuz numarası" deger={havuzId} degistir={setHavuzId} tip="number" />
        <Alan etiket="Satılacak litre" deger={litre} degistir={setLitre} tip="number" />
        <Alan etiket="Litre fiyatı (ETH)" deger={fiyat} degistir={setFiyat} />
        <Islem
          etiket="Teklifi yayınla"
          kapali={!uye}
          kapaliNeden={!hesap ? "Önce cüzdanı bağla" : !uye ? "Yalnızca ortaklar teklif açabilir" : undefined}
          calistir={async () => {
            const h = await yaz("Satış teklifi", "market", a.market, "createOffer", [
              BigInt(havuzId), BigInt(litre), parseEther(fiyat || "0"), "ipfs://teklif",
            ]);
            await bekle(h);
            await yenile();
          }}
        />
      </Kart>

      <Kart baslik="Emanet" not="Alıcının ödediği bedel, teslimat onaylanana kadar sözleşmede durur.">
        <Satir etiket="Emanetteki toplam">{formatEther(emanet)} ETH</Satir>
        <Satir etiket="Teslimat süresi">{Number(sure) / 86400} gün</Satir>
        <Satir etiket="Bekleyen takas">{takaslar.filter((x) => x.durum === 1).length}</Satir>
      </Kart>

      <Kart baslik="Açık teklifler" genis>
        {teklifler.filter((t) => t.acik && t.kalan > 0n).length === 0 && <Bos>Açık teklif yok.</Bos>}
        {teklifler
          .filter((t) => t.acik && t.kalan > 0n)
          .map((t) => (
            <div key={String(t.id)} className="teklif">
              <div className="teklif-bilgi">
                <b>Teklif #{String(t.id)}</b>
                <span>
                  havuz #{String(t.havuzId)} · {String(t.kalan)} L kaldı · {formatEther(t.fiyat)} ETH/L
                </span>
                <small className="mono">açan: {kisaAdres(t.satici)}</small>
              </div>
              <div className="teklif-alim">
                <Alan
                  etiket="Kaç litre?"
                  deger={alim[String(t.id)] ?? ""}
                  degistir={(v) => setAlim((s) => ({ ...s, [String(t.id)]: v }))}
                  ipucu={String(t.kalan)}
                  tip="number"
                />
                <Islem
                  etiket={
                    alim[String(t.id)]
                      ? `${formatEther(BigInt(alim[String(t.id)] || 0) * t.fiyat)} ETH öde`
                      : "Satın al"
                  }
                  kapali={!hesap || !alim[String(t.id)]}
                  kapaliNeden={!hesap ? "Önce cüzdanı bağla" : undefined}
                  calistir={async () => {
                    const adet = BigInt(alim[String(t.id)]);
                    const h = await yaz(
                      `Satın alma · ${adet} L`, "market", a.market, "buy",
                      [t.id, adet], adet * t.fiyat,
                    );
                    await bekle(h);
                    setAlim((s) => ({ ...s, [String(t.id)]: "" }));
                    await yenile();
                  }}
                />
              </div>
              {hesap?.toLowerCase() === t.satici.toLowerCase() && (
                <Islem
                  etiket="Teklifi kapat"
                  ikincil
                  calistir={async () => {
                    const h = await yaz("Teklif kapatma", "market", a.market, "closeOffer", [t.id]);
                    await bekle(h);
                    await yenile();
                  }}
                />
              )}
            </div>
          ))}
      </Kart>

      <Kart baslik="Takaslar" not="Teslimat onaylandığında bedel beş fona bölünür ve üreticilerin hacmi kaydedilir." genis>
        {takaslar.length === 0 && <Bos>Henüz alım yapılmadı.</Bos>}
        {takaslar.map((x) => {
          const benimAlimim = hesap?.toLowerCase() === x.alici.toLowerCase();
          const suresiDoldu = simdi >= x.zaman + sure;
          return (
            <div key={String(x.id)} className="teklif">
              <div className="teklif-bilgi">
                <b>Takas #{String(x.id)}</b>
                <span>
                  {String(x.litre)} L · {formatEther(x.tutar)} ETH ·{" "}
                  <Rozet tur={DURUM[x.durum]?.tur ?? "notr"}>{DURUM[x.durum]?.ad ?? "—"}</Rozet>
                </span>
                <small className="mono">alıcı: {kisaAdres(x.alici)}{benimAlimim && " (sen)"}</small>
              </div>
              {x.durum === 1 && (
                <div className="teklif-alim">
                  {benimAlimim && (
                    <Islem
                      etiket="Teslimatı onayla"
                      calistir={async () => {
                        const h = await yaz("Teslimat onayı", "market", a.market, "confirmDelivery", [x.id]);
                        await bekle(h);
                        await yenile();
                      }}
                    />
                  )}
                  {suresiDoldu && (
                    <Islem
                      etiket="Süre doldu, kesinleştir"
                      ikincil
                      calistir={async () => {
                        const h = await yaz("Süreli kesinleştirme", "market", a.market, "finalizeExpired", [x.id]);
                        await bekle(h);
                        await yenile();
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Kart>
    </div>
  );
}
