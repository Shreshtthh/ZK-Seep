# 🃏 ZK Seep — Zero-Knowledge Card Game on Stellar

> *Bringing South Asia's most popular card game to blockchain, with zero-knowledge proofs to eliminate the cheating that plagues existing platforms.*

**🎮 [Play Live](https://zk-seep.vercel.app)** · **📜 [Contract on Testnet](https://stellar.expert/explorer/testnet/contract/CCTI7YU4VJKERNO6Y2UHKVV4WNHIPDNAHG5OXNAMAJUKL5ZQBSEJ3QDV)** · **💻 [GitHub](https://github.com/Shreshtthh/ZK-Seep)**

---

## The Problem

**Seep** (also called *Sweep*) is a trick-taking card game played by **100M+ people** across India, Pakistan, and the South Asian diaspora. On Google Play, Seep apps have **100,000+ downloads** — but dig into the reviews and you'll find a recurring theme:

> ⭐ *"The bot always knows my cards"*
> ⭐ *"They bid 13 without even having a King"*
> ⭐ *"Rigged — the AI cheats every single time"*

The core problem is **information asymmetry**. In physical Seep, you trust that your opponent can't see your hand. In digital Seep, the server sees everything. Bots exploit this by:

- **Bidding cards they don't hold** — bidding 13 (King) when they have no King, but knowing *you* don't have one either
- **Building houses on phantom cards** — creating a house of value 11 when they don't hold a Jack
- **Perfect information play** — the server-side AI sees both hands and the deck order

**ZK Seep solves this.** Every bid and every house-building move cryptographically proves the player holds the card they claim — without revealing what else is in their hand.

---

## How ZK Proofs Fix Cheating

In Seep, there are two critical moments where a player claims to hold a specific card:

1. **Bidding** — "I bid 11" means "I have a Jack in my hand"
2. **House building** — "I build a house of value 12" means "I have a Queen to claim it later"

The player commits a **Poseidon2 hash** of their hand at the start of the game. For every bid and house move, they generate a ZK proof showing "my hand contains a card of this value" — verified against the committed hash.

**No one — not the opponent, not the server, not the blockchain — ever sees the actual hand.**

```
ZK Proof Circuit (hand_contains)
─────────────────────────────────
Private inputs:  hand[] (12 card values), salt
Public inputs:   hand_hash, target_value

Constraints:
  1. Poseidon2(hand ++ salt) == hand_hash
  2. ∃ i : hand[i] == target_value

Result: Proof that target_value ∈ hand
        without revealing hand contents
```

**Why Poseidon2?** It's a ZK-friendly hash — ~100x cheaper to prove inside a circuit compared to SHA-256 or Keccak.

---

## What is Seep?

Seep is a 2-player card game using a standard 52-card deck. The objective is to capture cards from the floor and score points. **Total points in the deck: 100.**

### Card Values & Scoring

- **Ace (A)** — Game value: 1, Score: 1 point each
- **2–10** — Game value: face value, Score: Spades = face value; 10♦ = 6 pts
- **Jack (J)** — Game value: 11, Score: J♠ = 11 pts
- **Queen (Q)** — Game value: 12, Score: Q♠ = 12 pts
- **King (K)** — Game value: 13, Score: K♠ = 13 pts

### Game Flow

1. 🃏 **Deal** — 4 cards to each player, 4 face-up on the floor
2. 💰 **Bidding** — Player 1 bids a value (9–13) + **ZK Proof** they hold that card
3. ♠️ **Play Phase** — Alternate turns, choosing from 7 move types:
   - **Throw** — Place card on floor (no proof needed)
   - **Pick Up** — Card value matches pile sum → capture (no proof needed)
   - **Build/Fix/Cement House** — Lock cards for future capture → **🔐 ZK Proof required**
4. 🔄 **Redeal** — When hands empty & cards remain in deck, deal 12 more each
5. 🏆 **Score** — Count captured cards, determine winner

**Houses** are piles worth 9–13 that "lock" cards on the floor. Building a house of value X means you're reserving those cards to pick up later with a card of value X. The ZK proof ensures you actually *have* that card.

**Seep Bonus:** Capture every card on the floor in one pickup = bonus points equal to the bid value. But three Seeps in one game cancels all Seep bonuses!

---

## Architecture

### Browser (React + TypeScript)

- **Game UI** — `ZkSeepGame.tsx` (1200+ lines)
- **Local Game Engine** — `SeepGame.ts` — full rule engine with all 7 move types
- **Sync Service** — Dual-mode: `BroadcastChannel` (localhost) or PeerJS WebRTC (cross-device)
- **Session Wallet** — Ephemeral Stellar `Keypair` in `sessionStorage`, signs silently
- **ZK Proof Generator** — Noir / Barretenberg, runs in the browser
- **On-Chain Hook** — Fires `start_game`, `make_bid`, `make_move`, `end_game` to the contract

### Stellar Network (Soroban)

- **ZK Seep Contract** — Game state, turn validation, ZK proof verification via external verifier
- **Mock Verifier** — Always returns `true` (testnet, where UltraHonk exceeds the 400M CPU cap)
- **Real UltraHonk Verifier** — Full ZK verification (~367M instructions, localnet with `--limits unlimited`)
- **Game Hub** — Official testnet Game Hub for points tracking and leaderboard

### Noir Circuit

- **hand_contains** — Poseidon2 hash + membership proof (pinned to Nargo 1.0.0-beta.9, bb 0.87.0)

---

## On-Chain vs. Local Verification

- **Testnet** → Mock Verifier (always `true`) — ~300K CPU instructions — ✅ Deployed
- **Localnet** (`--limits unlimited`) → Real UltraHonk Verifier — ~367M instructions — ✅ Works
- **Mainnet** → Real Verifier — Needs 400M+ cap — ⏳ Waiting for limit increase

The Stellar testnet currently has a **400M CPU instruction cap** per transaction. UltraHonk verification requires ~367M instructions — dangerously close to the limit. Per hackathon organizer guidance, **local deployment with `--limits unlimited` is accepted** for evaluation.

---

## Embedded Session Wallet

Traditional blockchain games require users to approve every transaction via their browser wallet. In a card game with 20+ moves per match, this is **unplayable**.

ZK Seep uses an **embedded session wallet**:

1. Player connects Freighter (one-time)
2. An ephemeral `Keypair` is generated and stored in `sessionStorage`
3. Player funds the session wallet with XLM (one Freighter approval)
4. All in-game transactions are signed **silently** by the session wallet
5. When the browser tab closes, the session wallet is destroyed

This gives a **Web2-like gameplay experience** with full on-chain verifiability.

---

## Cross-Device Multiplayer

### Localnet (Same Computer)

On `localhost`, the app uses the browser-native **BroadcastChannel API** for instant, zero-latency communication between tabs. No network configuration required.

### Testnet / Deployed (Cross-Device)

On deployed URLs (e.g., Vercel), the app switches to **PeerJS WebRTC** with **Metered TURN relay servers** for guaranteed NAT traversal:

- **STUN** (port 80) — NAT discovery
- **TURN UDP** (port 80) — Standard relay
- **TURN TCP** (port 80) — Corporate firewall fallback
- **TURN** (port 443) — HTTPS port (rarely blocked)
- **TURNS/TLS** (port 443) — Maximum compatibility

Both players run the same **deterministic game engine** with the same seed. Move indices are exchanged, so both engines stay perfectly synchronized. No central game server required — **fully decentralized**.

---

## 🏗️ Key Engineering Feats

- **WebRTC ICE Negotiation** — Bypassing symmetric NATs and strict router firewalls with STUN/TURN relay fallback
- **TURN Relay Routing** — Credentialed Metered TURN servers across UDP, TCP, and TLS for guaranteed P2P on any network
- **Async Multi-Sig XDRs** — Cracking open, modifying `sourceAccount` + sequence numbers, and resealing Stellar transaction envelopes across devices
- **Smart Contract VM Traps** — Navigating footprint drops, `require_auth` key mismatches, `toEnvelope()` immutability, and `len() == 0` proof safety checks
- **RPC Race Conditions** — Serialized transaction queue with breathing delays to handle stale sequence numbers from delayed ledger indexing
- **Zero-Knowledge Proofs** — Browser-side Noir circuit compilation + UltraHonk proof generation, verified on-chain via Soroban cross-contract calls
- **Session Wallet UX** — Ephemeral per-tab keypairs that sign silently — zero wallet popups during gameplay

---

## Async Multi-Signature Handshake

The `start_game` contract requires **both** players to `require_auth`, but they're on separate devices. Solving this required fixing four critical issues:

1. **Double-Simulation Footprint Drop** — Player 2 re-simulated the transaction locally, which dropped Player 1's nonce from the footprint. Fix: bypass standard submission and send the exact XDR footprint that Player 1 simulated.

2. **`toEnvelope()` Immutability Trap** — `tx.toEnvelope()` returns a *disconnected copy*. Injecting Player 1's signature into the envelope didn't propagate. Fix: export the modified envelope to Base64, then reconstruct via `TransactionBuilder.fromXDR()`.

3. **Source Account Mismatch** — The transaction's `sourceAccount` was Player 1's, but Player 2 signed the envelope. Fix: swap `sourceAccount` to Player 2 before signing, preserving Player 1's auth inside the invoke op's `auth[]` array.

4. **Sequence Number Offset** — After swapping the source, the sequence number was stale. Fix: fetch Player 2's live sequence and inject `BigInt(seq) + 1n` into the XDR.

---

## Off-Chain Turn Enforcement

The on-chain contract does **not** enforce turn order — PeerJS delivers moves in ~50ms, but on-chain confirmations take ~5 seconds. Strict alternation would cause `NotYourTurn` race conditions.

- **Contract enforces:** player identity, ZK proof validation, game phase validity, score tracking
- **Frontend enforces:** turn order, move legality, house rules

---

## Deployed Contracts (Testnet)

- **ZK Seep** — `CCTI7YU4VJKERNO6Y2UHKVV4WNHIPDNAHG5OXNAMAJUKL5ZQBSEJ3QDV`
- **Game Hub (official)** — `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`
- **Mock Verifier** — `CC64CBJ5KCVCJX4PO4MQXHNFL6AGIQ2MDG6UIFGZ5NWSKN5D2ZIHVEIX`

---

## Tech Stack

- **Smart Contract** — Rust + Soroban SDK
- **ZK Circuit** — Noir (Nargo 1.0.0-beta.9)
- **Proof System** — UltraHonk (bb 0.87.0)
- **Frontend** — React 19 + TypeScript + Vite
- **Styling** — TailwindCSS 4
- **Multiplayer** — BroadcastChannel (local) + PeerJS WebRTC (cross-device)
- **Wallet** — Freighter (connect) + Session Keypair (gameplay)
- **Deployment** — Vercel (frontend) + Stellar Testnet (contracts)

---

## What We Built

This is not a weekend hackathon project. ZK Seep includes:

- ✅ **Complete Seep game engine** — all 7 move types, house limits, seep bonuses, multi-round dealing
- ✅ **ZK circuit** — Noir circuit with Poseidon2 hash commitment + card membership proof
- ✅ **On-chain game contract** — 689 lines of Rust, full game lifecycle with ZK proof enforcement
- ✅ **Cross-device multiplayer** — dual BroadcastChannel / PeerJS WebRTC, no central server
- ✅ **Embedded session wallet** — zero popup fatigue, Web2-like UX
- ✅ **Async multi-sig handshake** — two session wallets authorize `start_game` across devices via XDR reconstruction
- ✅ **Transaction queue** — serialized on-chain calls with breathing delays to prevent `txBadSeq`
- ✅ **Mock verifier** — enables full testnet demo within CPU limits
- ✅ **Game Hub integration** — `start_game` / `end_game` for points and leaderboard
- ✅ **Beautiful UI** — dark theme, card animations, responsive design
- ✅ **Live deployment** — playable at [zk-seep.vercel.app](https://zk-seep.vercel.app)

---

## Local Reproduction (Real ZK Verification)

```bash
# 1. Start local Stellar node with unlimited CPU limits
docker run --rm -it -p 8000:8000 --name stellar \
  stellar/quickstart:soroban-dev --local --limits unlimited

# 2. Configure network & fund deployer
stellar network add localnet \
  --rpc-url "http://localhost:8000/soroban/rpc" \
  --network-passphrase "Standalone Network ; February 2017"
stellar keys generate alice --network localnet --fund

# 3. Deploy all contracts
chmod +x scripts/deploy-localnet.sh
./scripts/deploy-localnet.sh

# 4. Start frontend
cd zk-seep-frontend && bun install && bun run dev
```

Open two browser tabs at `http://localhost:5173`. Create & fund a game wallet in each, then create and join a game. House-building and bid moves will generate **real ZK proofs** verified on-chain.

---

## Why Seep on Stellar?

- **100M+ players** — Seep is the #1 card game in Punjab, widely played across South Asia
- **Stellar's India push** — SDF is actively expanding in India; Seep brings a massive ready-made audience
- **Cheating epidemic** — Every major Seep app on Play Store is plagued by cheating complaints
- **ZK is the solution** — Zero-knowledge proofs make cheating mathematically impossible
- **Low fees** — Stellar's ~0.00001 XLM tx fees make per-move on-chain verification viable
- **Fast finality** — 5-second block times keep gameplay responsive

---

<p align="center">
  <b>Built for the Stellar Game Studio Hackathon</b><br>
  <i>Making South Asia's favorite card game fair, verifiable, and unstoppable.</i>
</p>