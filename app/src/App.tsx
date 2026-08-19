import { useState } from "react";
import { useCoop, kisaAdres } from "./chain/useCoop";
import { kuruluAglar, txUrl, type AgAnahtar } from "./chain/networks";
import Uyelik from "./views/Uyelik";
import HavuzGorunum from "./views/Havuz";
import Pazar from "./views/Pazar";
import RisturnGorunum from "./views/Risturn";
import Yonetisim from "./views/Yonetisim";
import Senaryo from "./views/Senaryo";
import Akis from "./views/Akis";
import "./App.css";
import "./panel.css";

const SEKMELER = [
  { k: "uyelik", ad: "Üyelik", not: "kütük ve başvurular", yerelOzel: false },
  { k: "havuz", ad: "Ortak Havuz", not: "ürün girişi", yerelOzel: false },
  { k: "pazar", ad: "Pazar", not: "satış ve emanet", yerelOzel: false },
  { k: "risturn", ad: "Risturn", not: "kâr dağıtımı", yerelOzel: false },
  { k: "yonetisim", ad: "Genel Kurul", not: "bir üye bir oy", yerelOzel: false },
  { k: "senaryo", ad: "Sunum", not: "otomatik anlatım", yerelOzel: true },
] as const;

type SekmeK = (typeof SEKMELER)[number]["k"];

export default function App() {
  const c = useCoop();
  const [sekme, setSekme] = useState<SekmeK>("uyelik");
  const aglar = kuruluAglar();

  const kurulu = c.ag.adresler !== null;
  const yerel = c.agAnahtar === "local";
  const sekmeler = SEKMELER.filter((s) => !s.yerelOzel || yerel);

  return (
    <div className="sayfa">
      <header className="ust">
        <div className="marka">
          <div className="etiket">Rochdale Kooperatif Protokolü</div>
          <h1>Kooperatif Paneli</h1>
        </div>

        <div className="cuzdan">
          <select
            className="ag-sec"
            value={c.agAnahtar}
            onChange={(e) => c.agDegistir(e.target.value as AgAnahtar)}
          >
            {aglar.map((a) => (
              <option key={a.anahtar} value={a.anahtar}>
                {a.ad}
              </option>
            ))}
            {aglar.length === 0 && <option>kurulu ağ yok</option>}
          </select>

          {!c.cuzdanVar ? (
            <a className="dis" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
              MetaMask kur ↗
            </a>
          ) : !c.hesap ? (
            <button className="bagla" onClick={c.bagla}>
              Cüzdanı bağla
            </button>
          ) : !c.dogruAg ? (
            <button className="bagla uyari" onClick={c.agaGec}>
              {c.ag.ad} ağına geç
            </button>
          ) : (
            <span className="hesap mono" title={c.hesap}>
              <i className="nokta" /> {kisaAdres(c.hesap)}
            </span>
          )}
        </div>
      </header>

      {!kurulu && (
        <div className="uyari-kutu">
          <b>{c.ag.ad} için sözleşme adresi tanımlı değil.</b> Bu ağa dağıtım yapıp
          çıktıdaki adresleri <code>app/.env.local</code> dosyasına yaz — adımlar README'de.
        </div>
      )}

      {kurulu && c.hesap && !c.dogruAg && (
        <div className="uyari-kutu">
          Cüzdanın farklı bir ağda. İşlem gönderebilmek için <b>{c.ag.ad}</b> ağına geçmen gerekiyor.
        </div>
      )}

      {kurulu && c.yukleniyor && !c.okumaHatasi && (
        <div className="bilgi-kutu yukleniyor">
          <span className="spinner" /> {c.ag.ad} zincirinden veriler okunuyor…
        </div>
      )}

      {c.okumaHatasi && (
        <div className="uyari-kutu">
          <b>Zincirden veri okunamadı.</b> {c.okumaHatasi}
          <button className="tekrar" onClick={c.tekrarDene}>
            Yeniden dene
          </button>
        </div>
      )}

      {kurulu && !c.hesap && c.cuzdanVar && !c.okumaHatasi && (
        <div className="bilgi-kutu">
          Sayfayı cüzdan bağlamadan da gezebilirsin — tüm veriler zincirden okunuyor.
          İşlem göndermek için cüzdanı bağla.
        </div>
      )}

      {kurulu && !c.okumaHatasi && (
        <Akis c={c} sekmeyeGit={(x) => setSekme(x as SekmeK)} />
      )}

      <nav className="sekmeler">
        {sekmeler.map((s) => (
          <button
            key={s.k}
            className={sekme === s.k ? "aktif" : ""}
            onClick={() => setSekme(s.k)}
            disabled={!kurulu}
          >
            <b>{s.ad}</b>
            <small>{s.not}</small>
          </button>
        ))}
      </nav>

      <main>
        {kurulu && sekme === "uyelik" && <Uyelik c={c} />}
        {kurulu && sekme === "havuz" && <HavuzGorunum c={c} />}
        {kurulu && sekme === "pazar" && <Pazar c={c} />}
        {kurulu && sekme === "risturn" && <RisturnGorunum c={c} />}
        {kurulu && sekme === "yonetisim" && <Yonetisim c={c} />}
        {kurulu && sekme === "senaryo" && yerel && <Senaryo />}
      </main>

      {c.islemler.length > 0 && (
        <aside className="islem-defteri">
          <h4>Gönderdiğin işlemler</h4>
          <ol>
            {c.islemler.map((i) => {
              const url = txUrl(c.ag, i.hash);
              return (
                <li key={i.hash} className={i.durum}>
                  <span className="ad">{i.etiket}</span>
                  {url ? (
                    <a className="mono" href={url} target="_blank" rel="noreferrer">
                      {i.hash.slice(0, 10)}… ↗
                    </a>
                  ) : (
                    <span className="mono">{i.hash.slice(0, 10)}…</span>
                  )}
                  <span className="durum">
                    {i.durum === "bekliyor"
                      ? "onay bekleniyor"
                      : i.durum === "tamam"
                        ? "onaylandı"
                        : i.durum === "belirsiz"
                          ? "doğrulanamadı — kâşifte bak"
                          : "başarısız"}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
      )}

      <footer className="alt">
        <span>
          Zincire yazan her eylem senin cüzdanınla imzalanır · {c.ag.ad}
          {c.ag.kasif && kurulu && (
            <>
              {" · "}
              <a
                className="dis"
                href={`${c.ag.kasif}/address/${c.ag.adresler!.registry}`}
                target="_blank"
                rel="noreferrer"
              >
                sözleşmeler ↗
              </a>
            </>
          )}
        </span>
        <span className="mono">Ömür Demirel'in kavramsal modeli · açık kaynak</span>
      </footer>
    </div>
  );
}
