import { useCallback, useEffect, useState } from "react";
import { parseEther } from "viem";
import * as z from "../chain/actions";
import type { Durum } from "../chain/actions";

const BIRIM_FIYAT = parseEther("1");
const ALI_LITRE = 60n;
const VELI_LITRE = 40n;
const SATIS_LITRE = 100n;

type AdimDurum = "bekliyor" | "calisiyor" | "tamam" | "hata";

type Adim = {
  baslik: string;
  aciklama: string;
  ilke?: string;
  calistir: () => Promise<string>;
};

const eth = (v: bigint) => {
  const s = z.eth(v);
  const n = Number(s);
  return n % 1 === 0 ? n.toString() : n.toFixed(4).replace(/0+$/, "");
};
const bps = (v: bigint) => `%${Number(v) / 100}`;

export default function Senaryo() {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [poolId, setPoolId] = useState<bigint | null>(null);
  const [kapananDonem, setKapananDonem] = useState<bigint | null>(null);
  const [oylama, setOylama] = useState<{ lehte: bigint; aleyhte: bigint; yeterSayi: bigint } | null>(null);

  const [aktif, setAktif] = useState(0);
  const [durumlar, setDurumlar] = useState<AdimDurum[]>([]);
  const [loglar, setLoglar] = useState<string[]>([]);
  const [bagli, setBagli] = useState<boolean | null>(null);

  const yenile = useCallback(async () => {
    try {
      // Havuz henüz açılmadıysa 0 numaralı boş havuz okunur; üye ve fon
      // bilgileri ilk ekranda da görünsün diye.
      const d = await z.durumOku(poolId ?? 0n);
      setDurum(d);
      setKapananDonem(d.kapananDonem);
      setBagli(true);
    } catch {
      setBagli(false);
    }
  }, [poolId]);

  // Sunum sırasında sayfa kazara yenilenirse demo baştan başlamasın:
  // nerede kalındığı zincirden yeniden kurulur.
  useEffect(() => {
    (async () => {
      try {
        const i = await z.ilerlemeOku();
        setPoolId(i.poolId);
        setKapananDonem(i.kapananDonem);
        setAktif(i.tamamlanan);
        setDurumlar(Array(i.tamamlanan).fill("tamam"));
        if (i.tamamlanan > 0) {
          setLoglar([`${i.tamamlanan}. adıma kadar olan işlemler zincirde kayıtlı`]);
        }
        setBagli(true);
        if (i.teklifId) {
          const o = await z.oylamaDurumu(i.teklifId);
          setOylama({ lehte: o.lehte, aleyhte: o.aleyhte, yeterSayi: o.yeterSayi });
        }
      } catch {
        setBagli(false);
      }
    })();
  }, []);

  useEffect(() => {
    yenile();
  }, [yenile]);

  const adimlar: Adim[] = [
    {
      baslik: "Ortak arz havuzu açılır",
      aciklama: "Kooperatif, 2026 erken hasat zeytinyağı için ortak bir havuz tanımlar. Litre fiyatı 1 ETH.",
      ilke: "Kolektif arz",
      calistir: async () => {
        const { poolId: id } = await z.havuzKur();
        setPoolId(id);
        return `Havuz #${id} açıldı`;
      },
    },
    {
      baslik: "Üreticiler ürünlerini havuza koyar",
      aciklama: "Ali 60 litre, Veli 40 litre getirir. Ürünler bireysel değil, ortak havuzda birleşir.",
      ilke: "Rochdale 3 · ekonomik katılım",
      calistir: async () => {
        const id = await z.sonHavuz();
        await z.urunEkle(id, [
          { id: "ali", litre: ALI_LITRE },
          { id: "veli", litre: VELI_LITRE },
        ]);
        return `Havuzda ${ALI_LITRE + VELI_LITRE} litre`;
      },
    },
    {
      baslik: "Satış teklifi açılır",
      aciklama: "Kooperatif adına 100 litrelik teklif yayınlanır. Ürün havuzda kilitlenir, satıcı tek kişi değil havuzun kendisidir.",
      calistir: async () => {
        const havuz = await z.sonHavuz();
        const id = await z.teklifAc(havuz, SATIS_LITRE, BIRIM_FIYAT);
        return `Teklif #${id} · ${SATIS_LITRE} litre × 1 ETH`;
      },
    },
    {
      baslik: "Toptancı satın alır, bedel emanete girer",
      aciklama: "100 ETH ödenir. Para satıcıya değil, teslimat onayına kadar sözleşmede emanette durur.",
      calistir: async () => {
        const teklif = await z.sonTeklif();
        const id = await z.satinAl(teklif, SATIS_LITRE, BIRIM_FIYAT);
        return `Emanette 100 ETH · takas #${id}`;
      },
    },
    {
      baslik: "Teslimat onaylanır, gelir dağıtılır",
      aciklama: "Emanetteki 100 ETH'nin tamamı beş fona bölünür. İkinci bir ödeme kaynağı yoktur — giren para ile dağıtılan para birebir eşittir.",
      ilke: "Programlanabilir anayasa",
      calistir: async () => {
        await z.teslimatOnayla(await z.sonTakas());
        return "100 ETH beş fona dağıtıldı";
      },
    },
    {
      baslik: "Hesap dönemi kapatılır",
      aciklama: "Risturn matrahı ve üye hacimleri kesinleşir. Bu andan sonra paylar değiştirilemez.",
      calistir: async () => {
        const d = await z.donemKapat();
        setKapananDonem(d);
        return `Dönem ${d} kapandı`;
      },
    },
    {
      baslik: "Üyeler risturnunu çeker",
      aciklama: "Her üye, kooperatifle yaptığı işlem hacmi oranında payını alır. Sermaye payının hesaba hiçbir etkisi yoktur.",
      ilke: "Rochdale 3 · risturn",
      calistir: async () => {
        const donem = (await z.acikDonem()) - 1n;
        await z.risturnCek(donem, "ali");
        await z.risturnCek(donem, "veli");
        return "Ali ve Veli paylarını çekti";
      },
    },
    {
      baslik: "Üyeler dağıtım oranını oylar",
      aciklama: "Ali teklif verir: risturn payı %50'den %70'e çıksın. Ali ve Veli kabul, Ayşe ret. Üç üye, üç oy — sermayeleri farklı, ağırlıkları eşit.",
      ilke: "Rochdale 2 · bir üye bir oy",
      calistir: async () => {
        const id = await z.oylamaBaslat();
        await z.oyVer(id, "ali", true);
        await z.oyVer(id, "veli", true);
        await z.oyVer(id, "ayse", false);
        const o = await z.oylamaDurumu(id);
        setOylama({ lehte: o.lehte, aleyhte: o.aleyhte, yeterSayi: o.yeterSayi });
        await z.oylamaBitir(id);
        return `Karar uygulandı · ${o.lehte} kabul, ${o.aleyhte} ret`;
      },
    },
  ];

  async function calistir(i: number) {
    setDurumlar((d) => {
      const n = [...d];
      n[i] = "calisiyor";
      return n;
    });
    try {
      const mesaj = await adimlar[i].calistir();
      setDurumlar((d) => {
        const n = [...d];
        n[i] = "tamam";
        return n;
      });
      setLoglar((l) => [`${i + 1}. ${mesaj}`, ...l]);
      setAktif(i + 1);
      await yenile();
    } catch (e) {
      setDurumlar((d) => {
        const n = [...d];
        n[i] = "hata";
        return n;
      });
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      setLoglar((l) => [`${i + 1}. HATA — ${msg}`, ...l]);
    }
  }

  const [oynuyor, setOynuyor] = useState(false);

  /** Tüm senaryoyu baştan sona oynatır — sunumda tek tıkla anlatım için. */
  async function hepsiniOynat() {
    setOynuyor(true);
    for (let i = aktif; i < adimlar.length; i++) {
      await calistir(i);
      await new Promise((r) => setTimeout(r, 600));
    }
    setOynuyor(false);
  }

  const risturnAsamasi = kapananDonem !== null;

  return (
    <div className="senaryo-sayfa">
      <header className="ust">
        <div>
          <div className="etiket">Rochdale Kooperatif Protokolü · canlı demo</div>
          <h1>{durum?.koopAdi ?? "Ayvalık Zeytinyağı Kooperatifi"}</h1>
        </div>
        <div className="ust-veri">
          <div>
            <span className="k">Aktif ortak</span>
            <b>{durum ? Number(durum.aktifUye) : "—"}</b>
          </div>
          <div>
            <span className="k">Havuzdaki ürün</span>
            <b>{durum ? `${durum.havuzToplam} L` : "—"}</b>
          </div>
          <div>
            <span className="k">Zincir</span>
            <b className={bagli ? "iyi" : "kotu"}>{bagli === null ? "…" : bagli ? "bağlı" : "kapalı"}</b>
          </div>
          <button
            className="oynat"
            onClick={hepsiniOynat}
            disabled={!bagli || oynuyor || aktif >= adimlar.length}
          >
            {oynuyor ? "oynatılıyor…" : aktif >= adimlar.length ? "senaryo bitti" : "Tümünü oynat"}
          </button>
        </div>
      </header>

      {bagli === false && (
        <div className="uyari">
          Zincire bağlanılamadı. Terminalde <code>anvil</code> çalıştırın, sonra
          <code> forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast</code> ile
          sözleşmeleri kurun.
        </div>
      )}

      <div className="bilgi-kutu" style={{marginBottom: "18px"}}>
        Tutarlar <b>test ağı ETH'si</b> cinsindendir, gerçek piyasa fiyatı değildir —
        senaryo oranları göstermek için kurgulanmıştır. Gerçek fiyatlarla hesap:
        1.000 kg zeytinyağı × 366 TL (Tariş 2025/26 alım fiyatı) = 366.000 TL; risturn
        payı 183.000 TL, Ali'ye 109.800 TL, Veli'ye 73.200 TL.
      </div>

      <div className="govde">
        {/* --------------------------------------------------- senaryo */}
        <section className="adimlar">
          <h2 className="bolum">Senaryo</h2>
          {adimlar.map((a, i) => {
            const d = durumlar[i] ?? "bekliyor";
            const acik = i === aktif;
            return (
              <article key={i} className={`adim ${d} ${acik ? "acik" : ""}`}>
                <div className="adim-no">{d === "tamam" ? "✓" : i + 1}</div>
                <div className="adim-govde">
                  <div className="adim-ust">
                    <h3>{a.baslik}</h3>
                    {a.ilke && <span className="ilke">{a.ilke}</span>}
                  </div>
                  <p>{a.aciklama}</p>
                  {acik && (
                    <button onClick={() => calistir(i)} disabled={d === "calisiyor" || !bagli}>
                      {d === "calisiyor" ? "zincire yazılıyor…" : "Çalıştır"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {/* --------------------------------------------------- durum */}
        <aside className="panel">
          <h2 className="bolum">Fonlar</h2>
          <div className="fonlar">
            <Fon ad="Risturn kasası" not="üyeye hacme göre" deger={durum?.fonlar.risturn} oran={durum?.oranlar.risturn} vurgu />
            <Fon ad="Topluluk fonu" not="demokratik harcama" deger={durum?.fonlar.topluluk} oran={durum?.oranlar.topluluk} />
            <Fon ad="Yeniden yatırım" not="kooperatifin kendisi" deger={durum?.fonlar.yatirim} oran={durum?.oranlar.yatirim} />
            <Fon ad="Eğitim fonu" not="Rochdale 5. ilke" deger={durum?.fonlar.egitim} oran={durum?.oranlar.egitim} />
            <Fon ad="Dayanışma" not="Rochdale 6. ilke" deger={durum?.fonlar.dayanisma} oran={durum?.oranlar.dayanisma} />
          </div>

          {durum && durum.emanet > 0n && (
            <div className="emanet">
              <span>Emanetteki bedel</span>
              <b>{eth(durum.emanet)} ETH</b>
              <small>teslimat onayı bekleniyor</small>
            </div>
          )}

          {oylama && (
            <>
              <h2 className="bolum">Oylama</h2>
              <div className="oylama">
                <div className="oy kabul">
                  <b>{Number(oylama.lehte)}</b>
                  <span>kabul</span>
                </div>
                <div className="oy ret">
                  <b>{Number(oylama.aleyhte)}</b>
                  <span>ret</span>
                </div>
                <p>Yeter sayı: {Number(oylama.yeterSayi)} oy · her ortak 1 oy</p>
              </div>
            </>
          )}

          <h2 className="bolum">İşlem defteri</h2>
          <ol className="defter">
            {loglar.length === 0 && <li className="bos">Henüz işlem yok</li>}
            {loglar.map((l, i) => (
              <li key={i} className={l.includes("HATA") ? "hata" : ""}>{l}</li>
            ))}
          </ol>
        </aside>
      </div>

      {/* --------------------------------------------------- tez */}
      <section className={`tez ${risturnAsamasi ? "aktif" : ""}`}>
        <div className="tez-ust">
          <h2>Aynı gelir, iki farklı kural</h2>
          <p>
            Kooperatifi şirketten ayıran tek finansal mekanizma budur: kâr, sermaye payına göre değil,
            üyenin kooperatifle yaptığı işlem hacmine göre dağıtılır.
          </p>
        </div>
        <div className="kutu">
          <table>
            <thead>
              <tr>
                <th>Ortak</th>
                <th className="s">Sermaye</th>
                <th className="s">Havuza verdiği</th>
                <th className="s">Kooperatif payı</th>
                <th className="s">Şirket olsaydı</th>
              </tr>
            </thead>
            <tbody>
              {durum?.uyeler.map((u) => {
                const fark = u.risturn > u.sirketPayi;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.ad}
                      <small>{u.not}</small>
                    </td>
                    <td className="s">{Number(u.sermaye).toLocaleString("tr-TR")} TL</td>
                    <td className="s">{Number(u.donemHacmi > 0n ? u.donemHacmi : u.havuzLitre)} L</td>
                    <td className={`s vurgu ${risturnAsamasi ? (fark ? "artan" : "azalan") : ""}`}>
                      {risturnAsamasi ? `${eth(u.risturn)} ETH` : "—"}
                      {risturnAsamasi && u.cekildi && <small>çekildi</small>}
                    </td>
                    <td className="s soluk">
                      {risturnAsamasi ? `${eth(u.sirketPayi)} ETH` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {risturnAsamasi && (
          <p className="tez-son">
            Veli'nin sermayesi Ali'nin dokuz katı. Şirket modelinde gelirin çoğunu Veli alırdı;
            kooperatifte ürünü kim getirdiyse payı o alıyor.
          </p>
        )}
      </section>

      <footer className="alt">
        <span>Sözleşmeler yerel demo zincirinde çalışıyor · her adım gerçek bir zincir işlemidir</span>
        <span className="mono">Ömür Demirel'in kavramsal modeli üzerine kurulmuştur</span>
      </footer>
    </div>
  );
}

function Fon({
  ad,
  not,
  deger,
  oran,
  vurgu,
}: {
  ad: string;
  not: string;
  deger?: bigint;
  oran?: bigint;
  vurgu?: boolean;
}) {
  return (
    <div className={`fon ${vurgu ? "vurgu" : ""}`}>
      <div className="fon-ad">
        {ad}
        <small>{not}</small>
      </div>
      <div className="fon-sag">
        <b>{deger !== undefined ? `${eth(deger)} ETH` : "—"}</b>
        <span>{oran !== undefined ? bps(oran) : ""}</span>
      </div>
    </div>
  );
}
