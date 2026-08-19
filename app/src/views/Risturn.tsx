import { useCallback, useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import type { useCoop } from "../chain/useCoop";
import { kisaAdres } from "../chain/useCoop";
import { Bos, Islem, Kart, Rozet, Satir } from "../ui";

type Donem = {
  no: bigint;
  toplamHacim: bigint;
  gelir: bigint;
  cekilen: bigint;
  kapali: boolean;
  benimHacim: bigint;
  benimHak: bigint;
  benimSirket: bigint;
  cektim: boolean;
};

export default function RisturnGorunum({ c }: { c: ReturnType<typeof useCoop> }) {
  const { ag, hesap, oku, yaz, bekle } = c;
  const a = ag.adresler!;

  const [donemler, setDonemler] = useState<Donem[]>([]);
  const [acikDonem, setAcikDonem] = useState(1n);
  const [steward, setSteward] = useState<Address | null>(null);
  const [kasa, setKasa] = useState(0n);
  const [oranlar, setOranlar] = useState<bigint[]>([]);
  const [fonlar, setFonlar] = useState<Record<string, bigint>>({});

  const yenile = useCallback(async () => {
    const [simdiki, s, bakiye, policy] = await Promise.all([
      oku<bigint>("vault", a.vault, "currentPeriod"),
      oku<Address>("vault", a.vault, "steward"),
      c.publicClient.getBalance({ address: a.vault }),
      oku<bigint[]>("router", a.router, "policy"),
    ]);
    setAcikDonem(simdiki);
    setSteward(s);
    setKasa(bakiye);
    setOranlar(policy);

    const [t, y, e, d] = await Promise.all([
      c.publicClient.getBalance({ address: a.community }),
      c.publicClient.getBalance({ address: a.reinvestment }),
      c.publicClient.getBalance({ address: a.education }),
      c.publicClient.getBalance({ address: a.interCoop }),
    ]);
    setFonlar({ topluluk: t, yatirim: y, egitim: e, dayanisma: d });

    const liste: Donem[] = [];
    for (let i = 1n; i <= simdiki; i++) {
      const p = await oku<[bigint, bigint, bigint, boolean]>("vault", a.vault, "periods", [i]);
      let benimHacim = 0n, benimHak = 0n, benimSirket = 0n, cektim = false;
      if (hesap) {
        [benimHacim, benimHak, benimSirket, cektim] = await Promise.all([
          oku<bigint>("vault", a.vault, "unitsOf", [i, hesap]),
          oku<bigint>("vault", a.vault, "entitlementOf", [i, hesap]),
          oku<bigint>("vault", a.vault, "capitalModelShareOf", [i, hesap]),
          oku<boolean>("vault", a.vault, "hasClaimed", [i, hesap]),
        ]);
      }
      liste.push({
        no: i, toplamHacim: p[0], gelir: p[1], cekilen: p[2], kapali: p[3],
        benimHacim, benimHak, benimSirket, cektim,
      });
    }
    setDonemler(liste.reverse());
  }, [oku, a, hesap, c.publicClient]);

  useEffect(() => {
    yenile().catch(() => {});
  }, [yenile]);

  const yonetimBende = hesap && steward && hesap.toLowerCase() === steward.toLowerCase();
  const bps = (v?: bigint) => (v === undefined ? "—" : `%${Number(v) / 100}`);

  return (
    <div className="izgara">
      <Kart baslik="Fonlar" not="Her satışın geliri bu beş fona bölünür. Oranları yalnızca üye oylaması değiştirir.">
        <Satir etiket={`Risturn kasası ${bps(oranlar[0])}`}>{formatEther(kasa)} ETH</Satir>
        <Satir etiket={`Topluluk fonu ${bps(oranlar[1])}`}>{formatEther(fonlar.topluluk ?? 0n)} ETH</Satir>
        <Satir etiket={`Yeniden yatırım ${bps(oranlar[2])}`}>{formatEther(fonlar.yatirim ?? 0n)} ETH</Satir>
        <Satir etiket={`Eğitim fonu ${bps(oranlar[3])}`}>{formatEther(fonlar.egitim ?? 0n)} ETH</Satir>
        <Satir etiket={`Dayanışma ${bps(oranlar[4])}`}>{formatEther(fonlar.dayanisma ?? 0n)} ETH</Satir>
      </Kart>

      {yonetimBende && (
        <Kart baslik="Yönetim — dönem" not="Dönem kapanınca paylar sabitlenir ve çekilebilir hale gelir.">
          <Satir etiket="Açık dönem">{String(acikDonem)}</Satir>
          <Islem
            etiket={`Dönem ${acikDonem} kapat`}
            calistir={async () => {
              const h = await yaz("Dönem kapatma", "vault", a.vault, "closePeriod");
              await bekle(h);
              await yenile();
            }}
          />
        </Kart>
      )}

      {donemler.map((d) => (
        <Kart
          key={String(d.no)}
          baslik={`Dönem ${d.no}`}
          not={d.kapali ? "kapandı — paylar kesinleşti" : "açık — hacim ve gelir birikiyor"}
          genis
        >
          <div className="ikili">
            <div>
              <Satir etiket="Toplam işlem hacmi">{String(d.toplamHacim)} L</Satir>
              <Satir etiket="Risturn matrahı">{formatEther(d.gelir)} ETH</Satir>
              <Satir etiket="Çekilen">{formatEther(d.cekilen)} ETH</Satir>
              <Satir etiket="Durum">
                {d.kapali ? <Rozet tur="iyi">kapalı</Rozet> : <Rozet tur="uyari">açık</Rozet>}
              </Satir>
            </div>
            <div>
              <Satir etiket="Senin hacmin">{String(d.benimHacim)} L</Satir>
              <Satir etiket="Kooperatif payın">
                <span className="vurgu-iyi">{formatEther(d.benimHak)} ETH</span>
              </Satir>
              <Satir etiket="Şirket olsaydı">
                <span className="soluk">{formatEther(d.benimSirket)} ETH</span>
              </Satir>
              {d.kapali && d.benimHak > 0n && (
                <Islem
                  etiket={d.cektim ? "çekildi" : `${formatEther(d.benimHak)} ETH çek`}
                  kapali={d.cektim}
                  kapaliNeden={d.cektim ? "Bu dönemin payını çektin" : undefined}
                  calistir={async () => {
                    const h = await yaz(`Risturn çekimi · dönem ${d.no}`, "vault", a.vault, "claim", [d.no]);
                    await bekle(h);
                    await yenile();
                  }}
                />
              )}
            </div>
          </div>

          {d.kapali && d.benimHacim > 0n && (
            <p className="tez-not">
              Kooperatifle {String(d.benimHacim)} litrelik işlem yaptın ve {formatEther(d.benimHak)} ETH
              aldın. Aynı gelir sermaye payına göre bölünseydi {formatEther(d.benimSirket)} ETH alacaktın.
            </p>
          )}
        </Kart>
      ))}

      {donemler.length === 0 && (
        <Kart baslik="Dönemler" genis>
          <Bos>Henüz dönem yok.</Bos>
        </Kart>
      )}

      <Kart baslik="Kasa adresi" genis>
        <p className="mono kucuk">{a.vault}</p>
        {ag.kasif && (
          <a className="dis" href={`${ag.kasif}/address/${a.vault}`} target="_blank" rel="noreferrer">
            {ag.ad} kâşifinde aç ↗
          </a>
        )}
        <p className="kucuk soluk">Kasa yöneticisi: {kisaAdres(steward)}</p>
      </Kart>
    </div>
  );
}
