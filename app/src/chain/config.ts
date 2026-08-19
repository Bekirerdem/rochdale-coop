import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

import CoopRegistryAbi from "./CoopRegistry.abi.json";
import SupplyPoolAbi from "./SupplyPool.abi.json";
import CoopMarketAbi from "./CoopMarket.abi.json";
import PatronageVaultAbi from "./PatronageVault.abi.json";
import TreasuryRouterAbi from "./TreasuryRouter.abi.json";
import EducationSBTAbi from "./EducationSBT.abi.json";
import CoopGovernanceAbi from "./CoopGovernance.abi.json";

export const abi = {
  registry: CoopRegistryAbi,
  pool: SupplyPoolAbi,
  market: CoopMarketAbi,
  vault: PatronageVaultAbi,
  router: TreasuryRouterAbi,
  sbt: EducationSBTAbi,
  gov: CoopGovernanceAbi,
} as const;

/** Anvil — yerel demo zinciri. Sunumda internet bağımlılığı olmasın diye. */
export const localChain = defineChain({
  id: 31337,
  name: "Kooperatif Demo Zinciri",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

type Adresler = {
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

/** Base Sepolia — deploy sonrası .env.local ile doldurulur. */
const BASE_SEPOLIA: Adresler = {
  registry: (import.meta.env.VITE_REGISTRY ?? "0x") as `0x${string}`,
  pool: (import.meta.env.VITE_POOL ?? "0x") as `0x${string}`,
  market: (import.meta.env.VITE_MARKET ?? "0x") as `0x${string}`,
  vault: (import.meta.env.VITE_VAULT ?? "0x") as `0x${string}`,
  router: (import.meta.env.VITE_ROUTER ?? "0x") as `0x${string}`,
  sbt: (import.meta.env.VITE_SBT ?? "0x") as `0x${string}`,
  gov: (import.meta.env.VITE_GOV ?? "0x") as `0x${string}`,
  community: (import.meta.env.VITE_COMMUNITY ?? "0x") as `0x${string}`,
  reinvestment: (import.meta.env.VITE_REINVESTMENT ?? "0x") as `0x${string}`,
  education: (import.meta.env.VITE_EDUCATION ?? "0x") as `0x${string}`,
  interCoop: (import.meta.env.VITE_INTERCOOP ?? "0x") as `0x${string}`,
};

/** VITE_NET=baseSepolia ile gerçek test ağına geçilir. */
export const agAdi = (import.meta.env.VITE_NET ?? "local") as "local" | "baseSepolia";
export const gercekAg = agAdi === "baseSepolia";
export const chain = gercekAg ? baseSepolia : localChain;
export const addr = gercekAg ? BASE_SEPOLIA : YEREL;

/** Basescan bağlantısı — sunumda "gerçekten zincirde" kanıtı için. */
export const kasifUrl = (adres: string) =>
  gercekAg ? `https://sepolia.basescan.org/address/${adres}` : null;

/**
 * Demo aktörleri. Sunum sırasında beş ayrı cüzdan onayı beklemek akışı
 * bozduğu için her aktör kendi anahtarıyla doğrudan imzalar — işlemler
 * yine gerçektir, yalnızca imza adımı otomatiktir.
 *
 * Base Sepolia'da bu anahtarlar yalnızca test hesaplarıdır; Anvil'in
 * herkese açık varsayılan anahtarlarıdır ve GERÇEK PARA TUTMAMALIDIR.
 */
export const actors = {
  kurucu: {
    label: "Kooperatif Yönetimi",
    key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  ali: {
    label: "Ali",
    note: "üretici · 10.000 TL sermaye",
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  veli: {
    label: "Veli",
    note: "üretici · 90.000 TL sermaye",
    key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
  ayse: {
    label: "Ayşe",
    note: "üretici · yeni ortak",
    key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  },
  alici: {
    label: "Toptancı",
    note: "alıcı",
    key: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  },
} as const;

export type ActorId = keyof typeof actors;

const rpc = gercekAg
  ? (import.meta.env.VITE_RPC ?? "https://sepolia.base.org")
  : "http://127.0.0.1:8545";

export const publicClient = createPublicClient({ chain, transport: http(rpc) });

export function walletFor(id: ActorId) {
  return createWalletClient({
    account: privateKeyToAccount(actors[id].key as `0x${string}`),
    chain,
    transport: http(rpc),
  });
}

export function accountOf(id: ActorId) {
  return privateKeyToAccount(actors[id].key as `0x${string}`).address;
}

/* ------------------------------------------------------------ MetaMask */

/**
 * Kullanıcının kendi cüzdanıyla imzalaması için. Demo akışı otomatik
 * anahtarlarla ilerler; bu, izleyiciye gerçek bir imza göstermek veya
 * kooperatife dışarıdan üyelik başvurusu yapmak istendiğinde kullanılır.
 */
export async function metamaskCuzdani() {
  const eth = (window as unknown as { ethereum?: never }).ethereum;
  if (!eth) throw new Error("MetaMask bulunamadı");

  const { custom } = await import("viem");
  const wallet = createWalletClient({ chain, transport: custom(eth) });
  const [hesap] = await wallet.requestAddresses();

  const mevcut = await wallet.getChainId();
  if (mevcut !== chain.id) {
    await wallet.switchChain({ id: chain.id }).catch(async () => {
      await wallet.addChain({ chain });
    });
  }
  return { wallet, hesap };
}
