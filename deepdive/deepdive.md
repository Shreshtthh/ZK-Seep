# ZK Seep Deep Dive

High-level overview of the ZK Seep project, its purpose, tech stack, and directory structure based on the files provided.

## Overview: What is ZK Seep?
ZK Seep is a decentralized, zero-knowledge card game built on the Stellar network. It is a blockchain adaptation of the popular South Asian trick-taking game "Seep" (or Sweep), which involves capturing cards from the floor to score more than 50 points out of a possible 100.

**The Problem it Solves:** Traditional digital versions of Seep suffer from a cheating epidemic. Because the server has perfect information, bots can see players' hands, build strategic "houses" on phantom cards they don't hold, and make statistically impossible optimal plays.

**The Solution:** ZK Seep introduces cryptographic fairness. Players commit a Poseidon2 hash of their hand to the blockchain. Whenever a player needs to make a bid or build a house (moves that require holding a specific card), they generate a Zero-Knowledge (ZK) proof on their device to prove they hold the required card without ever revealing the rest of their hand.

## The Tech Stack
- **Smart Contracts:** Written in Rust using the Soroban SDK.
- **Zero-Knowledge Circuit & Proofs:** Written in Noir (Nargo 1.0.0-beta.9) using Poseidon2 hashing. The proof system uses UltraHonk via bb.js.
- **Frontend UI & Game Engine:** Built with React 19, TypeScript, and Vite. It utilizes TailwindCSS 4 for styling and Zustand for state management.
- **Networking Layer:** Operates completely peer-to-peer using a dual-mode system. It uses BroadcastChannel for zero-latency local play, and PeerJS (WebRTC) with TURN/STUN relays for cross-device play across the internet.
- **Wallet Integration:** Uses the Freighter wallet for the initial connection, but instantly generates an "embedded session wallet" stored in sessionStorage. This ephemeral keypair silently signs the 20+ transactions required throughout the game, preventing the player from being spammed with wallet popups.

## Architecture & Component Breakdown
- **ZK Seep Smart Contract:** Tracks the core game state and acts as the entry point for ZK proof validation.
- **On-Chain vs. Local Verifiers:** Because Stellar's Testnet caps CPU instructions at 400M per transaction, verifying a full UltraHonk ZK proof (~367M instructions) is dangerously close to the limit. To solve this, a Mock Verifier is used on Testnet, while a real verifier contract is run on Localnet where limits can be disabled.
- **Typescript Game Engine:** Both players run an identical, deterministic TypeScript engine locally. Rather than waiting 5 seconds for block confirmations, players send their move indices to each other instantly via WebRTC.

## Project Directory Structure
The repository is split into three main modules:

### 1. contracts/ (Smart Contracts Layer)
- `zk-seep/`: Contains the main 689-line Rust game contract handling game states, turns, and proof verifications.
- `mock-verifier/`: A mock contract that always returns true to bypass testnet instruction caps.
- `mock-game-hub/`: Simulates the Stellar Game Studio Hub for points tracking.

### 2. circuits/ (Cryptography Layer)
- `hand_contains/`: A Noir circuit that verifies a Poseidon2 hash of the hand and proves a specific claimed card value is inside it.
- `no_high_cards/`: A Noir circuit that proves a player lacks cards valued 9 or higher, allowing them to legally request a re-deal.

### 3. zk-seep-frontend/ (Application Layer)
- `src/game/`: The standalone TypeScript game engine detailing game lifecycle (`Game.ts`), deck mechanics (`Center.ts`, `Card.ts`), and the 7 available move types (`Move.ts`).
- `src/games/zk-seep/`: Contains the primary React UI (`ZkSeepGame.tsx`), UI components, and the contract interaction layer (`zkSeepService.ts`).
- `src/hooks/`: Includes React hooks like `useWallet.ts` (for the Freighter + session keypair logic) and `useOnChain.ts`.
- `src/services/`: Holds logic for WebRTC (`peerService.ts`) and ZK generation.

### 4. scripts/ (Tooling)
- Various utility files (executed via Bun) to script the deployment (`deploy.ts`, `deploy-localnet.sh`) and build processes (`build.ts`).

---

## Q&A: ZK Proofs and Architecture Flow

**Q: How exactly are the cards stored in the contracts/ circuits? As an array? How does ZK proofing work here? State is sent from contracts to noir which produce a zk proof and mockverifier checks it?**

Based on the provided documentation, here is a breakdown of how the cards are stored, how the ZK proofing works, and the actual architecture flow.

### 1. How are cards stored? As an array?
Yes, but with an important distinction between what happens locally versus on-chain:

- **In the Noir Circuit (Local):** The player's hand is represented exactly as an array of 12 elements. Specifically, it is defined in the Noir code as `hand: [Field; 12]`, where each element represents a card's value (1-13) or 0 if that slot is empty.
- **In the Smart Contract (On-Chain):** The actual array of cards is never stored on the blockchain. Instead, at the start of the game, the player's browser hashes the hand array along with a random salt using a ZK-friendly hash function called Poseidon2. The contract only stores this resulting `hand_hash` (the commitment).

### 2. How does the ZK Proofing work here?
The zero-knowledge proof solves the problem of "information asymmetry" (preventing server bots from seeing your cards). When a player needs to make a move that requires a specific card (like bidding 11 or building a house of 12), they must prove they possess that card without revealing their full hand.

The `hand_contains` circuit enforces two strict constraints:
- **Commitment Verification:** It takes the private hand array and private salt and hashes them together to ensure `Poseidon2::hash(hand ++ salt) == hand_hash`. This proves the player isn't making up a new hand on the spot.
- **Possession Verification:** It iterates through the 12 slots in the hand array looking for the specific public `target_value` (e.g., an 11). If it finds it, `found` is set to true. The circuit asserts that `found` must be true.

### 3. State Flow (Correction to assumption)
The assumption—"State is sent from contracts to noir which produce a zk proof and mockverifier checks it?"—is slightly backward. Noir does not run on the smart contract; it runs entirely in the player's browser. Here is the exact flow:

1. **Proof Generation (Client-Side):** When you make a move, your browser's React frontend uses Noir and Barretenberg (via bb.js) to generate a ZK Proof locally on your device.
2. **Submission:** The browser sends a transaction (e.g., `make_bid(11, zk_proof)`) containing the locally generated proof and public inputs to the ZK Seep Smart Contract on the Stellar network.
3. **Verification:** The main ZK Seep Contract receives this proof and makes a cross-contract call to the Verifier Contract.
4. **Acceptance:** The Verifier returns true or false back to the main game contract. If it is valid, the contract updates the official on-chain game state.

*(Note regarding the Verifier: On the Stellar Testnet, the app uses a "Mock Verifier" that always returns true because verifying a real UltraHonk proof requires ~367M CPU instructions, which exceeds the testnet's 400M limit. A real UltraHonk verifier is used when running on localnet with unlimited limits).*