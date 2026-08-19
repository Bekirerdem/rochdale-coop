#!/usr/bin/env bash
# Base Sepolia'ya dagitim.
#   PRIVATE_KEY   : dagitimi yapacak cuzdanin ozel anahtari (0x ile)
#   BASESCAN_KEY  : (istege bagli) kontrat dogrulamasi icin
set -e
: "${PRIVATE_KEY:?PRIVATE_KEY gerekli}"

RPC="${RPC:-https://sepolia.base.org}"
ARGS=(script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast)
[ -n "$BASESCAN_KEY" ] && ARGS+=(--verify --etherscan-api-key "$BASESCAN_KEY")

forge script "${ARGS[@]}" | tee /tmp/base-deploy.log

echo ""
echo "--- app/.env.local icin ---"
grep -E "^  (CoopRegistry|SupplyPool|CoopMarket|PatronageVault|TreasuryRouter|EducationSBT|CoopGovernance|Topluluk|YenidenYatirim|Egitim|Dayanisma)" /tmp/base-deploy.log \
| sed -E 's/^ +//; s/ +: /=/' \
| sed -E 's/^CoopRegistry=/VITE_REGISTRY=/; s/^SupplyPool=/VITE_POOL=/; s/^CoopMarket=/VITE_MARKET=/; s/^PatronageVault=/VITE_VAULT=/; s/^TreasuryRouter=/VITE_ROUTER=/; s/^EducationSBT=/VITE_SBT=/; s/^CoopGovernance=/VITE_GOV=/; s/^Topluluk=/VITE_COMMUNITY=/; s/^YenidenYatirim=/VITE_REINVESTMENT=/; s/^Egitim=/VITE_EDUCATION=/; s/^Dayanisma=/VITE_INTERCOOP=/'
echo "VITE_NET=baseSepolia"
