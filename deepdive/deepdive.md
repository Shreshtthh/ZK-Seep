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


Let's tear this project down layer by layer, folder by folder, to see exactly what each part is doing.

### 1. circuits/ (The Cryptographic Guard)
This folder contains the Noir codebase responsible for generating zero-knowledge proofs on the client side. It ensures information privacy and mathematical trust during gameplay.
- `poseidon2_hash/`: Contains a standard Noir circuit that takes a player's private hand array (12 slots) and a secret salt value, hashing them using the UltraHonk-friendly Poseidon2 algorithm. This generates the `hand_hash` commitment submitted to the blockchain at the beginning of the round.
- `hand_contains/`: This is the heavy lifter. When a player declares a move (like a bid or a house-build), this circuit takes their private hand array and salt, hashes them to verify it matches the public `hand_hash` on-chain, and loops through the array to assert that a specific public card value exists in that hand.
- `no_high_cards/`: In Seep, if a player's starting four cards are all below a 9, they have the right to demand a re-deal. This circuit lets them cryptographically prove they don't hold any card $\ge 9$ without exposing what cards they actually have.

### 2. contracts/ (The On-Chain Arbiter)
This directory handles the smart contracts written in Rust using the Soroban SDK. They enforce the rules on the Stellar blockchain.
- `zk-seep/`: The core game contract. It manages ongoing games, active players, turn-taking, and scoring. Crucially, it acts as the gateway for verification. When a player sends a transaction to make a move, this contract consumes the public inputs and the ZK proof bytes, forwarding them to the verifier contract.
- `mock-verifier/`: A safety valve for Stellar's Testnet. Verifying UltraHonk ZK proofs eats up roughly 367M CPU instructions, nearly hitting Stellar's Testnet ceiling of 400M instructions per transaction. This mock contract simulates a real verifier but instantly returns true so the app can be fully tested on Testnet without crashing.
- `mock-game-hub/`: A simple mock setup that mimics the official Stellar Game Studio Hub to test how points are universally updated and tracked globally once a match concludes.

### 3. zk-seep-frontend/src/game/ (The Engine Room)
This is a pure TypeScript implementation of the game of Seep. Both players run this identical engine locally in their browsers.
Instead of waiting for 5-second blockchain confirmation times for every single action, the local engines compute state transitions instantly when they receive input.
- `Card.ts`, `Deck.ts`, `Pile.ts`, `Center.ts`: Pure data structures representing the cards, the deck, a single player's pile, and the "floor" layouts.
- `Player.ts`: Tracks player IDs, current scores, and structural constraints.
- `Move.ts`: Declares and parses the 7 legal types of actions a player can execute according to official Seep rules (e.g., Bidding, Throwing, Scattering, or building Houses).
- `Game.ts`: The main state machine. It ingests an action, verifies it against the rules, and computes the absolute next frame of the game board deterministically.

### 4. zk-seep-frontend/src/services/ (The Network & ZK Link)
This directory acts as the connective tissue, handling real-time data streaming and off-loading complex mathematical proof generation.
- `peerService.ts`: This implements the game's P2P multiplayer architecture. It operates in two modes:
  - **Local/Same-device:** Uses the browser's BroadcastChannel API to instantly synchronize state between two browser windows with zero latency.
  - **Online:** Uses PeerJS (WebRTC) backed by STUN/TURN servers to establish direct, low-latency communication channels between separate computers anywhere on the web.
- `zkProofService.ts`: Communicates directly with the client-side Barretenberg compiler (bb.js). When the UI triggers a hidden-card verification, this service feeds the inputs into the compiled Noir JSON artifacts, spins up a WebWorker to calculate the cryptography locally, and outputs the raw proof string.
- `devWalletService.ts`: Handles the game's seamless user experience. Instead of forcing a Freighter wallet popup for every move, it instantiates an automated, ephemeral "Session Wallet" directly inside sessionStorage to quietly auto-sign game transactions behind the scenes.

### 5. scripts/ (The Automation Hub)
This contains utility scripts executed via Bun to coordinate development workflows and bridge the gap between Rust/Noir and TypeScript.
- `setup.ts` & `build.ts`: Automates compiling the Soroban contracts into WASM and generating the TypeScript bindings for frontend usage.
- `deploy.ts`, `deploy-localnet.sh`, `deploy-testnet.sh`: Scripts dedicated to deploying the freshly baked WASM binaries onto local or testnet Stellar network instances, mapping initial contract addresses, and establishing initial configurations.
- `bindings.ts`: Generates and syncs TypeScript interfaces so that typing structures match across Noir circuit parameters, Soroban contracts, and frontend states.