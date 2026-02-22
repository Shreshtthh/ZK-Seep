# ZK Seep: Hackathon Technical Deep Dive & Localnet Guide

While the `README.md` covers the vision and architecture of ZK Seep, this document highlights the sheer technical depth, cryptographic problem-solving, and advanced Stellar Soroban integrations required to bring this 2-player ZK card game to life. 

---

## Technical Highlight: The Asynchronous Multi-Sig Payload Bug

One of the most complex challenges we solved was getting the `start_game` transaction to process correctly. The game requires both Player 1 (Host) and Player 2 (Joiner) to securely authorize the game initiation on-chain so stakes can be recorded.

Because the players are on completely different devices using WebRTC (PeerJS) to communicate, they cannot sign the transaction at the exact same time.

### The Problem
When Player 2 attempted to submit the `start_game` transaction containing Player 1's signature, the Soroban VM consistently threw a catastrophic `InvokeHostFunctionTrapped` error, followed by `Error(Auth, InvalidSignature)`. 

### The Investigation & Cryptographic Fix
Solving this required a deep dive into how the Stellar SDK constructs and serializes XDR footprints for smart contract execution:

1. **The Double-Simulation Footprint Drop**: Initially, Player 1 simulated the transaction to generate the Auth payload, signed it, and sent it to Player 2. Player 2 then *re-simulated* the transaction locally before submitting. **The Bug:** Because Player 2's simulation was no longer using Player 1's `sourceAccount`, the RPC dropped Player 1's nonce sequence from the transaction footprint entirely, causing the VM to trap.
   - *The Fix:* We bypassed standard submission wrappers and implemented a direct RPC `sendTransaction` call, submitting the precise, mathematically identical footprint that Player 1 originally simulated.

2. **The `toEnvelope()` Immutability Trap**: Even with the correct footprint, the network rejected Player 1's cryptographic signature. We discovered that the Stellar SDK's `tx.toEnvelope()` function generates a **disconnected copy** of the underlying XDR byte tree. 
   - *The Bug:* We successfully injected Player 1's signature into the `envelope` array, but were ultimately signing and submitting the original, unmodified `TransactionBuilder` object—which was essentially an empty simulation stub.
   - *The Fix:* We implemented a low-level reconstruction where the modified XDR envelope is exported back out to Base64 and fed *back* into `TransactionBuilder.fromXDR()`. This successfully locked the signatures to the payload, allowing the VM to verify the `require_auth_for_args` checks for both distinct cryptographic keypairs.

3. **Protocol 22 Diagnostics**: To diagnose this, we had to upgrade our error extraction logic to handle Stellar Protocol 22's `TransactionMetaV4` structures. The updated RPCs return parsed JSON objects rather than raw XDR strings, requiring dynamic union-type traversal to surface the exact VM contract panics natively in the browser console.

This fix ensures a flawless, decentralized WebRTC-to-Blockchain handshake where two distinct session wallets securely authorize a contract without a centralized coordinator.

---

## Known Issue: Localnet Docker Deployment (502 Bad Gateway + Protocol Mismatch)

When restarting the Stellar Quickstart Docker container, we hit two deployment blockers:

1. **502 Bad Gateway on `stellar contract deploy`**
   - **Cause:** The container was started **without** the `--enable-soroban-rpc` flag. `supervisorctl status` showed `stellar-rpc` was missing — nginx proxied to a non-existent process.
   - **Fix:** Always include `--enable-soroban-rpc` when starting the container.

2. **`"contract protocol number is newer than host", 25`**
   - **Cause:** Our contracts use `soroban-sdk = "25.0.2"` (protocol 25), but `stellar/quickstart:testing` only supported an older protocol.
   - **Fix:** Switched to `stellar/quickstart:latest` which supports protocol 25 (confirmed via `getNetwork` RPC).

**Working Docker command:**
```bash
docker run -d -p 8000:8000 --name stellar \
  stellar/quickstart:latest --standalone --enable-soroban-rpc
```

Then fund alice: `stellar keys fund alice --network localnet`

---

## Note: PeerJS "Lost connection to server" — Expected & Harmless

After a successful on-chain call, the console shows a PeerJS error:

```
[on-chain] make_bid success ✅
[Violation] 'setTimeout' handler took 169ms
[peer] Error: Lost connection to server.
```

**This is harmless.** PeerJS operates on two layers:
1. **Signaling server** (WebSocket to `0.peerjs.com`) — only used for the initial handshake to discover peers
2. **Data channel** (WebRTC, direct peer-to-peer) — carries all actual game sync data

By the time the game is running, the signaling server has already done its job. The free public PeerJS cloud server (`0.peerjs.com`) aggressively drops idle signaling connections to reclaim resources. Since no new peer negotiations are happening, it closes the WebSocket. The `setTimeout` violation (169ms main thread block from on-chain processing) may accelerate this by delaying PeerJS's heartbeat response.

**The game is unaffected** — all moves, bids, and state sync flow over the WebRTC data channel, which is a direct browser-to-browser connection that doesn't need the signaling server once established.

---

## Design Decision: Off-Chain Turn Enforcement

The on-chain `make_move` contract does **not** enforce turn order (`NotYourTurn` check removed).

**Why:** PeerJS delivers opponent moves in ~50ms, but on-chain transactions take ~5 seconds to confirm. If the contract enforces strict turn alternation, a race condition occurs: Player A receives Player B's move via PeerJS and immediately plays their next move, but Player B's on-chain transaction hasn't confirmed yet → the contract still thinks it's Player B's turn → `NotYourTurn` error.

**What the contract DOES enforce:**
- ✅ Player identity (only registered players can make moves)
- ✅ ZK proof validation (house moves must prove card ownership)
- ✅ Game phase validity (can't move during bidding, etc.)
- ✅ Score and state tracking

**What the frontend enforces:**
- Turn order (the local game engine only allows moves when it's your turn)
- Move legality (valid card plays, legal captures, house rules)

**Production improvement:** Add an on-chain move-sequence counter that accepts moves in any order but tracks sequence numbers, enabling replay-attack prevention and post-game audit trails.

---

## Note: Same Freighter Wallet on Both Players (Localnet)

On localnet, you may notice that both players can use the **same Freighter browser wallet** and the game still works. This is by design:

- On localnet, Freighter is **not used** for game identity. Instead, each browser tab generates its own **ephemeral session wallet** (random keypair stored in `sessionStorage`, which is per-tab).
- The on-chain `start_game` contract checks `player1 != player2` using the **session wallet addresses**, not the Freighter address.
- Since each tab has its own `sessionStorage`, each tab automatically gets a unique session wallet — even if the same Freighter wallet is connected in both.

On testnet/mainnet, the Freighter wallet funds the session wallet via a transfer, so the Freighter identity is involved but the session wallet is still the on-chain game participant.

---

## Localnet Setup Guide (Real ZK Verification)

Testnet enforces a strict 600M CPU instruction cap. While we deployed a `mock-verifier` to Testnet to demonstrate the game flow, the **real UltraHonk ZK Verifier** requires ~367M CPU instructions, placing it right at the absolute brink of the network limits.

To experience ZK Seep with **full cryptographic zero-knowledge verification**, you must run the project on Localnet with `--limits unlimited`.

### 1. Start the Stellar Localnet Node
Launch the Stellar Quickstart image via Docker, overriding the compute limits:

```bash
docker run --rm -it \
  -p 8000:8000 \
  --name stellar \
  stellar/quickstart:soroban-dev \
  --local \
  --limits unlimited
```

### 2. Fund the Admin Identity
In a new terminal, configure your local Stellar CLI to talk to the localnet and create/fund the `alice` deployer account:

```bash
stellar network add localnet \
  --rpc-url "http://localhost:8000/soroban/rpc" \
  --network-passphrase "Standalone Network ; February 2017"

stellar keys generate alice --network localnet --fund

#or if alice is already generated
stellar keys fund alice --network localnet 
```

### 3. Run the Deployment Script
We wrote a streamlined Bash script that compiles the contracts, deploys the `mock-game-hub`, the `verifier`, and the main `zk-seep` contract, initializes them with the correct cross-contract IDs, and writes them directly to the frontend's environment file.

```bash
# Ensure the script is executable
chmod +x scripts/deploy-localnet.sh

# Run the localnet deployer
./scripts/deploy-localnet.sh
```

### 4. Start the Frontend
With the Localnet node running and the contracts securely deployed and initialized:

```bash
cd zk-seep-frontend
bun run dev
```

1. Open two browser windows.
2. Click **Create & Fund Game Wallet** in both (creates a session keypair and funds it via local Friendbot in one step).
3. Player 1 Creates the game; Player 2 Joins.
4. Enjoy the world's first fully verifiable, Zero-Knowledge P2P card game!
