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
