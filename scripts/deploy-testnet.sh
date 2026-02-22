#!/usr/bin/env bash
# Deploy all ZK Seep contracts to Stellar testnet
# Usage: ./scripts/deploy-testnet.sh
# Prereq: `stellar keys` identity with testnet funds

set -euo pipefail

NETWORK="testnet"
SOURCE="${TESTNET_SOURCE:-alice}"
RPC_URL="https://soroban-testnet.stellar.org"
PASSPHRASE="Test SDF Network ; September 2015"
ENV_FILE=".env"

echo "=============================================="
echo "  ZK Seep - Testnet Deployment"
echo "=============================================="

# ── 1. Network & Identity ──────────────────────────
echo ""
echo "▸ Configuring network..."
stellar network add $NETWORK \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null || true

if ! stellar keys address $SOURCE 2>/dev/null; then
  echo "  ❌ Identity '$SOURCE' not found."
  echo "     Create one: stellar keys generate $SOURCE --network testnet --fund"
  exit 1
fi

SOURCE_ADDR=$(stellar keys address $SOURCE)
echo "  Using identity: $SOURCE_ADDR"

# ── Helper: install wasm, wait, then deploy ────────
deploy_contract() {
  local WASM_PATH=$1
  local LABEL=$2
  shift 2  # remaining args are constructor args (if any)

  echo ""
  echo "▸ Installing $LABEL wasm..."
  local WASM_HASH
  WASM_HASH=$(stellar contract install \
    --wasm "$WASM_PATH" \
    --source-account $SOURCE --network $NETWORK 2>&1 | tail -1)
  echo "  wasm hash: $WASM_HASH"

  # Wait for install to propagate on testnet
  echo "  Waiting 5s for ledger propagation..."
  sleep 5

  echo "▸ Deploying $LABEL..."
  local CONTRACT_ID
  CONTRACT_ID=$(stellar contract deploy \
    --wasm-hash "$WASM_HASH" \
    --source-account $SOURCE --network $NETWORK \
    "$@" 2>&1 | tail -1)
  echo "  $LABEL: $CONTRACT_ID"

  # Return the contract ID via stdout
  echo "$CONTRACT_ID"
}

# ── 2. Build contracts ─────────────────────────────
echo ""
echo "▸ Building contracts..."
stellar contract build --manifest-path contracts/mock-game-hub/Cargo.toml
stellar contract build --manifest-path contracts/mock-verifier/Cargo.toml
stellar contract build --manifest-path contracts/zk-seep/Cargo.toml
echo "  ✅ Contracts built"

# ── 3. Set Official Game Hub ID ──────────────────────
# Using the official hackathon testnet Game Hub contract
GAME_HUB_ID="CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG"
echo ""
echo "▸ Using Official Game Hub: $GAME_HUB_ID"

# ── 4. Deploy mock-verifier (no constructor args) ──
VERIFIER_ID=$(deploy_contract \
  target/wasm32v1-none/release/mock_verifier.wasm \
  "mock-verifier" | tail -1)

# ── 5. Deploy zk-seep (with constructor args) ──────
ZK_SEEP_ID=$(deploy_contract \
  target/wasm32v1-none/release/zk_seep.wasm \
  "zk-seep" \
  -- --admin "$SOURCE_ADDR" --game_hub "$GAME_HUB_ID" --verifier "$VERIFIER_ID" | tail -1)

# ── 6. Update .env ─────────────────────────────────
echo ""
echo "▸ Updating $ENV_FILE with new contract IDs..."
if [ -f "$ENV_FILE" ]; then
  sed -i '/^VITE_ZK_SEEP_CONTRACT_ID=/d' "$ENV_FILE"
  sed -i '/^VITE_GAME_HUB_CONTRACT_ID=/d' "$ENV_FILE"
  sed -i '/^VITE_MOCK_GAME_HUB_CONTRACT_ID=/d' "$ENV_FILE"
  sed -i '/^VITE_MOCK_VERIFIER_CONTRACT_ID=/d' "$ENV_FILE"
fi
echo "VITE_ZK_SEEP_CONTRACT_ID=$ZK_SEEP_ID" >> "$ENV_FILE"
echo "VITE_GAME_HUB_CONTRACT_ID=$GAME_HUB_ID" >> "$ENV_FILE"
echo "VITE_MOCK_VERIFIER_CONTRACT_ID=$VERIFIER_ID" >> "$ENV_FILE"
echo "  ✅ $ENV_FILE updated"

# ── 7. Summary ─────────────────────────────────────
echo ""
echo "=============================================="
echo "  Testnet Deployment Complete!"
echo "=============================================="
echo "  Network:       $NETWORK ($RPC_URL)"
echo "  game-hub:      $GAME_HUB_ID (official testnet)"
echo "  mock-verifier: $VERIFIER_ID"
echo "  zk-seep:       $ZK_SEEP_ID"
echo ""
echo "  Next steps:"
echo "    1. Update README.md with new contract IDs"
echo "    2. cd zk-seep-frontend && vercel --prod"
echo "=============================================="
