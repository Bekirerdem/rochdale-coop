import { useCallback, useEffect, useState } from "react";
import { keccak256, toBytes, type Address } from "viem";
import type { useCoop } from "../chain/useCoop";
import { kisaAdres } from "../chain/useCoop";
import { Alan, Bos, Islem, Kart, Rozet, Satir } from "../ui";

const ROL = {
  uretici: keccak256(toBytes("PRODUCER")),
  tuketici: keccak256(toBytes("CONSUMER")),
};

const DURUM_ADI = ["Başvuru yok", "Karar bekliyor", "Aktif ortak", "Ayrılmış", "Reddedilmiş"];

type Uye = {
  adres: Address;
  durum: number;
  rol: `0x${string}`;
  sermaye: bigint;
  egitim: boolean;
};

export default function Uyelik({ c }: { c: ReturnType<typeof useCoop> }) {
  const { ag, hesap, oku, yaz, bekle } = c;
  const a = ag.adresler!;

  const [koopAdi, setKoopAdi] = useState("");
  const [steward, setSteward] = useState<Address | null>(null);
  const [kilitli, setKilitli] = useState(false);
  const [benimDurum, setBenimDurum] = useState<number>(0);
  const [uyeler, setUyeler] = useState<Uye[]>([]);
  const [rol, setRol] = useState<"uretici" | "tuketici">("uretici");
  const [profil, setProfil] = useState("");
  const [yeniUye, setYeniUye] = useState("");

  const yenile = useCallback(async () => {
    const [ad, s, k, liste] = await Promise.all([
      oku<string>("registry", a.registry, "coopName"),
      oku<Address>("registry", a.registry, "steward"),
      oku<boolean>("registry", a.registry, "governanceLocked"),
      oku<Address[]>("registry", a.registry, "allMembers"),
    ]);
    setKoopAdi(ad);
    setSteward(s);
    setKilitli(k);

    const detay = await Promise.all(
      liste.map(async (adres) => {
        const m = await oku<[number, `0x${string}`, string, bigint, bigint]>(
          "registry", a.registry, "members", [adres],
        );
        const egitim = await oku<boolean>("sbt", a.sbt, "hasCredential", [adres]);
        return { adres, durum: Number(m[0]), rol: m[1], sermaye: m[4], egitim };
      }),
    );
    setUyeler(detay);

    if (hesap) {
      const m = await oku<[number, `0x${string}`, string, bigint, bigint]>(
        "registry", a.registry, "members", [hesap],
      );
      setBenimDurum(Number(m[0]));
    }
  }, [oku, a, hesap]);

  useEffect(() => {
    c.veriYukle(yenile);
  }, [yenile, c.tazeleSayaci]);

  const yonetimBende = hesap && steward && hesap.toLowerCase() === steward.toLowerCase();
  const bekleyenler = uyeler.filter((u) => u.durum === 1);

  return (
    <div className="izgara">
      <Kart baslik="Kooperatif" not="Üye kütüğü zincirde tutulur; genel kurul kaydı buradan okunur.">
        <Satir etiket="Ad">{koopAdi || "—"}</Satir>
        <Satir etiket="Kayıtlı ortak">{uyeler.length}</Satir>
        <Satir etiket="Aktif ortak">{uyeler.filter((u) => u.durum === 2).length}</Satir>
        <Satir etiket="Yönetim">
          {kilitli ? <Rozet tur="iyi">oylamaya kilitli</Rozet> : <Rozet tur="uyari">kurucuda</Rozet>}
        </Satir>
        <Satir etiket="Yetkili adres">{kisaAdres(steward)}</Satir>
      </Kart>

      <Kart
        baslik="Üyelik başvurusu"
        not="Rochdale 1. ilke: üyelik gönüllü ve açıktır — herkes başvurabilir. Kütüğe geçiş kooperatif kararıyla olur."
      >
        <Satir etiket="Senin durumun">
          {benimDurum === 2 ? (
            <Rozet tur="iyi">{DURUM_ADI[2]}</Rozet>
          ) : benimDurum === 1 ? (
            <Rozet tur="uyari">{DURUM_ADI[1]}</Rozet>
          ) : (
            <Rozet tur="notr">{DURUM_ADI[benimDurum] ?? "—"}</Rozet>
          )}
        </Satir>

        {benimDurum !== 2 && (
          <>
            <label className="alan">
              <span>Rol</span>
              <select value={rol} onChange={(e) => setRol(e.target.value as typeof rol)}>
                <option value="uretici">Üretici — havuza ürün koyar</option>
                <option value="tuketici">Tüketici — havuzdan satın alır</option>
              </select>
            </label>
            <Alan etiket="Profil bağlantısı" deger={profil} degistir={setProfil} ipucu="ipfs://… veya boş" />
            <Islem
              etiket="Üyelik başvurusu gönder"
              kapali={!hesap}
              kapaliNeden={!hesap ? "Önce cüzdanı bağla" : undefined}
              calistir={async () => {
                const h = await yaz("Üyelik başvurusu", "registry", a.registry, "requestMembership", [
                  ROL[rol],
                  profil || "ipfs://uye",
                ]);
                await bekle(h);
                await yenile();
              }}
            />
          </>
        )}

        {benimDurum === 2 && (
          <Islem
            etiket="Üyelikten ayrıl"
            ikincil
            calistir={async () => {
              const h = await yaz("Üyelikten ayrılma", "registry", a.registry, "resign");
              await bekle(h);
              await yenile();
            }}
          />
        )}
      </Kart>

      {yonetimBende && (
        <Kart
          baslik="Yönetim — başvurular"
          not="Bağlı cüzdan kooperatif yönetimi olduğu için bu panel açık."
          genis
        >
          {bekleyenler.length === 0 && <Bos>Bekleyen başvuru yok.</Bos>}
          {bekleyenler.map((u) => (
            <div key={u.adres} className="liste-satir">
              <span className="mono">{kisaAdres(u.adres)}</span>
              <div className="liste-eylem">
                <Islem
                  etiket="Kabul et"
                  calistir={async () => {
                    const h = await yaz("Üye kabulü", "registry", a.registry, "admitMember", [u.adres]);
                    await bekle(h);
                    await yenile();
                  }}
                />
                <Islem
                  etiket="Reddet"
                  ikincil
                  calistir={async () => {
                    const h = await yaz("Başvuru reddi", "registry", a.registry, "rejectMembership", [u.adres]);
                    await bekle(h);
                    await yenile();
                  }}
                />
              </div>
            </div>
          ))}

          <div className="ayirac" />
          <Alan etiket="Doğrudan ortak ekle" deger={yeniUye} degistir={setYeniUye} ipucu="0x…" />
          <Islem
            etiket="Kütüğe işle"
            kapali={!yeniUye.startsWith("0x") || yeniUye.length !== 42}
            kapaliNeden={yeniUye ? "Geçerli bir adres gir" : undefined}
            calistir={async () => {
              const h = await yaz("Ortak ekleme", "registry", a.registry, "stewardAdmit", [
                yeniUye as Address,
                ROL.uretici,
                "ipfs://uye",
              ]);
              await bekle(h);
              setYeniUye("");
              await yenile();
            }}
          />
        </Kart>
      )}

      <Kart baslik="Ortaklar" not="Sermaye sütunu yalnızca kayıttır — oy gücüne etkisi yoktur." genis>
        {uyeler.length === 0 && <Bos>Kütük boş.</Bos>}
        {uyeler.length > 0 && (
          <div className="tablo-kutu">
            <table>
              <thead>
                <tr>
                  <th>Adres</th>
                  <th>Rol</th>
                  <th>Durum</th>
                  <th className="s">Sermaye</th>
                  <th className="s">Oy gücü</th>
                  <th>Eğitim</th>
                </tr>
              </thead>
              <tbody>
                {uyeler.map((u) => (
                  <tr key={u.adres} className={hesap?.toLowerCase() === u.adres.toLowerCase() ? "ben" : ""}>
                    <td className="mono">{kisaAdres(u.adres)}</td>
                    <td>{u.rol === ROL.uretici ? "üretici" : "tüketici"}</td>
                    <td>
                      {u.durum === 2 ? (
                        <Rozet tur="iyi">aktif</Rozet>
                      ) : (
                        <Rozet tur="notr">{DURUM_ADI[u.durum]}</Rozet>
                      )}
                    </td>
                    <td className="s">{Number(u.sermaye).toLocaleString("tr-TR")}</td>
                    <td className="s vurgu">{u.durum === 2 ? 1 : 0}</td>
                    <td>{u.egitim ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kart>
    </div>
  );
}
