#!/usr/bin/env bash
# Deploy all ZK Seep contracts to Stellar localnet (Docker quickstart)
# Uses the REAL UltraHonk verifier for on-chain ZK proof verification.
# Usage: ./scripts/deploy-localnet.sh
# Prereq: Docker quickstart running on http://localhost:8000

set -euo pipefail

NETWORK="localnet"
SOURCE="alice"
RPC_URL="http://localhost:8000/soroban/rpc"
PASSPHRASE="Standalone Network ; February 2017"
ENV_FILE=".env.local"
ULTRAHONK_DIR="../ultrahonk_soroban_contract"
VK_PATH="circuits/hand_contains/target/vk"

echo "=============================================="
echo "  ZK Seep - Localnet Deployment (Real Verifier)"
echo "=============================================="

# ── 0. Check ultrahonk verifier repo ──────────────
if [ ! -d "$ULTRAHONK_DIR" ]; then
  echo ""
  echo "ERROR: ultrahonk_soroban_contract not found at $ULTRAHONK_DIR"
  echo "Clone it first:"
  echo "  cd $(dirname \"$0\")/../.. && git clone https://github.com/indextree/ultrahonk_soroban_contract.git"
  exit 1
fi

# ── 1. Network & Identity ──────────────────────────
echo ""
echo "▸ Configuring network & identity..."
stellar network add $NETWORK \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null || true

if ! stellar keys address $SOURCE 2>/dev/null; then
  echo "  Creating & funding $SOURCE..."
  stellar keys generate $SOURCE --network $NETWORK --fund
else
  echo "  Identity '$SOURCE' exists: $(stellar keys address $SOURCE)"
fi

# ── 2. Build contracts ─────────────────────────────
echo ""
echo "▸ Building contracts..."
stellar contract build --manifest-path contracts/mock-game-hub/Cargo.toml
stellar contract build --manifest-path contracts/zk-seep/Cargo.toml
echo "  ✅ Game contracts built"

echo ""
echo "▸ Building UltraHonk verifier..."
(cd "$ULTRAHONK_DIR" && stellar contract build --optimize)
echo "  ✅ UltraHonk verifier built"

# ── 3. Deploy mock-game-hub ────────────────────────
echo ""
echo "▸ Deploying mock-game-hub..."
MOCK_HUB_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_game_hub.wasm \
  --source-account $SOURCE --network $NETWORK 2>&1 | tail -1)
echo "  mock-game-hub: $MOCK_HUB_ID"

# ── 4. Deploy UltraHonk verifier (with VK) ────────
echo ""
echo "▸ Deploying UltraHonk verifier (real ZK verification)..."

if [ ! -f "$VK_PATH" ]; then
  echo "  ERROR: VK not found at $VK_PATH"
  echo "  Generate circuit artifacts first:"
  echo "    cd circuits/hand_contains && nargo compile && bb write_vk --oracle_hash keccak -b target/hand_contains.json -o target/vk"
  exit 1
fi

VERIFIER_ID=$(stellar contract deploy \
  --wasm "$ULTRAHONK_DIR/target/wasm32v1-none/release/ultrahonk_soroban_contract.wasm" \
  --source-account $SOURCE --network $NETWORK \
  -- --vk_bytes-file-path "$VK_PATH" 2>&1 | tail -1)
echo "  ultrahonk-verifier: $VERIFIER_ID"

# ── 5. Deploy zk-seep ─────────────────────────────
echo ""
echo "▸ Deploying zk-seep..."
SOURCE_ADDR=$(stellar keys address $SOURCE)
ZK_SEEP_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/zk_seep.wasm \
  --source-account $SOURCE --network $NETWORK \
  -- --admin "$SOURCE_ADDR" --game_hub "$MOCK_HUB_ID" --verifier "$VERIFIER_ID" 2>&1 | tail -1)
echo "  zk-seep: $ZK_SEEP_ID"

# ── 6. Update .env.local ───────────────────────────
echo ""
echo "▸ Writing $ENV_FILE..."
cat > "$ENV_FILE" << EOF
VITE_SOROBAN_RPC_URL=$RPC_URL
VITE_NETWORK_PASSPHRASE=$PASSPHRASE
VITE_ZK_SEEP_CONTRACT_ID=$ZK_SEEP_ID
VITE_MOCK_GAME_HUB_CONTRACT_ID=$MOCK_HUB_ID
VITE_MOCK_VERIFIER_CONTRACT_ID=$VERIFIER_ID
EOF
echo "  ✅ $ENV_FILE updated"

# ── 7. Summary ─────────────────────────────────────
echo ""
echo "=============================================="
echo "  Deployment Complete! (Real ZK Verification)"
echo "=============================================="
echo "  Network:            $NETWORK ($RPC_URL)"
echo "  mock-game-hub:      $MOCK_HUB_ID"
echo "  ultrahonk-verifier: $VERIFIER_ID"
echo "  zk-seep:            $ZK_SEEP_ID"
echo ""
echo "  Restart your dev server to pick up new IDs:"
echo "    cd zk-seep-frontend && bun run dev"
echo "=============================================="
