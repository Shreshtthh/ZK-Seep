# Localnet Deployment Guide

Deploy all 3 contracts (`mock-game-hub`, `mock-verifier`, `zk-seep`) to a local Stellar network for hackathon demo.

> **Why localnet?** UltraHonk proof verification exceeds Soroban's testnet CPU instruction cap (~367M vs 400M limit). Localnet with `--limits unlimited` removes this constraint. Judges confirmed this is acceptable.

---

## Prerequisites

1. **Docker** installed and running
2. **Stellar CLI** installed (`stellar --version`)
3. **Contracts built** (`bun run build`)

---

## Step 1: Start Stellar Quickstart

```bash
docker run --rm -it \
  -p 8000:8000 \
  --name stellar \
  stellar/quickstart:latest \
  --standalone \
  --limits unlimited
```

Wait for the container to be ready (check `http://localhost:8000`).

---

## Step 2: Create & Fund a Local Identity

```bash
# Generate a new identity for local deployment
stellar keys generate localadmin --network local

# Fund it on the standalone network
stellar keys fund localadmin --network local
```

> If "local" network isn't configured in Stellar CLI, add it:
> ```bash
> stellar network add local \
>   --rpc-url http://localhost:8000/soroban/rpc \
>   --network-passphrase "Standalone Network ; February 2017"
> ```

---

## Step 3: Deploy Contracts

Deploy in order: mock-game-hub → mock-verifier → zk-seep (since zk-seep depends on the other two).

### 3a. Deploy mock-game-hub

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_game_hub.wasm \
  --source localadmin \
  --network local \
  --limits unlimited
```

Save the output contract ID as `MOCK_HUB_ID`.

### 3b. Deploy mock-verifier

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_verifier.wasm \
  --source localadmin \
  --network local \
  --limits unlimited
```

Save the output contract ID as `MOCK_VERIFIER_ID`.

### 3c. Deploy zk-seep

The zk-seep contract constructor takes 3 arguments: `(admin, game_hub, verifier)`.

```bash
# First install the WASM
stellar contract install \
  --wasm target/wasm32v1-none/release/zk_seep.wasm \
  --source localadmin \
  --network local \
  --limits unlimited

# Then deploy with constructor args
stellar contract deploy \
  --wasm-hash <WASM_HASH_FROM_ABOVE> \
  --source localadmin \
  --network local \
  --limits unlimited \
  -- \
  --admin $(stellar keys address localadmin) \
  --game-hub $MOCK_HUB_ID \
  --verifier $MOCK_VERIFIER_ID
```

Save the output contract ID as `ZK_SEEP_ID`.

---

## Step 4: Configure Frontend

Create `zk-seep-frontend/.env.local` (Vite auto-loads this and it overrides `.env`):

```env
# Localnet configuration — delete this file to revert to testnet
VITE_SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
VITE_NETWORK_PASSPHRASE=Standalone Network ; February 2017
VITE_ZK_SEEP_CONTRACT_ID=<ZK_SEEP_ID>
VITE_MOCK_GAME_HUB_CONTRACT_ID=<MOCK_HUB_ID>
VITE_MOCK_VERIFIER_CONTRACT_ID=<MOCK_VERIFIER_ID>
```

Then start the frontend:

```bash
cd zk-seep-frontend && bun run dev
```

---

## Switching Back to Testnet

Simply delete (or rename) the `.env.local` file:

```bash
rm zk-seep-frontend/.env.local
```

The frontend will fall back to the `.env` values (testnet).

---

## Quick Reference

| Item               | Localnet Value                              |
|--------------------|---------------------------------------------|
| RPC URL            | `http://localhost:8000/soroban/rpc`          |
| Network Passphrase | `Standalone Network ; February 2017`        |
| Docker Image       | `stellar/quickstart:latest`                 |
| CLI Flag           | `--limits unlimited`                        |
| Frontend Override  | `zk-seep-frontend/.env.local`               |

---

## Cleanup

To fully remove localnet support:
1. Delete this file (`localnet.md`)
2. Delete `zk-seep-frontend/.env.local` (if created)
3. Stop the Docker container: `docker stop stellar`
