# 🃏 ZK Seep — Zero-Knowledge Card Game on Stellar

> *Bringing South Asia's most popular card game to blockchain, with zero-knowledge proofs to eliminate the cheating that plagues existing platforms.*

**[🎮 Play Live](https://zk-seep.vercel.app)** · **[📜 Contract on Testnet](https://stellar.expert/explorer/testnet/contract/CBMD4JH436B663IZAQLX5RHNYICU4COZQIXOOLWQU6HVM2W555CGNCDM)**

---

## The Problem

**Seep** (also called *Sweep*) is a trick-taking card game played by **100M+ people** across India, Pakistan, and the South Asian diaspora. On Google Play, Seep apps have **100,000+ downloads** — but dig into the reviews and you'll find a recurring theme:

> ⭐ *"The bot always knows my cards"*
> ⭐ *"They bid 13 without even having a King"*
> ⭐ *"Rigged — the AI cheats every single time"*

The core problem is **information asymmetry**. In physical Seep, you trust that your opponent can't see your hand. In digital Seep, the server sees everything. Bots exploit this by:

- **Bidding cards they don't hold** — a player bids 13 (King) when they have no King, but they know *you* don't have one either
- **Building houses on phantom cards** — creating a house of value 11 when they don't hold a Jack, knowing the remaining Jacks are buried in the deck
- **Perfect information play** — the server-side AI sees both hands and the deck order, making optimal plays that are statistically impossible for a fair player

**ZK Seep solves this.** By enforcing zero-knowledge proofs on-chain, every bid and every house-building move cryptographically proves the player holds the card they claim — without revealing what else is in their hand.

---

## How ZK Proofs Fix Cheating

In Seep, there are two critical moments where a player claims to hold a specific card:

1. **Bidding** — "I bid 11" means "I have a Jack (value ≥ 9) in my hand"
2. **House building** — "I build a house of value 12" means "I have a Queen in my hand to claim it later"

Without ZK proofs, the server (or opponent in P2P) must trust these claims blindly. With ZK proofs:

```
┌─────────────────────────────────────────────────────┐
│                   ZK Proof Circuit                  │
│                                                     │
│  Private inputs:  hand[] (12 card values), salt     │
│  Public inputs:   hand_hash, target_value           │
│                                                     │
│  Constraints:                                       │
│  1. Poseidon2(hand ++ salt) == hand_hash            │
│  2. ∃ i : hand[i] == target_value                   │
│                                                     │
│  Result: Proof that target_value ∈ hand             │
│          without revealing hand contents            │
└─────────────────────────────────────────────────────┘
```

The player commits a **Poseidon2 hash** of their hand at the start of the game. For every bid and house move, they generate a ZK proof showing "my hand contains a card of this value" — verified against the committed hash. **No one — not the opponent, not the server, not the blockchain — ever sees the actual hand.**

---

## What is Seep?

Seep is a 2-player card game using a standard 52-card deck. The objective is to capture cards from the floor and score points.

### Card Values & Scoring

| Cards | Game Value | Score |
|---|---|---|
| A (Ace) | 1 | 1 point each |
| 2–10 | Face value | Spades: face value; 10♦: 6 pts |
| J (Jack) | 11 | Spades only: 11 pts |
| Q (Queen) | 12 | Spades only: 12 pts |
| K (King) | 13 | Spades only: 13 pts |

**Total points in the deck: 100.** A standard win requires capturing more than your opponent.

### Game Flow

```mermaid
flowchart TD
    A["🃏 Deal 4 cards each\n4 cards to floor"] --> B["💰 Bidding Phase"]
    B --> C{"Player 1 bids\n9, 10, 11, 12, or 13"}
    C --> D["🏠 Bid Move\nMust play the bid card"]
    D --> E["♠️ Play Phase\nAlternate turns"]
    E --> F{"Hand empty?"}
    F -->|Yes| G{"Cards left\nin deck?"}
    G -->|Yes| H["Deal 4 more\ncards each"]
    H --> E
    G -->|No| I["🏆 Score & Determine Winner"]

    style A fill:#1a1a2e,color:#eee
    style B fill:#16213e,color:#eee
    style C fill:#0f3460,color:#eee
    style D fill:#533483,color:#eee
    style E fill:#1a1a2e,color:#eee
    style I fill:#e94560,color:#fff
```

### The 7 Move Types

On each turn, a player plays one card from their hand. Depending on the floor state, they can:

| # | Move | Description | ZK Proof? |
|---|---|---|---|
| 1 | **Throw** | Place card on floor as a new loose pile | No |
| 2 | **Build House** | Card + loose piles → unfixed house (value 9–13) | 🔐 Yes |
| 3 | **Cement** | Card matches unfixed house → fix it | 🔐 Yes |
| 4 | **Merge + Fix** | Card + loose piles merge with unfixed house → fixed | 🔐 Yes |
| 5 | **Add to Fixed** | Card + loose piles → add to existing fixed house | 🔐 Yes |
| 6 | **Direct Fix** | Card directly onto fixed house of same value | 🔐 Yes |
| 7 | **Pick Up** | Card value matches pile/combo sum → capture all | No |

**Houses** are piles worth 9–13 that "lock" cards on the floor. Building a house of value X means you're reserving those cards to pick up later with a card of value X. The ZK proof ensures you actually *have* that card.

### Seep Bonus

If you capture **every card on the floor** in a single pickup, that's a **Seep** — worth bonus points equal to the bid value. But three Seeps in one game cancels all your Seep bonuses!

---

## Architecture

```mermaid
graph TB
    subgraph Browser["Browser (React + TypeScript)"]
        UI["Game UI\nZkSeepGame.tsx"]
        Engine["Local Game Engine\nSeepGame.ts"]
        Peer["PeerJS Service\nWebRTC P2P"]
        Session["Session Wallet\nKeypair in sessionStorage"]
        ZkProof["ZK Proof Generator\nNoir / Barretenberg"]
        OnChain["On-Chain Hook\nuseOnChain.ts"]
    end

    subgraph Stellar["Stellar Network"]
        ZkSeep["ZK Seep Contract\nGame state + proof verification"]
        MockVerifier["Mock Verifier\nalways returns true\n(testnet)"]
        RealVerifier["UltraHonk Verifier\nfull ZK verification\n(localnet)"]
        GameHub["Game Hub Contract\nPoints + leaderboard"]
    end

    subgraph Circuit["Noir Circuit"]
        HC["hand_contains\nPoseidon2 hash + membership"]
    end

    UI --> Engine
    UI --> Peer
    UI --> OnChain
    OnChain --> Session
    OnChain --> ZkSeep
    ZkSeep --> MockVerifier
    ZkSeep -.-> RealVerifier
    ZkSeep --> GameHub
    ZkProof --> HC
    OnChain --> ZkProof

    Peer <-->|"WebRTC\nseed, bids, moves"| Peer

    style Browser fill:#0d1117,color:#c9d1d9,stroke:#30363d
    style Stellar fill:#1a1a2e,color:#eee,stroke:#533483
    style Circuit fill:#16213e,color:#eee,stroke:#0f3460
    style MockVerifier fill:#e94560,color:#fff
    style RealVerifier fill:#00b4d8,color:#fff
```

### Component Breakdown

| Component | Purpose |
|---|---|
| **ZK Seep Contract** (`contracts/zk-seep`) | On-chain game state, turn validation, ZK proof verification via external verifier |
| **Mock Verifier** (`contracts/mock-verifier`) | Always returns `true` — used on testnet where UltraHonk exceeds the 400M CPU instruction cap |
| **Game Hub** | Points tracking and leaderboard across all games in the Stellar Game Studio |
| **Noir Circuit** (`circuits/hand_contains`) | Poseidon2 hash commitment + card membership proof |
| **Game Engine** (`src/game/`) | Full Seep rule engine in TypeScript — move generation, validation, scoring |
| **PeerJS Service** | WebRTC peer-to-peer for real cross-device multiplayer |
| **Session Wallet** | Ephemeral Stellar keypair — signs game transactions silently without wallet popups |
| **On-Chain Hook** | Fires `start_game`, `make_bid`, `make_move`, `end_game` to the contract during gameplay |

---

## Transaction Flow

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant PeerJS as PeerJS (WebRTC)
    participant Contract as ZK Seep Contract
    participant Verifier as Verifier Contract
    participant Hub as Game Hub

    P1->>Contract: start_game(session, p1, p2)
    Contract->>Hub: hub.start_game(...)

    P1->>Contract: commit_hand(hash(hand + salt))
    P2->>Contract: commit_hand(hash(hand + salt))

    P1->>PeerJS: bid(11)
    PeerJS->>P2: bid(11)
    P1->>Contract: make_bid(11, zk_proof)
    Contract->>Verifier: verify_proof(public_inputs, proof)
    Verifier-->>Contract: true ✓

    loop Each Turn
        P1->>PeerJS: move(idx)
        PeerJS->>P2: move(idx)
        P1->>Contract: make_move(type, card, proof)
        Contract->>Verifier: verify_proof(...)
        Verifier-->>Contract: true ✓
    end

    P1->>Contract: end_game(session)
    Contract->>Hub: hub.end_game(winner)
```

---

## The ZK Circuit

The `hand_contains` circuit is written in **Noir** (pinned to Nargo 1.0.0-beta.9, bb 0.87.0):

```noir
fn main(
    hand: [Field; 12],        // private: card values (1-13, 0 = empty)
    salt: Field,              // private: random nonce
    hand_hash: pub Field,     // public: Poseidon2 commitment
    target_value: pub Field,  // public: claimed card value
) {
    // 1. Verify commitment: hash(hand ++ salt) == hand_hash
    let mut preimage: [Field; 13] = [0; 13];
    for i in 0..12 { preimage[i] = hand[i]; }
    preimage[12] = salt;
    assert(Poseidon2::hash(preimage, 13) == hand_hash);

    // 2. Prove possession: ∃ i : hand[i] == target_value
    let mut found = false;
    for i in 0..12 {
        if hand[i] == target_value { found = true; }
    }
    assert(found, "Target value not found in hand");
}
```

**Why Poseidon2?** It's a ZK-friendly hash function — ~100x cheaper to prove inside a circuit compared to SHA-256 or Keccak.

---

## On-Chain vs. Local Verification

| Environment | Verifier | CPU Instructions | Status |
|---|---|---|---|
| **Testnet** | Mock Verifier (always `true`) | ~300K | ✅ Deployed |
| **Localnet** (`--limits unlimited`) | Real UltraHonk Verifier | ~367M | ✅ Works |
| **Mainnet** | Real Verifier | Needs 400M+ cap | ⏳ Waiting for limit increase |

The Stellar testnet currently has a **400M CPU instruction cap** per transaction. UltraHonk proof verification requires ~367M instructions for even a basic proof — dangerously close to the limit. Per hackathon organizer guidance, **local deployment with `--limits unlimited` is accepted** for evaluation.

The mock verifier allows us to demonstrate the full transaction flow on testnet while the real verifier runs on localnet.

---

## Embedded Session Wallet

Traditional blockchain games require users to approve every transaction via their browser wallet (Freighter, MetaMask, etc.). In a card game with 20+ moves per match, this is unplayable.

ZK Seep uses an **embedded session wallet**:

1. Player connects Freighter (one-time)
2. An ephemeral `Keypair` is generated and stored in `sessionStorage`
3. Player funds the session wallet with XLM (one Freighter approval)
4. All in-game transactions (`commit_hand`, `make_bid`, `make_move`, `end_game`) are signed **silently** by the session wallet
5. When the browser tab closes, the session wallet is destroyed

This gives a **Web2-like gameplay experience** with full on-chain verifiability.

---

## Cross-Device Multiplayer

ZK Seep uses **PeerJS** (WebRTC) for peer-to-peer multiplayer:

- Player 1 creates a room → gets a room code
- Player 2 enters the room code on their device
- Game seed, bids, and moves are exchanged directly between browsers
- No central server required — fully decentralized

Both players run the same deterministic game engine with the same seed. Move indices are exchanged, so both engines stay perfectly synchronized.

---

## Market Opportunity

### Why Seep on Stellar?

| Factor | Detail |
|---|---|
| **100M+ players** | Seep is the #1 card game in Punjab and widely played across South Asia |
| **Stellar's India push** | SDF is actively expanding in India — Seep brings a massive ready-made audience |
| **Cheating epidemic** | Every major Seep app on Play Store is plagued by cheating complaints |
| **ZK is the solution** | Zero-knowledge proofs make cheating mathematically impossible |
| **Low fees** | Stellar's ~0.00001 XLM tx fees make per-move on-chain verification viable |
| **Fast finality** | 5-second block times keep gameplay responsive |

### Competitive Landscape

| Platform | Cheating Protection | On-Chain | Cross-Device | ZK Proofs |
|---|---|---|---|---|
| Play Store Seep apps | ❌ None | ❌ | ❌ | ❌ |
| Existing blockchain games | ⚠️ Server-side | ⚠️ Partial | ✅ | ❌ |
| **ZK Seep** | ✅ **Cryptographic** | ✅ **Full** | ✅ | ✅ |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Rust + Soroban SDK |
| ZK Circuit | Noir (Nargo 1.0.0-beta.9) |
| Proof System | UltraHonk (bb 0.87.0) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | TailwindCSS 4 |
| Multiplayer | PeerJS (WebRTC) |
| Wallet | Freighter (connect) + Session Keypair (gameplay) |
| Deployment | Vercel (frontend) + Stellar Testnet (contracts) |

---

## Deployed Contracts (Testnet)

| Contract | Address |
|---|---|
| ZK Seep | `CBMD4JH436B663IZAQLX5RHNYICU4COZQIXOOLWQU6HVM2W555CGNCDM` |
| Mock Game Hub | `CDFKCMD4MCDXZHJBHDE5RRZLDCPNXGEKUKZ6ADGOHE4XMVEIRZP746P2` |
| Mock Verifier | `CACRB7CXQ6QWPV7V556XVD4657HO32ORXJBYYKHRSUND6PNO5FBGPE32` |

---

## Local Development

### Prerequisites

- [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools)
- [Bun](https://bun.sh/) (or Node.js 18+)
- [Nargo 1.0.0-beta.9](https://noir-lang.org/) (for ZK circuits)

### Quick Start

```bash
# Clone and install
git clone https://github.com/user/Stellar-Game-Studio.git
cd Stellar-Game-Studio

# Build contracts
stellar contract build

# Deploy to testnet
bun run scripts/deploy.ts

# Start frontend
cd zk-seep-frontend
bun install
bun run dev
```

### Running with Real ZK Verification (Localnet)

```bash
# Start local Stellar node with unlimited CPU
docker run -p 8000:8000 stellar/quickstart --standalone --limits unlimited

# Deploy contracts to localnet
bun run scripts/deploy.ts --network local

# The real UltraHonk verifier will work within unlimited CPU limits
```

---

## Project Structure

```
Stellar-Game-Studio/
├── contracts/
│   ├── zk-seep/              # Main game contract (Rust/Soroban)
│   │   └── src/lib.rs         # 689 lines — game state, turns, ZK verification
│   ├── mock-verifier/         # Always-true verifier for testnet
│   └── mock-game-hub/         # Points tracking contract
├── circuits/
│   ├── hand_contains/         # Noir circuit: prove card ∈ hand
│   └── no_high_cards/         # Noir circuit: prove no high cards
├── zk-seep-frontend/
│   ├── src/
│   │   ├── game/              # Full Seep engine (TypeScript)
│   │   │   ├── Game.ts        # Game lifecycle, dealing, rounds
│   │   │   ├── Player.ts      # Hand management, move generation
│   │   │   ├── Center.ts      # Floor state, house building
│   │   │   ├── Card.ts        # Card types, scoring
│   │   │   └── Move.ts        # 7 move types
│   │   ├── games/zk-seep/
│   │   │   ├── ZkSeepGame.tsx # Main game component (1050 lines)
│   │   │   ├── zkSeepService  # Contract interaction layer
│   │   │   └── components/    # UI components
│   │   ├── hooks/
│   │   │   ├── useWallet.ts   # Freighter + session wallet
│   │   │   └── useOnChain.ts  # Contract call hook
│   │   └── services/
│   │       └── peerService.ts # PeerJS multiplayer
│   └── package.json
└── scripts/                   # Build, deploy, setup scripts
```

---

## What We Built

This is not a weekend hackathon project. ZK Seep includes:

- ✅ **Complete Seep game engine** — all 7 move types, house limits, seep bonuses, multi-round dealing
- ✅ **ZK circuit** — Noir circuit with Poseidon2 hash commitment + card membership proof
- ✅ **On-chain game contract** — 689 lines of Rust, full game lifecycle with ZK proof enforcement
- ✅ **Cross-device multiplayer** — PeerJS WebRTC, no central server
- ✅ **Embedded session wallet** — zero popup fatigue, Web2-like UX
- ✅ **Mock verifier** — enables full testnet demo within CPU limits
- ✅ **Game Hub integration** — start_game / end_game for points and leaderboard
- ✅ **Beautiful UI** — dark theme, card animations, responsive design
- ✅ **Live deployment** — playable at [zk-seep.vercel.app](https://zk-seep.vercel.app)

---

<p align="center">
  <b>Built for the Stellar Game Studio Hackathon</b><br>
  <i>Making South Asia's favorite card game fair, verifiable, and unstoppable.</i>
</p>
