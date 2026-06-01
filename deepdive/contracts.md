# ZK-Seep Smart Contracts Deep Dive

This document provides a detailed, function-by-function explanation of the smart contracts used in the ZK-Seep project. The contracts are written in Rust for the Soroban smart contract platform on the Stellar network.

There are three main contracts in the repository:
1. **Mock Game Hub (`mock-game-hub`)**
2. **Mock Verifier (`mock-verifier`)**
3. **ZK-Seep Main Game Contract (`zk-seep`)**

---

## 1. Mock Game Hub (`mock-game-hub/src/lib.rs`)

This contract acts as a simulated Game Hub for local development and testing. It exposes the same interface that game contracts expect from the real Game Hub but bypasses complex internal logic like escrowing points.

### Functions

#### `start_game`
- **Arguments:** `env` (Env), `game_id` (Address), `session_id` (u32), `player1` (Address), `player2` (Address), `player1_points` (i128), `player2_points` (i128).
- **Description:** Called when a new game session starts. It does not require authorization in the mock environment. It simply emits a `GameStarted` event with all the provided details and bumps the contract instance's Time-To-Live (TTL) so it remains active on the ledger.

#### `end_game`
- **Arguments:** `env` (Env), `session_id` (u32), `player1_won` (bool).
- **Description:** Called to end a game session and declare the winner. Like `start_game`, it skips authorization and directly emits a `GameEnded` event.

---

## 2. Mock Verifier (`mock-verifier/src/lib.rs`)

A stub Zero-Knowledge (ZK) proof verifier. In the testnet environment, actual UltraHonk verification may exceed the CPU instruction budget, so this mock is used. On localnet with unlimited limits, the real verifier can be used instead.

### Functions

#### `verify_proof`
- **Arguments:** `_env` (Env), `_public_inputs` (Bytes), `_proof_bytes` (Bytes).
- **Returns:** `Result<(), Error>`
- **Description:** Always returns `Ok(())` regardless of the inputs. It conforms to the `indextree/ultrahonk_soroban_contract` interface, allowing the main contract to compile and function without the computational overhead of true ZK verification.

---

## 3. ZK-Seep Main Contract (`zk-seep/src/lib.rs`)

The core engine of the ZK-Seep game. It manages the state, player turns, scores, and enforces game rules via ZK proofs, ensuring that players cannot cheat when performing restricted moves like "building" or "cementing" a house.

### State and Data Structures
- **GamePhase Enum:** Tracks the current state of the game (WaitingForPlayers, HandCommit, Bidding, BidMove, FirstHalf, SecondHalf, GameOver).
- **SeepGame Struct:** The comprehensive state of a single game session. It stores player addresses, scores, the number of seeps, remaining cards, current center piles, hand hashes, and the current turn/phase.
- **MoveType Enum:** Represents actions a player can take (Throw, Build, Cement, MergeFix, AddToFixed, DirectFix, PickUp).

### Initialization

#### `__constructor`
- **Arguments:** `env` (Env), `admin` (Address), `game_hub` (Address), `verifier` (Address).
- **Description:** Sets up the contract instance by permanently storing the addresses for the contract administrator, the Game Hub, and the ZK Verifier.

### Game Lifecycle Functions

#### `start_game`
- **Arguments:** `env` (Env), `session_id` (u32), `player1` (Address), `player2` (Address), `player1_points` (i128), `player2_points` (i128).
- **Description:** Initializes a new game state. First, it ensures `player1` and `player2` are distinct and requires Soroban authorization from both. It then calls `start_game` on the configured Game Hub contract to officially register the session. Finally, it creates a fresh `SeepGame` struct, sets the phase to `HandCommit`, and saves it to temporary storage with a 30-day TTL.

#### `commit_hand`
- **Arguments:** `env` (Env), `session_id` (u32), `player` (Address), `hand_hash` (BytesN<32>), `cards_count` (u32).
- **Description:** Allows players to cryptographically commit to the cards they were dealt without revealing them. It checks that the game is in the `HandCommit` phase and that the player hasn't already committed. Once both players submit their hand hashes, the game phase automatically advances to `Bidding`.

#### `make_bid`
- **Arguments:** `env` (Env), `session_id` (u32), `player` (Address), `bid_value` (u32), `proof` (Bytes).
- **Description:** Handles the initial bidding phase where player 1 (the bidder) claims a house value (between 9 and 13). It requires a ZK proof demonstrating that the player actually holds a card matching the `bid_value` in their committed hand hash. If the proof passes, the game transitions to the `BidMove` phase.

#### `make_move`
- **Arguments:** `env` (Env), `session_id` (u32), `player` (Address), `move_type` (u32), `_card_value` (u32), `target_value` (u32), `score_delta` (u32), `is_seep` (bool), `proof` (Bytes).
- **Description:** The central function for gameplay mechanics. It receives a move, checks if the game is in an active play phase, and validates the move type. 
  - **ZK Enforcement:** If the `move_type` is between 2 and 6 (which corresponds to building or cementing houses), the contract enforces that a valid ZK proof is provided to guarantee the player holds the `target_value` card in their hand.
  - **State Update:** It decrements the player's remaining cards, updates scores, tracks "seeps" (clearing the table), and increments the global move count.
  - **Phase Advancement:** Manages transitions between halves of the game depending on the current phase.

#### `update_hand`
- **Arguments:** `env` (Env), `session_id` (u32), `player` (Address), `new_hand_hash` (BytesN<32>), `new_cards_count` (u32).
- **Description:** Invoked by the game server to update a player's hand hash. This typically occurs after a new deal (e.g., after the bid move or when transitioning between the first and second halves of the game).

#### `end_game`
- **Arguments:** `env` (Env), `session_id` (u32).
- **Description:** Wraps up the game session. It computes the final total score for each player, adding a 50-point bonus for every "seep" achieved. It determines the winner, notifies the Game Hub so external stakes/points can be settled, and finally marks the game state with the winning player's address.

#### `get_game`
- **Arguments:** `env` (Env), `session_id` (u32).
- **Description:** A read-only helper function that fetches and returns the current `SeepGame` state for a given session.

### Internal Verification Helpers

#### `verify_hand_contains_proof`
- **Arguments:** `env` (&Env), `proof` (&Bytes), `hand_hash` (&BytesN<32>), `target_value` (u32).
- **Description:** An internal private function that orchestrates the ZK proof verification. It fetches the external Verifier contract's address, constructs the public inputs (the 32-byte hand hash and the 32-byte target value), and calls the verifier's `verify_proof` function.

### Admin Functions

- **`get_admin(env)`**: Returns the current admin address.
- **`set_admin(env, new_admin)`**: Transfers admin rights to a new address. Requires current admin authorization.
- **`get_hub(env)` / `set_hub(env, new_hub)`**: Getter and setter for the Game Hub contract address.
- **`set_verifier(env, new_verifier)`**: Updates the address of the ZK Verifier contract.
- **`upgrade(env, new_wasm_hash)`**: Standard Soroban upgrade function. Allows the admin to update the contract's executable WASM code to a new version.
