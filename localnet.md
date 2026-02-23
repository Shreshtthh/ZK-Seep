# Localnet Deployment Guide

Deploy all contracts to a local Stellar network with **real UltraHonk ZK proof verification**.

> **Why localnet?** UltraHonk proof verification exceeds Soroban's testnet CPU instruction cap (~367M vs 400M limit). Localnet with `--limits unlimited` removes this constraint. Judges confirmed this is acceptable.

---

## Prerequisites

1. **Docker** installed and running
2. **Stellar CLI** installed (`stellar --version`)
3. **Rust** with `wasm32v1-none` target (`rustup target add wasm32v1-none`)
4. **Noir tooling** — `nargo` (v1.0.0-beta.9) and `bb` (v0.87.0) for circuit compilation
5. **UltraHonk verifier repo** cloned alongside this project:

```bash
cd ..  # parent directory of Zk-Seep
git clone https://github.com/indextree/ultrahonk_soroban_contract.git
```

Your directory structure should look like:
```
parent/
├── Zk-Seep/      # this repo
└── ultrahonk_soroban_contract/  # real ZK verifier
```

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

## Step 2: Generate Circuit Artifacts

Compile the `hand_contains` Noir circuit and generate the verification key:

```bash
cd circuits/hand_contains
nargo compile
bb write_vk --oracle_hash keccak -b target/hand_contains.json -o target/vk
bb prove --oracle_hash keccak -b target/hand_contains.json -w target/hand_contains.gz -o target/proof
cd ../..
```

This produces the VK file at `circuits/hand_contains/target/vk`, which the UltraHonk verifier contract needs at deploy time.

---

## Step 3: Deploy (Automated)

The deploy script handles everything — network setup, building, and deploying all contracts:

```bash
./scripts/deploy-localnet.sh
```

This will:
1. Configure the local network and fund an identity
2. Build `mock-game-hub` and `zk-seep` contracts
3. Build the UltraHonk verifier (from `../ultrahonk_soroban_contract`)
4. Deploy `mock-game-hub` (no constructor args)
5. Deploy the **real UltraHonk verifier** with the `hand_contains` VK baked in
6. Deploy `zk-seep` wired to both contracts
7. Write contract IDs to `.env.local`

---

## Step 3 (Alternative): Deploy Manually

### 3a. Create & Fund a Local Identity

```bash
stellar network add localnet \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

stellar keys generate alice --network localnet --fund
```

### 3b. Build Contracts

```bash
# Game contracts
stellar contract build --manifest-path contracts/mock-game-hub/Cargo.toml
stellar contract build --manifest-path contracts/zk-seep/Cargo.toml

# UltraHonk verifier (separate repo)
cd ../ultrahonk_soroban_contract
stellar contract build --optimize
cd ../Zk-Seep
```

### 3c. Deploy mock-game-hub

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/mock_game_hub.wasm \
  --source-account alice --network localnet
```
Save the output contract ID as `MOCK_HUB_ID`.

### 3d. Deploy UltraHonk Verifier (with VK)

```bash
stellar contract deploy \
  --wasm ../ultrahonk_soroban_contract/target/wasm32v1-none/release/ultrahonk_soroban_contract.wasm \
  --source-account alice --network localnet \
  -- --vk_bytes-file-path circuits/hand_contains/target/vk
```
Save the output contract ID as `VERIFIER_ID`.

### 3e. Deploy zk-seep

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/zk_seep.wasm \
  --source-account alice --network localnet \
  -- --admin $(stellar keys address alice) --game_hub $MOCK_HUB_ID --verifier $VERIFIER_ID
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
VITE_MOCK_VERIFIER_CONTRACT_ID=<VERIFIER_ID>
```

Then start the frontend:

```bash
cd zk-seep-frontend && bun run dev
```

---

## Testnet vs Localnet

| | Testnet | Localnet |
|---|---|---|
| **Verifier** | `mock-verifier` (always returns true) | **UltraHonk verifier** (real ZK proof verification) |
| **CPU Limits** | 400M instructions (capped) | Unlimited |
| **Deploy script** | `scripts/deploy-testnet.sh` | `scripts/deploy-localnet.sh` |
| **Why** | Demo transaction flow | Prove ZK verification actually works |

---

## Switching Back to Testnet

Simply delete the `.env.local` file:

```bash
rm zk-seep-frontend/.env.local
```

The frontend will fall back to the `.env` values (testnet with mock-verifier).

---

## Quick Reference

| Item               | Localnet Value                              |
|--------------------|---------------------------------------------|
| RPC URL            | `http://localhost:8000/soroban/rpc`          |
| Network Passphrase | `Standalone Network ; February 2017`        |
| Docker Image       | `stellar/quickstart:latest`                 |
| CLI Flag           | `--limits unlimited`                        |
| Frontend Override  | `zk-seep-frontend/.env.local`               |
| Verifier           | `ultrahonk_soroban_contract` (real ZK)      |
| Circuit VK         | `circuits/hand_contains/target/vk`          |

---

## Cleanup

1. Delete `zk-seep-frontend/.env.local` (if created)
2. Stop the Docker container: `docker stop stellar`
