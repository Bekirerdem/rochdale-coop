import { parseEther, formatEther } from "viem";
import { abi, addr, publicClient, walletFor, accountOf, type ActorId } from "./config";

async function send(
  actor: ActorId,
  contract: `0x${string}`,
  contractAbi: readonly unknown[],
  functionName: string,
  args: readonly unknown[] = [],
  value?: bigint,
) {
  const wallet = walletFor(actor);
  const hash = await wallet.writeContract({
    address: contract,
    abi: contractAbi as never,
    functionName,
    args: args as never,
    value,
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

async function read(
  contract: `0x${string}`,
  contractAbi: readonly unknown[],
  functionName: string,
  args: readonly unknown[] = [],
) {
  return publicClient.readContract({
    address: contract,
    abi: contractAbi as never,
    functionName,
    args: args as never,
  } as never);
}

/* ------------------------------------------------------------------ durum */

export type Uye = {
  id: ActorId;
  ad: string;
  not?: string;
  adres: `0x${string}`;
  uye: boolean;
  sermaye: bigint;
  havuzLitre: bigint;
  donemHacmi: bigint;
  risturn: bigint;
  sirketPayi: bigint;
  cekildi: boolean;
  bakiye: bigint;
};

export type Durum = {
  koopAdi: string;
  aktifUye: bigint;
  havuzToplam: bigint;
  havuzRezerve: bigint;
  emanet: bigint;
  fonlar: { risturn: bigint; topluluk: bigint; yatirim: bigint; egitim: bigint; dayanisma: bigint };
  oranlar: { risturn: bigint; topluluk: bigint; yatirim: bigint; egitim: bigint; dayanisma: bigint };
  donem: bigint;
  kapananDonem: bigint | null;
  uyeler: Uye[];
};

const URETICILER: { id: ActorId; ad: string; not: string }[] = [
  { id: "ali", ad: "Ali", not: "üretici · 10.000 TL sermaye" },
  { id: "veli", ad: "Veli", not: "üretici · 90.000 TL sermaye" },
  { id: "ayse", ad: "Ayşe", not: "üretici · yeni ortak" },
];

export async function durumOku(poolId: bigint, _yoksay?: bigint | null): Promise<Durum> {
  const [koopAdi, aktifUye, donem, policy, havuz] = await Promise.all([
    read(addr.registry, abi.registry, "coopName") as Promise<string>,
    read(addr.registry, abi.registry, "activeMemberCount") as Promise<bigint>,
    read(addr.vault, abi.vault, "currentPeriod") as Promise<bigint>,
    read(addr.router, abi.router, "policy") as Promise<bigint[]>,
    read(addr.pool, abi.pool, "pools", [poolId]) as Promise<
      [boolean, string, bigint, bigint, bigint]
    >,
  ]);

  // Kapanmış dönem doğrudan zincirden türetilir; React state'i beklenmez.
  const kapananDonem = donem > 1n ? donem - 1n : null;

  const [risturnBal, topluluk, yatirim, egitim, dayanisma, emanet] = await Promise.all([
    publicClient.getBalance({ address: addr.vault }),
    publicClient.getBalance({ address: addr.community }),
    publicClient.getBalance({ address: addr.reinvestment }),
    publicClient.getBalance({ address: addr.education }),
    publicClient.getBalance({ address: addr.interCoop }),
    publicClient.getBalance({ address: addr.market }),
  ]);

  const uyeler: Uye[] = await Promise.all(
    URETICILER.map(async (u) => {
      const adres = accountOf(u.id);
      const [uye, sermaye, havuzLitre, bakiye] = await Promise.all([
        read(addr.registry, abi.registry, "isActiveMember", [adres]) as Promise<boolean>,
        read(addr.registry, abi.registry, "capitalOf", [adres]) as Promise<bigint>,
        read(addr.pool, abi.pool, "unitsOf", [poolId, adres]) as Promise<bigint>,
        publicClient.getBalance({ address: adres }),
      ]);

      let risturn = 0n;
      let sirketPayi = 0n;
      let cekildi = false;
      let donemHacmi = 0n;
      if (kapananDonem !== null) {
        [risturn, sirketPayi, cekildi, donemHacmi] = (await Promise.all([
          // Hak edilen tutar — çekildikten sonra da tabloda görünsün diye
          read(addr.vault, abi.vault, "entitlementOf", [kapananDonem, adres]),
          read(addr.vault, abi.vault, "capitalModelShareOf", [kapananDonem, adres]),
          read(addr.vault, abi.vault, "hasClaimed", [kapananDonem, adres]),
          read(addr.vault, abi.vault, "unitsOf", [kapananDonem, adres]),
        ])) as [bigint, bigint, boolean, bigint];
      }

      return { ...u, id: u.id, adres, uye, sermaye, havuzLitre, donemHacmi, risturn, sirketPayi, cekildi, bakiye };
    }),
  );

  return {
    koopAdi,
    aktifUye,
    donem,
    kapananDonem,
    havuzToplam: havuz[3],
    havuzRezerve: havuz[4],
    emanet,
    fonlar: { risturn: risturnBal, topluluk, yatirim, egitim, dayanisma },
    oranlar: {
      risturn: policy[0],
      topluluk: policy[1],
      yatirim: policy[2],
      egitim: policy[3],
      dayanisma: policy[4],
    },
    uyeler,
  };
}

/* ------------------------------------------------------------------ eylemler */

export async function havuzKur() {
  const { receipt } = await send(
    "ali",
    addr.pool,
    abi.pool,
    "createPool",
    ["ipfs://erken-hasat-2026", parseEther("1")],
  );
  const poolId = (await read(addr.pool, abi.pool, "poolCount")) as bigint;
  return { poolId, receipt };
}

export async function urunEkle(poolId: bigint, girisler: { id: ActorId; litre: bigint }[]) {
  const sonuc = [];
  for (const g of girisler) {
    const r = await send("ali" === g.id ? "ali" : g.id, addr.pool, abi.pool, "addUnits", [
      poolId,
      g.litre,
    ]);
    sonuc.push({ id: g.id, litre: g.litre, hash: r.hash });
  }
  return sonuc;
}

export async function teklifAc(poolId: bigint, litre: bigint, birimFiyat: bigint) {
  await send("ali", addr.market, abi.market, "createOffer", [
    poolId,
    litre,
    birimFiyat,
    "ipfs://teklif/erken-hasat",
  ]);
  const offerId = (await read(addr.market, abi.market, "offerCount")) as bigint;
  return offerId;
}

export async function satinAl(offerId: bigint, litre: bigint, birimFiyat: bigint) {
  await send(
    "alici",
    addr.market,
    abi.market,
    "buy",
    [offerId, litre],
    litre * birimFiyat,
  );
  const exchangeId = (await read(addr.market, abi.market, "exchangeCount")) as bigint;
  return exchangeId;
}

export async function teslimatOnayla(exchangeId: bigint) {
  return send("alici", addr.market, abi.market, "confirmDelivery", [exchangeId]);
}

export async function donemKapat() {
  const donem = (await read(addr.vault, abi.vault, "currentPeriod")) as bigint;
  await send("kurucu", addr.vault, abi.vault, "closePeriod");
  return donem;
}

export async function risturnCek(donem: bigint, id: ActorId) {
  return send(id, addr.vault, abi.vault, "claim", [donem]);
}

/** Risturn payını %50'den %70'e çıkaran teklif — üye oylamasına sunulur. */
export async function oylamaBaslat() {
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({
    abi: abi.router as never,
    functionName: "setPolicy",
    args: [
      {
        patronageRefundBps: 7000n,
        communityFundBps: 1000n,
        reinvestmentBps: 1000n,
        educationFundBps: 700n,
        interCooperationBps: 300n,
      },
    ],
  } as never);

  await send("ali", addr.gov, abi.gov, "propose", [
    addr.router,
    0n,
    data,
    "Risturn payi %50 -> %70",
  ]);
  return (await read(addr.gov, abi.gov, "proposalCount")) as bigint;
}

export async function oyVer(teklifId: bigint, id: ActorId, destek: boolean) {
  return send(id, addr.gov, abi.gov, "castVote", [teklifId, destek]);
}

export async function oylamaBitir(teklifId: bigint) {
  // Oylama süresini geçir — yalnızca yerel demo zincirinde mümkündür.
  await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "evm_increaseTime",
      params: [3 * 24 * 60 * 60 + 60],
    }),
  });
  await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "evm_mine", params: [] }),
  });
  return send("kurucu", addr.gov, abi.gov, "execute", [teklifId]);
}

export async function oylamaDurumu(teklifId: bigint) {
  const [durum, oylar, yeterSayi] = await Promise.all([
    read(addr.gov, abi.gov, "state", [teklifId]) as Promise<number>,
    read(addr.gov, abi.gov, "votesOf", [teklifId]) as Promise<[bigint, bigint]>,
    read(addr.gov, abi.gov, "quorumRequired", [teklifId]) as Promise<bigint>,
  ]);
  return {
    durum,
    lehte: oylar[0],
    aleyhte: oylar[1],
    katilim: oylar[0] + oylar[1],
    yeterSayi,
  };
}

export const eth = (v: bigint) => formatEther(v);

/* ------------------------------------------------------------------ ilerleme */

export type Ilerleme = {
  poolId: bigint | null;
  offerId: bigint | null;
  exchangeId: bigint | null;
  kapananDonem: bigint | null;
  teklifId: bigint | null;
  tamamlanan: number;
};

/**
 * Demo hangi adımda kaldı — tarayıcı yenilense de zincirden yeniden kurulur.
 * Sunum sırasında sayfanın kazara yenilenmesi demoyu bozmasın diye.
 */
export async function ilerlemeOku(): Promise<Ilerleme> {
  const [poolCount, offerCount, exchangeCount, donem, teklifSayisi] = (await Promise.all([
    read(addr.pool, abi.pool, "poolCount"),
    read(addr.market, abi.market, "offerCount"),
    read(addr.market, abi.market, "exchangeCount"),
    read(addr.vault, abi.vault, "currentPeriod"),
    read(addr.gov, abi.gov, "proposalCount"),
  ])) as [bigint, bigint, bigint, bigint, bigint];

  const poolId = poolCount > 0n ? poolCount : null;
  const offerId = offerCount > 0n ? offerCount : null;
  const exchangeId = exchangeCount > 0n ? exchangeCount : null;
  const kapananDonem = donem > 1n ? donem - 1n : null;
  const teklifId = teklifSayisi > 0n ? teklifSayisi : null;

  let tamamlanan = 0;
  if (poolId) tamamlanan = 1;

  if (poolId) {
    const havuz = (await read(addr.pool, abi.pool, "pools", [poolId])) as [
      boolean, string, bigint, bigint, bigint,
    ];
    if (havuz[3] > 0n || exchangeId) tamamlanan = 2;
  }
  if (offerId) tamamlanan = 3;

  if (exchangeId) {
    tamamlanan = 4;
    const takas = (await read(addr.market, abi.market, "exchanges", [exchangeId])) as [
      bigint, `0x${string}`, bigint, bigint, bigint, number,
    ];
    if (takas[5] === 2) tamamlanan = 5; // Completed
  }
  if (kapananDonem) tamamlanan = 6;

  if (kapananDonem) {
    const cekildi = (await read(addr.vault, abi.vault, "hasClaimed", [
      kapananDonem,
      accountOf("ali"),
    ])) as boolean;
    if (cekildi) tamamlanan = 7;
  }

  if (teklifId) {
    const durum = (await read(addr.gov, abi.gov, "state", [teklifId])) as number;
    if (durum === 4) tamamlanan = 8; // Executed
  }

  return { poolId, offerId, exchangeId, kapananDonem, teklifId, tamamlanan };
}

/* --------------------------------------------------- zincirden kimlik okuma */
/* Adımlar birbirine React state'i üzerinden bağlanmaz: her adım ihtiyacı olan
   kimliği zincirden okur. Böylece tek tık, otomatik oynatma ve sayfa yenileme
   aynı kod yolunu kullanır. */

export const sonHavuz = () => read(addr.pool, abi.pool, "poolCount") as Promise<bigint>;
export const sonTeklif = () => read(addr.market, abi.market, "offerCount") as Promise<bigint>;
export const sonTakas = () => read(addr.market, abi.market, "exchangeCount") as Promise<bigint>;
export const acikDonem = () => read(addr.vault, abi.vault, "currentPeriod") as Promise<bigint>;
export const sonTeklifNo = () => read(addr.gov, abi.gov, "proposalCount") as Promise<bigint>;
