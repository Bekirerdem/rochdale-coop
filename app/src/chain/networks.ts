import { defineChain, type Chain } from "viem";
import { baseSepolia, sepolia } from "viem/chains";

/** Yerel geliştirme zinciri (anvil). */
export const localChain = defineChain({
  id: 31337,
  name: "Yerel Zincir",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export type AgAnahtar = "local" | "sepolia" | "baseSepolia";

export type Adresler = {
  registry: `0x${string}`;
  pool: `0x${string}`;
  market: `0x${string}`;
  vault: `0x${string}`;
  router: `0x${string}`;
  sbt: `0x${string}`;
  gov: `0x${string}`;
  community: `0x${string}`;
  reinvestment: `0x${string}`;
  education: `0x${string}`;
  interCoop: `0x${string}`;
};

export type AgTanimi = {
  anahtar: AgAnahtar;
  ad: string;
  chain: Chain;
  /** Birincil uç nokta. */
  rpc: string;
  /** Yedekler — biri yanıt vermezse sıradaki denenir. */
  yedekRpc: string[];
  kasif: string | null;
  adresler: Adresler | null;
};

/** forge script deterministik dağıttığı için yerel adresler sabittir. */
const YEREL: Adresler = {
  registry: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  pool: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  market: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  vault: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  router: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  sbt: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  gov: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
  community: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  reinvestment: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  education: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  interCoop: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
};

/**
 * Test ağı adresleri deploy sonrası .env.local ile gelir.
 * Vite `import.meta.env` erişimlerini derleme sırasında statik olarak
 * değiştirir; bu yüzden anahtarlar dinamik kurulamaz, tek tek yazılır.
 */
const BASE_SEPOLIA: Adresler | null = import.meta.env.VITE_BASE_REGISTRY
  ? {
      registry: import.meta.env.VITE_BASE_REGISTRY as `0x${string}`,
      pool: import.meta.env.VITE_BASE_POOL as `0x${string}`,
      market: import.meta.env.VITE_BASE_MARKET as `0x${string}`,
      vault: import.meta.env.VITE_BASE_VAULT as `0x${string}`,
      router: import.meta.env.VITE_BASE_ROUTER as `0x${string}`,
      sbt: import.meta.env.VITE_BASE_SBT as `0x${string}`,
      gov: import.meta.env.VITE_BASE_GOV as `0x${string}`,
      community: import.meta.env.VITE_BASE_COMMUNITY as `0x${string}`,
      reinvestment: import.meta.env.VITE_BASE_REINVESTMENT as `0x${string}`,
      education: import.meta.env.VITE_BASE_EDUCATION as `0x${string}`,
      interCoop: import.meta.env.VITE_BASE_INTERCOOP as `0x${string}`,
    }
  : null;

const ETH_SEPOLIA: Adresler | null = import.meta.env.VITE_SEPOLIA_REGISTRY
  ? {
      registry: import.meta.env.VITE_SEPOLIA_REGISTRY as `0x${string}`,
      pool: import.meta.env.VITE_SEPOLIA_POOL as `0x${string}`,
      market: import.meta.env.VITE_SEPOLIA_MARKET as `0x${string}`,
      vault: import.meta.env.VITE_SEPOLIA_VAULT as `0x${string}`,
      router: import.meta.env.VITE_SEPOLIA_ROUTER as `0x${string}`,
      sbt: import.meta.env.VITE_SEPOLIA_SBT as `0x${string}`,
      gov: import.meta.env.VITE_SEPOLIA_GOV as `0x${string}`,
      community: import.meta.env.VITE_SEPOLIA_COMMUNITY as `0x${string}`,
      reinvestment: import.meta.env.VITE_SEPOLIA_REINVESTMENT as `0x${string}`,
      education: import.meta.env.VITE_SEPOLIA_EDUCATION as `0x${string}`,
      interCoop: import.meta.env.VITE_SEPOLIA_INTERCOOP as `0x${string}`,
    }
  : null;

export const AGLAR: Record<AgAnahtar, AgTanimi> = {
  local: {
    anahtar: "local",
    ad: "Yerel zincir",
    chain: localChain,
    rpc: "http://127.0.0.1:8545",
    yedekRpc: [],
    kasif: null,
    adresler: YEREL,
  },
  baseSepolia: {
    anahtar: "baseSepolia",
    ad: "Base Sepolia",
    chain: baseSepolia,
    // Resmî uç nokta (sepolia.base.org) zaman zaman 503 döndürüyor; bu
    // yüzden birincil değil. Sıra, gözlemlenen güvenilirliğe göre.
    rpc: import.meta.env.VITE_BASE_RPC ?? "https://base-sepolia-rpc.publicnode.com",
    yedekRpc: [
      "https://sepolia.base.org",
      "https://base-sepolia.gateway.tenderly.co",
      "https://base-sepolia.drpc.org",
    ],
    kasif: "https://sepolia.basescan.org",
    adresler: BASE_SEPOLIA,
  },
  sepolia: {
    anahtar: "sepolia",
    ad: "Ethereum Sepolia",
    chain: sepolia,
    rpc: import.meta.env.VITE_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com",
    yedekRpc: ["https://sepolia.drpc.org", "https://rpc.sepolia.org"],
    kasif: "https://sepolia.etherscan.io",
    adresler: ETH_SEPOLIA,
  },
};

/** Kurulu ağlar — adresleri tanımlı olanlar. */
export const kuruluAglar = () =>
  (Object.values(AGLAR) as AgTanimi[]).filter((a) => a.adresler !== null);

const KAYIT_ANAHTARI = "coop.ag";

export function kayitliAg(): AgAnahtar {
  const k = localStorage.getItem(KAYIT_ANAHTARI) as AgAnahtar | null;
  if (k && AGLAR[k]?.adresler) return k;
  const varsayilan = (import.meta.env.VITE_NET as AgAnahtar) ?? "local";
  return AGLAR[varsayilan]?.adresler ? varsayilan : (kuruluAglar()[0]?.anahtar ?? "local");
}

export function agKaydet(k: AgAnahtar) {
  localStorage.setItem(KAYIT_ANAHTARI, k);
}

export const txUrl = (ag: AgTanimi, hash: string) =>
  ag.kasif ? `${ag.kasif}/tx/${hash}` : null;

export const adresUrl = (ag: AgTanimi, adres: string) =>
  ag.kasif ? `${ag.kasif}/address/${adres}` : null;
