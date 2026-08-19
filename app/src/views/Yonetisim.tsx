import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, type Address } from "viem";
import type { useCoop } from "../chain/useCoop";
import { kisaAdres } from "../chain/useCoop";
import { abi } from "../chain/abi";
import { Alan, Bos, Islem, Kart, Rozet, Satir } from "../ui";

type Teklif = {
  id: bigint;
  sahip: Address;
  bilgi: string;
  hedef: Address;
  biter: bigint;
  lehte: bigint;
  aleyhte: bigint;
  anlikUye: bigint;
  yurutuldu: boolean;
  durum: number;
  yeterSayi: bigint;
  oyVerdim: boolean;
};

const DURUM: Record<number, { ad: string; tur: "iyi" | "uyari" | "kotu" | "notr" }> = {
  0: { ad: "yok", tur: "notr" },
  1: { ad: "oylama sürüyor", tur: "uyari" },
  2: { ad: "reddedildi", tur: "kotu" },
  3: { ad: "kabul edildi", tur: "iyi" },
  4: { ad: "uygulandı", tur: "iyi" },
};

export default function Yonetisim({ c }: { c: ReturnType<typeof useCoop> }) {
  const { ag, hesap, oku, yaz, bekle } = c;
  const a = ag.adresler!;

  const [teklifler, setTeklifler] = useState<Teklif[]>([]);
  const [uye, setUye] = useState(false);
  const [egitim, setEgitim] = useState(false);
  const [sure, setSure] = useState(0n);
  const [yeter, setYeter] = useState(0n);

  // Risturn oranı değişikliği teklifi
  const [risturn, setRisturn] = useState("70");
  const [topluluk, setTopluluk] = useState("10");
  const [yatirim, setYatirim] = useState("10");
  const [egitimF, setEgitimF] = useState("7");
  const [dayanisma, setDayanisma] = useState("3");

  const toplam = [risturn, topluluk, yatirim, egitimF, dayanisma]
    .map((v) => Number(v || 0))
    .reduce((x, y) => x + y, 0);

  const yenile = useCallback(async () => {
    const [sayi, votingPeriod, quorum] = await Promise.all([
      oku<bigint>("gov", a.gov, "proposalCount"),
      oku<bigint>("gov", a.gov, "votingPeriod"),
      oku<bigint>("gov", a.gov, "quorumBps"),
    ]);
    setSure(votingPeriod);
    setYeter(quorum);

    const liste: Teklif[] = [];
    for (let i = 1n; i <= sayi; i++) {
      const p = await oku<[Address, string, Address, bigint, string, bigint, bigint, bigint, bigint, bigint, boolean]>(
        "gov", a.gov, "proposals", [i],
      );
      const [durum, oylar, yeterSayi] = await Promise.all([
        oku<number>("gov", a.gov, "state", [i]),
        oku<[bigint, bigint]>("gov", a.gov, "votesOf", [i]),
        oku<bigint>("gov", a.gov, "quorumRequired", [i]),
      ]);
      const oyVerdim = hesap ? await oku<boolean>("gov", a.gov, "hasVoted", [i, hesap]) : false;
      liste.push({
        id: i, sahip: p[0], bilgi: p[1], hedef: p[2], biter: p[6],
        lehte: oylar[0], aleyhte: oylar[1], anlikUye: p[9], yurutuldu: p[10],
        durum: Number(durum), yeterSayi, oyVerdim,
      });
    }
    setTeklifler(liste.reverse());

    if (hesap) {
      setUye(await oku<boolean>("registry", a.registry, "isActiveMember", [hesap]));
      setEgitim(await oku<boolean>("sbt", a.sbt, "hasCredential", [hesap]));
    }
  }, [oku, a, hesap]);

  useEffect(() => {
    yenile().catch(() => {});
  }, [yenile]);

  return (
    <div className="izgara">
      <Kart baslik="Yönetişim kuralı" not="Rochdale 2. ilke: oy gücü sermayeden bağımsızdır.">
        <Satir etiket="Oy ağırlığı">her aktif ortak = 1 oy</Satir>
        <Satir etiket="Oylama süresi">{Number(sure) / 86400} gün</Satir>
        <Satir etiket="Yeter sayı">%{Number(yeter) / 100} katılım</Satir>
        <Satir etiket="Teklif verme koşulu">üyelik + eğitim belgesi</Satir>
        <Satir etiket="Senin durumun">
          {!hesap ? (
            <Rozet tur="notr">cüzdan bağlı değil</Rozet>
          ) : !uye ? (
            <Rozet tur="notr">ortak değilsin</Rozet>
          ) : !egitim ? (
            <Rozet tur="uyari">eğitim belgesi yok</Rozet>
          ) : (
            <Rozet tur="iyi">teklif verebilirsin</Rozet>
          )}
        </Satir>
      </Kart>

      <Kart
        baslik="Yeni teklif — dağıtım oranları"
        not="Kooperatifin gelirini nasıl böleceği bir yönetim kararı değil, genel kurul kararıdır."
      >
        <div className="oran-izgara">
          <Alan etiket="Risturn %" deger={risturn} degistir={setRisturn} tip="number" />
          <Alan etiket="Topluluk %" deger={topluluk} degistir={setTopluluk} tip="number" />
          <Alan etiket="Yatırım %" deger={yatirim} degistir={setYatirim} tip="number" />
          <Alan etiket="Eğitim %" deger={egitimF} degistir={setEgitimF} tip="number" />
          <Alan etiket="Dayanışma %" deger={dayanisma} degistir={setDayanisma} tip="number" />
        </div>
        <Satir etiket="Toplam">
          <span className={toplam === 100 ? "vurgu-iyi" : "vurgu-kotu"}>%{toplam}</span>
        </Satir>
        <Islem
          etiket="Teklifi genel kurula sun"
          kapali={!uye || !egitim || toplam !== 100}
          kapaliNeden={
            !hesap ? "Önce cüzdanı bağla"
            : !uye ? "Yalnızca ortaklar teklif verebilir"
            : !egitim ? "Eğitim belgesi gerekli"
            : toplam !== 100 ? "Oranların toplamı %100 olmalı"
            : undefined
          }
          calistir={async () => {
            const data = encodeFunctionData({
              abi: abi.router as never,
              functionName: "setPolicy",
              args: [{
                patronageRefundBps: BigInt(Number(risturn) * 100),
                communityFundBps: BigInt(Number(topluluk) * 100),
                reinvestmentBps: BigInt(Number(yatirim) * 100),
                educationFundBps: BigInt(Number(egitimF) * 100),
                interCooperationBps: BigInt(Number(dayanisma) * 100),
              }],
            } as never);
            const h = await yaz("Teklif oluşturma", "gov", a.gov, "propose", [
              a.router, 0n, data,
              `Dagitim: risturn %${risturn}, topluluk %${topluluk}, yatirim %${yatirim}, egitim %${egitimF}, dayanisma %${dayanisma}`,
            ]);
            await bekle(h);
            await yenile();
          }}
        />
      </Kart>

      {teklifler.length === 0 && (
        <Kart baslik="Teklifler" genis>
          <Bos>Henüz teklif yok.</Bos>
        </Kart>
      )}

      {teklifler.map((t) => {
        const bitis = new Date(Number(t.biter) * 1000);
        const katilim = t.lehte + t.aleyhte;
        return (
          <Kart key={String(t.id)} baslik={`Teklif #${t.id}`} not={t.bilgi} genis>
            <div className="ikili">
              <div>
                <Satir etiket="Durum">
                  <Rozet tur={DURUM[t.durum]?.tur ?? "notr"}>{DURUM[t.durum]?.ad ?? "—"}</Rozet>
                </Satir>
                <Satir etiket="Oylama bitişi">{bitis.toLocaleString("tr-TR")}</Satir>
                <Satir etiket="Teklifi veren">{kisaAdres(t.sahip)}</Satir>
                <Satir etiket="Hedef sözleşme">{kisaAdres(t.hedef)}</Satir>
              </div>
              <div>
                <div className="oy-kutu">
                  <div className="oy kabul">
                    <b>{String(t.lehte)}</b>
                    <span>kabul</span>
                  </div>
                  <div className="oy ret">
                    <b>{String(t.aleyhte)}</b>
                    <span>ret</span>
                  </div>
                </div>
                <Satir etiket="Katılım">
                  {String(katilim)} / {String(t.anlikUye)} ortak · yeter sayı {String(t.yeterSayi)}
                </Satir>
              </div>
            </div>

            <div className="eylem-satir">
              {t.durum === 1 && (
                <>
                  <Islem
                    etiket="Kabul oyu ver"
                    kapali={!uye || t.oyVerdim}
                    kapaliNeden={!uye ? "Yalnızca ortaklar oy verir" : t.oyVerdim ? "Bu teklife oy verdin" : undefined}
                    calistir={async () => {
                      const h = await yaz(`Oy · teklif #${t.id}`, "gov", a.gov, "castVote", [t.id, true]);
                      await bekle(h);
                      await yenile();
                    }}
                  />
                  <Islem
                    etiket="Ret oyu ver"
                    ikincil
                    kapali={!uye || t.oyVerdim}
                    kapaliNeden={t.oyVerdim ? "Bu teklife oy verdin" : undefined}
                    calistir={async () => {
                      const h = await yaz(`Oy · teklif #${t.id}`, "gov", a.gov, "castVote", [t.id, false]);
                      await bekle(h);
                      await yenile();
                    }}
                  />
                </>
              )}
              {t.durum === 3 && (
                <Islem
                  etiket="Kararı uygula"
                  calistir={async () => {
                    const h = await yaz(`Karar uygulama · #${t.id}`, "gov", a.gov, "execute", [t.id]);
                    await bekle(h);
                    await yenile();
                  }}
                />
              )}
            </div>
          </Kart>
        );
      })}
    </div>
  );
}
