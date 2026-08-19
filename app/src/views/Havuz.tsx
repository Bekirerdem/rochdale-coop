import { useCallback, useEffect, useState } from "react";
import { parseEther, formatEther, type Address } from "viem";
import type { useCoop } from "../chain/useCoop";
import { kisaAdres } from "../chain/useCoop";
import { Alan, Bos, Islem, Kart, Satir } from "../ui";

type Havuz = {
  id: bigint;
  aktif: boolean;
  bilgi: string;
  fiyat: bigint;
  toplam: bigint;
  rezerve: bigint;
  benim: bigint;
  benimSerbest: bigint;
  ureticiler: Address[];
};

export default function HavuzGorunum({ c }: { c: ReturnType<typeof useCoop> }) {
  const { ag, hesap, oku, yaz, bekle } = c;
  const a = ag.adresler!;

  const [havuzlar, setHavuzlar] = useState<Havuz[]>([]);
  const [uye, setUye] = useState(false);
  const [bilgi, setBilgi] = useState("2026 erken hasat");
  const [fiyat, setFiyat] = useState("0.001");
  const [litre, setLitre] = useState<Record<string, string>>({});

  const yenile = useCallback(async () => {
    const sayi = await oku<bigint>("pool", a.pool, "poolCount");
    const liste: Havuz[] = [];
    for (let i = 1n; i <= sayi; i++) {
      const p = await oku<[boolean, string, bigint, bigint, bigint]>("pool", a.pool, "pools", [i]);
      const ureticiler = await oku<Address[]>("pool", a.pool, "producersOf", [i]);
      let benim = 0n;
      let benimSerbest = 0n;
      if (hesap) {
        benim = await oku<bigint>("pool", a.pool, "unitsOf", [i, hesap]);
        benimSerbest = await oku<bigint>("pool", a.pool, "freeUnitsOf", [i, hesap]);
      }
      liste.push({
        id: i, aktif: p[0], bilgi: p[1], fiyat: p[2],
        toplam: p[3], rezerve: p[4], benim, benimSerbest, ureticiler,
      });
    }
    setHavuzlar(liste.reverse());
    if (hesap) setUye(await oku<boolean>("registry", a.registry, "isActiveMember", [hesap]));
  }, [oku, a, hesap]);

  useEffect(() => {
    yenile().catch(() => {});
  }, [yenile]);

  return (
    <div className="izgara">
      <Kart
        baslik="Yeni ortak arz havuzu"
        not="Havuz, üreticilerin ürününü tek bir arz olarak birleştirir. Satış olduğunda tüm üreticiler payları oranında etkilenir."
      >
        <Alan etiket="Ürün tanımı" deger={bilgi} degistir={setBilgi} ipucu="2026 erken hasat, Ayvalık" />
        <Alan etiket="Litre fiyatı (ETH)" deger={fiyat} degistir={setFiyat} ipucu="0.001" />
        <Islem
          etiket="Havuz aç"
          kapali={!uye}
          kapaliNeden={!hesap ? "Önce cüzdanı bağla" : !uye ? "Yalnızca ortaklar havuz açabilir" : undefined}
          calistir={async () => {
            const h = await yaz("Havuz açma", "pool", a.pool, "createPool", [bilgi, parseEther(fiyat || "0")]);
            await bekle(h);
            await yenile();
          }}
        />
      </Kart>

      {havuzlar.length === 0 && (
        <Kart baslik="Havuzlar" genis>
          <Bos>Henüz havuz açılmamış.</Bos>
        </Kart>
      )}

      {havuzlar.map((p) => (
        <Kart key={String(p.id)} baslik={`Havuz #${p.id} — ${p.bilgi}`} not={`${p.ureticiler.length} üretici katkı verdi`}>
          <Satir etiket="Litre fiyatı">{formatEther(p.fiyat)} ETH</Satir>
          <Satir etiket="Havuzdaki toplam">{String(p.toplam)} L</Satir>
          <Satir etiket="Satışa kilitli">{String(p.rezerve)} L</Satir>
          <Satir etiket="Senin katkın">
            {String(p.benim)} L{p.benim > p.benimSerbest && ` (${String(p.benim - p.benimSerbest)} L kilitli)`}
          </Satir>

          <div className="ayirac" />
          <Alan
            etiket="Havuza eklenecek litre"
            deger={litre[String(p.id)] ?? ""}
            degistir={(v) => setLitre((s) => ({ ...s, [String(p.id)]: v }))}
            ipucu="60"
            tip="number"
          />
          <div className="eylem-satir">
            <Islem
              etiket="Ürünü havuza koy"
              kapali={!uye || !litre[String(p.id)]}
              kapaliNeden={!uye ? "Yalnızca ortaklar ürün koyabilir" : undefined}
              calistir={async () => {
                const h = await yaz("Havuza ürün ekleme", "pool", a.pool, "addUnits", [
                  p.id,
                  BigInt(litre[String(p.id)]),
                ]);
                await bekle(h);
                setLitre((s) => ({ ...s, [String(p.id)]: "" }));
                await yenile();
              }}
            />
            <Islem
              etiket="Geri çek"
              ikincil
              kapali={p.benimSerbest === 0n || !litre[String(p.id)]}
              kapaliNeden={p.benimSerbest === 0n ? "Çekilebilir ürünün yok" : undefined}
              calistir={async () => {
                const h = await yaz("Havuzdan geri çekme", "pool", a.pool, "withdrawUnits", [
                  p.id,
                  BigInt(litre[String(p.id)]),
                ]);
                await bekle(h);
                setLitre((s) => ({ ...s, [String(p.id)]: "" }));
                await yenile();
              }}
            />
          </div>

          {p.ureticiler.length > 0 && (
            <div className="mini-liste">
              {p.ureticiler.map((u) => (
                <span key={u} className={`mono ${hesap?.toLowerCase() === u.toLowerCase() ? "ben" : ""}`}>
                  {kisaAdres(u)}
                </span>
              ))}
            </div>
          )}
        </Kart>
      ))}
    </div>
  );
}
