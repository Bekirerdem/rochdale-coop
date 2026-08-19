import { useState, type ReactNode } from "react";

export function Kart({
  baslik,
  not,
  children,
  genis,
}: {
  baslik: string;
  not?: string;
  children: ReactNode;
  genis?: boolean;
}) {
  return (
    <section className={`kart ${genis ? "genis" : ""}`}>
      <header>
        <h3>{baslik}</h3>
        {not && <p>{not}</p>}
      </header>
      <div className="kart-govde">{children}</div>
    </section>
  );
}

export function Satir({
  etiket,
  ek,
  children,
}: {
  etiket: string;
  /** Etiketin yanında duran ikincil bilgi (oran vb.) — değerle karışmasın diye ayrı. */
  ek?: string;
  children: ReactNode;
}) {
  return (
    <div className="satir">
      <span>
        {etiket}
        {ek && <em className="satir-ek">{ek}</em>}
      </span>
      <b>{children}</b>
    </div>
  );
}

export function Alan({
  etiket,
  deger,
  degistir,
  ipucu,
  yardim,
  uyari,
  tip = "text",
}: {
  etiket: string;
  deger: string;
  degistir: (v: string) => void;
  ipucu?: string;
  /** Alanın altında duran açıklama — ne girileceği belirsizse şart. */
  yardim?: string;
  /** Girilen değer teknik olarak geçerli ama muhtemelen yanlışsa. */
  uyari?: string | null;
  tip?: string;
}) {
  return (
    <label className="alan">
      <span>{etiket}</span>
      <input type={tip} value={deger} onChange={(e) => degistir(e.target.value)} placeholder={ipucu} />
      {uyari ? <small className="alan-uyari">{uyari}</small> : yardim ? <small className="alan-yardim">{yardim}</small> : null}
    </label>
  );
}

/**
 * İşlem butonu: tıklanınca cüzdan imzası ister, sonuç durumunu kendi üstünde
 * gösterir. Zincire yazan her eylem bundan geçer.
 */
export function Islem({
  etiket,
  calistir,
  kapali,
  kapaliNeden,
  ikincil,
}: {
  etiket: string;
  calistir: () => Promise<unknown>;
  kapali?: boolean;
  kapaliNeden?: string;
  ikincil?: boolean;
}) {
  const [durum, setDurum] = useState<"hazir" | "imza" | "tamam" | "hata">("hazir");
  const [hata, setHata] = useState<string | null>(null);

  async function tikla() {
    setDurum("imza");
    setHata(null);
    try {
      await calistir();
      setDurum("tamam");
      setTimeout(() => setDurum("hazir"), 2500);
    } catch (e) {
      setDurum("hata");
      setHata(temizHata(e));
    }
  }

  return (
    <div className="islem">
      <button
        className={ikincil ? "ikincil" : ""}
        onClick={tikla}
        disabled={kapali || durum === "imza"}
        title={kapali ? kapaliNeden : undefined}
      >
        {durum === "imza" ? "cüzdan onayı bekleniyor…" : durum === "tamam" ? "gönderildi ✓" : etiket}
      </button>
      {kapali && kapaliNeden && <small className="neden">{kapaliNeden}</small>}
      {hata && <small className="hata">{hata}</small>}
    </div>
  );
}

/** Zincir hatalarını kullanıcının anlayacağı tek satıra indirger. */
export function temizHata(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);

  const sozluk: [RegExp, string][] = [
    [/User rejected|User denied/i, "İşlemi cüzdanda reddettin."],
    [/OnlyMember/, "Bu işlem yalnızca kooperatif üyelerine açık."],
    [/OnlySteward/, "Bu işlem yalnızca kooperatif yönetimine açık."],
    [/OnlyBuyer/, "Teslimatı yalnızca alıcı onaylayabilir."],
    [/OnlySeller/, "Bu işlemi yalnızca teklifi açan veya yönetim yapabilir."],
    [/AlreadyMember/, "Zaten üyesin."],
    [/NotPending/, "Bekleyen bir başvuru yok."],
    [/EducationRequired/, "Teklif verebilmek için eğitim belgesi gerekli."],
    [/AlreadyVoted/, "Bu teklife zaten oy verdin."],
    [/AlreadyClaimed/, "Bu dönemin payını zaten çektin."],
    [/NothingToClaim/, "Çekilecek bir pay yok."],
    [/PeriodNotClosed/, "Dönem henüz kapanmadı."],
    [/PeriodAlreadyClosed/, "Bu dönem zaten kapandı."],
    [/NoRevenue/, "Dağıtılacak gelir yok."],
    [/InsufficientAvailable/, "Havuzda yeterli ürün yok."],
    [/NotEnoughUnits/, "Teklifte bu kadar ürün kalmadı."],
    [/WrongPayment/, "Gönderilen tutar fiyatla eşleşmiyor."],
    [/WindowNotElapsed/, "Teslimat süresi henüz dolmadı."],
    [/VotingClosed/, "Oylama kapandı."],
    [/VotingOngoing/, "Oylama sürüyor."],
    [/NotSucceeded/, "Teklif kabul edilmedi."],
    [/ZeroUnits|ZeroAddress/, "Geçersiz değer."],
    [/insufficient funds/i, "Cüzdanda yeterli test ETH yok."],
    [/chain.*mismatch|does not match/i, "Cüzdan yanlış ağda."],
    // İşlem zincire gitti ama makbuz okunamadı — başarısız DEĞİL.
    [
      /receipt.*could not be found|Transaction may not be processed/i,
      "İşlem gönderildi ama onayı henüz okunamadı. Aşağıdaki listeden kâşifte kontrol edebilirsin — büyük olasılıkla geçti.",
    ],
    [
      /no backend is currently healthy|503|Service Unavailable/i,
      "Ağ uç noktası geçici olarak yanıt vermiyor. Birkaç saniye sonra tekrar dene.",
    ],
    [/nonce too low/i, "Bu işlem zaten gönderilmiş görünüyor."],
    [/replacement transaction underpriced/i, "Önceki işlem hâlâ bekliyor; onaylanmasını bekle."],
  ];

  for (const [kalip, mesaj] of sozluk) if (kalip.test(m)) return mesaj;
  return m.split("\n")[0].slice(0, 140);
}

export function Bos({ children }: { children: ReactNode }) {
  return <p className="bos">{children}</p>;
}

export function Rozet({ tur, children }: { tur: "iyi" | "uyari" | "kotu" | "notr"; children: ReactNode }) {
  return <span className={`rozet ${tur}`}>{children}</span>;
}
