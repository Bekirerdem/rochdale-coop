import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import type { useCoop } from "../chain/useCoop";

/**
 * Kooperatifin hangi aşamada olduğunu zincirden okuyup sıradaki adımı gösterir.
 * Beş ayrı sekme arasında "şimdi ne yapacağım" sorusunu ortadan kaldırmak için:
 * her adım tamamlandığında kendiliğinden ilerler.
 */

type Durum = {
  uye: boolean;
  havuzVar: boolean;
  urunVar: boolean;
  teklifVar: boolean;
  emanetVar: boolean;
  /** Tamamlanmış en az bir satış var mı — dönemde işlem hacmi oluşmuşsa evet. */
  satisOldu: boolean;
  kapaliDonem: boolean;
  cekilmemis: boolean;
};

type Adim = {
  ad: string;
  sekme: string;
  tamam: boolean;
  ipucu: string;
};

export default function Akis({
  c,
  sekmeyeGit,
}: {
  c: ReturnType<typeof useCoop>;
  sekmeyeGit: (s: string) => void;
}) {
  const { ag, hesap, oku } = c;
  const a = ag.adresler!;
  const [d, setD] = useState<Durum | null>(null);

  const yenile = useCallback(async () => {
    if (!a) return;
    const [havuzSayi, teklifSayi, takasSayi, donem] = await Promise.all([
      oku<bigint>("pool", a.pool, "poolCount"),
      oku<bigint>("market", a.market, "offerCount"),
      oku<bigint>("market", a.market, "exchangeCount"),
      oku<bigint>("vault", a.vault, "currentPeriod"),
    ]);

    let uye = false;
    if (hesap) uye = await oku<boolean>("registry", a.registry, "isActiveMember", [hesap]);

    let urunVar = false;
    if (havuzSayi > 0n) {
      const p = await oku<[boolean, string, bigint, bigint, bigint]>(
        "pool", a.pool, "pools", [havuzSayi],
      );
      urunVar = p[3] > 0n;
    }

    let teklifVar = false;
    if (teklifSayi > 0n) {
      const o = await oku<[Address, bigint, bigint, bigint, bigint, boolean, string]>(
        "market", a.market, "offers", [teklifSayi],
      );
      teklifVar = o[5] && o[4] > 0n;
    }

    let emanetVar = false;
    if (takasSayi > 0n) {
      const x = await oku<[bigint, Address, bigint, bigint, bigint, number]>(
        "market", a.market, "exchanges", [takasSayi],
      );
      emanetVar = Number(x[5]) === 1;
    }

    // Satışın gerçekleştiğini hacim kaydından anlarız: teslimat onaylanınca
    // üreticilerin hacmi kasaya yazılır.
    const acik = await oku<[bigint, bigint, bigint, boolean]>(
      "vault", a.vault, "periods", [donem],
    );
    const kapaliDonem = donem > 1n;
    const satisOldu = kapaliDonem || acik[0] > 0n;
    let cekilmemis = false;
    if (kapaliDonem && hesap) {
      const hak = await oku<bigint>("vault", a.vault, "entitlementOf", [donem - 1n, hesap]);
      const cekti = await oku<boolean>("vault", a.vault, "hasClaimed", [donem - 1n, hesap]);
      cekilmemis = hak > 0n && !cekti;
    }

    setD({
      uye, havuzVar: havuzSayi > 0n, urunVar, teklifVar,
      emanetVar, satisOldu, kapaliDonem, cekilmemis,
    });
  }, [oku, a, hesap]);

  useEffect(() => {
    yenile().catch(() => setD(null));
  }, [yenile, c.tazeleSayaci, c.islemler.length]);

  if (!d) return null;

  const adimlar: Adim[] = [
    {
      ad: "Ortak ol",
      sekme: "uyelik",
      tamam: d.uye,
      ipucu: "Kooperatife üyelik başvurusu gönder; yönetim kabul edince kütüğe geçersin.",
    },
    {
      ad: "Havuz aç",
      sekme: "havuz",
      tamam: d.havuzVar,
      ipucu: "Ürünün toplanacağı ortak arz havuzunu tanımla ve bir litre fiyatı belirle.",
    },
    {
      ad: "Ürünü koy",
      sekme: "havuz",
      tamam: d.urunVar,
      ipucu: "Kaç litre getirdiğini havuza işle. Ürünler bireysel değil, ortak havuzda birleşir.",
    },
    {
      ad: "Teklif yayınla",
      sekme: "pazar",
      tamam: d.teklifVar || d.emanetVar || d.satisOldu,
      ipucu: "Havuzdaki üründen kaç litreyi satışa çıkaracağını belirle.",
    },
    {
      ad: "Satış ve teslimat",
      sekme: "pazar",
      tamam: d.satisOldu,
      ipucu: d.emanetVar
        ? "Bedel emanette bekliyor. Alıcı teslimatı onaylayınca gelir beş fona bölünür."
        : "Alıcı teklifi satın alsın; bedel teslimat onayına kadar emanette durur.",
    },
    {
      ad: "Dönemi kapat",
      sekme: "risturn",
      tamam: d.kapaliDonem,
      ipucu: "Yönetim dönemi kapatınca risturn payları kesinleşir ve çekilebilir hale gelir.",
    },
    {
      ad: "Risturnu çek",
      sekme: "risturn",
      tamam: d.kapaliDonem && !d.cekilmemis,
      ipucu: "İşlem hacmine göre hesaplanan payını cüzdanına al.",
    },
  ];

  const siradaki = adimlar.findIndex((x) => !x.tamam);
  const aktif = siradaki === -1 ? adimlar.length - 1 : siradaki;
  const bitti = siradaki === -1;

  return (
    <div className="akis">
      <div className="akis-ust">
        <span className="akis-baslik">{bitti ? "Döngü tamamlandı" : "Sıradaki adım"}</span>
        {!bitti && (
          <button className="akis-git" onClick={() => sekmeyeGit(adimlar[aktif].sekme)}>
            {adimlar[aktif].ad} →
          </button>
        )}
      </div>

      <ol className="akis-liste">
        {adimlar.map((x, i) => (
          <li
            key={x.ad}
            className={x.tamam ? "tamam" : i === aktif ? "aktif" : "bekliyor"}
            onClick={() => sekmeyeGit(x.sekme)}
            title={x.ipucu}
          >
            <i>{x.tamam ? "✓" : i + 1}</i>
            <span>{x.ad}</span>
          </li>
        ))}
      </ol>

      {!bitti && <p className="akis-ipucu">{adimlar[aktif].ipucu}</p>}
    </div>
  );
}
