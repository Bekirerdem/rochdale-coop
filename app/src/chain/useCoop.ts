import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  formatEther,
  type Address,
  type Hash,
} from "viem";
import { AGLAR, agKaydet, kayitliAg, type AgAnahtar, type AgTanimi } from "./networks";
import { abi } from "./abi";

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, f: (...a: never[]) => void) => void;
  removeListener?: (e: string, f: (...a: never[]) => void) => void;
};

function saglayici(): Eip1193 | null {
  const w = window as unknown as { ethereum?: Eip1193 };
  return w.ethereum ?? null;
}

export type Islem = {
  hash: Hash;
  etiket: string;
  durum: "bekliyor" | "tamam" | "hata";
  hata?: string;
};

export function useCoop() {
  const [agAnahtar, setAgAnahtar] = useState<AgAnahtar>(() => kayitliAg());
  const ag: AgTanimi = AGLAR[agAnahtar];

  const [hesap, setHesap] = useState<Address | null>(null);
  const [cuzdanAgi, setCuzdanAgi] = useState<number | null>(null);
  const [islemler, setIslemler] = useState<Islem[]>([]);
  const [mesaj, setMesaj] = useState<string | null>(null);
  /** Zincirden veri okunamadığında ekranın sessizce boş kalmaması için. */
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [tazeleSayaci, setTazeleSayaci] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: ag.chain,
        // Bir uç nokta yanıt vermezse sıradakine geçilir; tek bir geçici
        // ağ hatası ekranı boş bırakmasın diye.
        transport: fallback(
          [ag.rpc, ...ag.yedekRpc].map((u) => http(u, { timeout: 10_000, retryCount: 2 })),
          { rank: false },
        ),
      }),
    [ag],
  );

  const cuzdanVar = saglayici() !== null;
  const dogruAg = cuzdanAgi === ag.chain.id;

  /* ------------------------------------------------------------ cüzdan */

  const baglantiyiTazele = useCallback(async () => {
    const p = saglayici();
    if (!p) return;
    try {
      const hesaplar = (await p.request({ method: "eth_accounts" })) as Address[];
      setHesap(hesaplar[0] ?? null);
      const id = (await p.request({ method: "eth_chainId" })) as string;
      setCuzdanAgi(Number(BigInt(id)));
    } catch {
      /* kullanıcı reddetti */
    }
  }, []);

  useEffect(() => {
    baglantiyiTazele();
    const p = saglayici();
    if (!p?.on) return;
    const h = () => baglantiyiTazele();
    p.on("accountsChanged", h);
    p.on("chainChanged", h);
    return () => {
      p.removeListener?.("accountsChanged", h);
      p.removeListener?.("chainChanged", h);
    };
  }, [baglantiyiTazele]);

  const bagla = useCallback(async () => {
    const p = saglayici();
    if (!p) {
      setMesaj("Tarayıcıda MetaMask bulunamadı.");
      return;
    }
    const hesaplar = (await p.request({ method: "eth_requestAccounts" })) as Address[];
    setHesap(hesaplar[0] ?? null);
    await baglantiyiTazele();
  }, [baglantiyiTazele]);

  const agaGec = useCallback(async () => {
    const p = saglayici();
    if (!p) return;
    const hex = `0x${ag.chain.id.toString(16)}`;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch {
      // Ağ cüzdanda tanımlı değilse ekle
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: ag.chain.name,
            nativeCurrency: ag.chain.nativeCurrency,
            rpcUrls: [ag.rpc],
            blockExplorerUrls: ag.kasif ? [ag.kasif] : undefined,
          },
        ],
      });
    }
    await baglantiyiTazele();
  }, [ag, baglantiyiTazele]);

  const agDegistir = useCallback((k: AgAnahtar) => {
    setAgAnahtar(k);
    agKaydet(k);
  }, []);

  /* ------------------------------------------------------------ okuma */

  const oku = useCallback(
    async <T,>(
      hedef: keyof typeof abi,
      adres: Address,
      fonksiyon: string,
      args: readonly unknown[] = [],
    ): Promise<T> =>
      publicClient.readContract({
        address: adres,
        abi: abi[hedef] as never,
        functionName: fonksiyon,
        args: args as never,
      } as never) as Promise<T>,
    [publicClient],
  );

  /* ------------------------------------------------------------ yazma */

  /**
   * İşlemi kullanıcının kendi cüzdanıyla imzalatır.
   * Zincire yazan her eylem buradan geçer — otomatik imza yoktur.
   */
  const yaz = useCallback(
    async (
      etiket: string,
      hedef: keyof typeof abi,
      adres: Address,
      fonksiyon: string,
      args: readonly unknown[] = [],
      value?: bigint,
    ): Promise<Hash> => {
      const p = saglayici();
      if (!p) throw new Error("MetaMask bulunamadı");
      if (!hesap) throw new Error("Önce cüzdanı bağla");
      if (!dogruAg) throw new Error(`Cüzdanı ${ag.ad} ağına geçir`);

      const wallet = createWalletClient({ account: hesap, chain: ag.chain, transport: custom(p) });

      // Önce simüle et: revert sebebini kullanıcıya işlem göndermeden söyle.
      const { request } = await publicClient.simulateContract({
        account: hesap,
        address: adres,
        abi: abi[hedef] as never,
        functionName: fonksiyon,
        args: args as never,
        value,
      } as never);

      const hash = await wallet.writeContract(request as never);
      const yeni: Islem = { hash, etiket, durum: "bekliyor" };
      setIslemler((l) => [yeni, ...l].slice(0, 25));

      publicClient
        .waitForTransactionReceipt({ hash })
        .then((r) =>
          setIslemler((l) =>
            l.map((i) =>
              i.hash === hash ? { ...i, durum: r.status === "success" ? "tamam" : "hata" } : i,
            ),
          ),
        )
        .catch(() =>
          setIslemler((l) => l.map((i) => (i.hash === hash ? { ...i, durum: "hata" } : i))),
        );

      return hash;
    },
    [hesap, dogruAg, ag, publicClient],
  );

  const bekle = useCallback(
    (hash: Hash) => publicClient.waitForTransactionReceipt({ hash }),
    [publicClient],
  );

  /** View'ler bunu çağırır: okuma başarısızsa hata görünür olur. */
  const veriYukle = useCallback(async (yukle: () => Promise<void>) => {
    setYukleniyor(true);
    try {
      // Uç nokta yanıt vermeyip isteği asılı bırakabilir; kendi süre sınırımız
      // olmadan ekran sonsuza kadar boş kalır.
      await Promise.race([
        yukle(),
        new Promise((_, red) =>
          setTimeout(() => red(new Error("Zincir 20 saniyede yanıt vermedi.")), 20_000),
        ),
      ]);
      setOkumaHatasi(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setOkumaHatasi(
        /fetch|network|timeout|RPC/i.test(m)
          ? "Zincire ulaşılamadı. Ağ bağlantısını kontrol edip yeniden dene."
          : m.split(String.fromCharCode(10))[0].slice(0, 160),
      );
    } finally {
      setYukleniyor(false);
    }
  }, []);

  const tekrarDene = useCallback(() => setTazeleSayaci((n) => n + 1), []);

  return {
    ag,
    agAnahtar,
    agDegistir,
    veriYukle,
    okumaHatasi,
    yukleniyor,
    tekrarDene,
    tazeleSayaci,
    publicClient,
    hesap,
    cuzdanVar,
    dogruAg,
    bagla,
    agaGec,
    oku,
    yaz,
    bekle,
    islemler,
    mesaj,
    setMesaj,
  };
}

export const eth = (v: bigint | undefined) => {
  if (v === undefined) return "—";
  const n = Number(formatEther(v));
  return n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toFixed(4).replace(/\.?0+$/, "");
};

export const kisaAdres = (a?: string | null) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
