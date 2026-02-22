#!/usr/bin/env bash
# Deploy all ZK Seep contracts to Stellar localnet (Docker quickstart)
# Usage: ./scripts/deploy-localnet.sh
# Prereq: Docker quickstart running on http://localhost:8000

set -euo pipefail

NETWORK="localnet"
SOURCE="alice"
RPC_URL="http://localhost:8000/soroban/rpc"
PASSPHRASE="Standalone Network ; February 2017"
ENV_FILE=".env.local"

echo "=============================================="
echo "  ZK Seep - Localnet Deployment"
echo "=============================================="

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
stellar contract build --manifest-path contracts/mock-verifier/Cargo.toml
stellar contract build --manifest-path contracts/zk-seep/Cargo.toml
echo "  ✅ Contracts built"

# ── 3. Deploy mock-game-hub ────────────────────────
echo ""
echo "▸ Deploying mock-game-hub..."
MOCK_HUB_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_game_hub.wasm \
  --source-account $SOURCE --network $NETWORK 2>&1 | tail -1)
echo "  mock-game-hub: $MOCK_HUB_ID"

# ── 4. Deploy mock-verifier ────────────────────────
echo ""
echo "▸ Deploying mock-verifier..."
VERIFIER_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_verifier.wasm \
  --source-account $SOURCE --network $NETWORK 2>&1 | tail -1)
echo "  mock-verifier: $VERIFIER_ID"

# ── 5. Deploy zk-seep (skip auto-init) ─────────────
echo ""
echo "▸ Deploying zk-seep..."
SOURCE_ADDR=$(stellar keys address $SOURCE)
ZK_SEEP_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/zk_seep.wasm \
  --source-account $SOURCE --network $NETWORK \
  -- --admin "$SOURCE_ADDR" --game_hub "$MOCK_HUB_ID" --verifier "$VERIFIER_ID" 2>&1 | tail -1)
echo "  zk-seep: $ZK_SEEP_ID"

# Note: __constructor runs automatically at deploy time with the args above.
# No separate initialize step needed.

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
echo "  Deployment Complete!"
echo "=============================================="
echo "  Network:       $NETWORK ($RPC_URL)"
echo "  mock-game-hub: $MOCK_HUB_ID"
echo "  zk-seep:       $ZK_SEEP_ID"
echo "  verifier:      $VERIFIER_ID"
echo ""
echo "  Restart your dev server to pick up new IDs:"
echo "    cd zk-seep-frontend && bun run dev"
echo "=============================================="
