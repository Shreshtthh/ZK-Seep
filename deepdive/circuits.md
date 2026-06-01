# ZK Circuits Deep Dive

This document provides an in-depth, function-by-function explanation of the Noir Zero-Knowledge (ZK) circuits used in the ZK-Seep project. These circuits ensure game integrity by allowing players to prove facts about their hidden hands without revealing the cards themselves. They are written in Noir (`.nr` files).

There are three primary circuits in the project:
1. **`hand_contains`**
2. **`no_high_cards`**
3. **`poseidon2_hash`**

---

## 1. `hand_contains` Circuit
**File:** `circuits/hand_contains/src/main.nr`

This is the core ZK mechanic of the Seep game. It is used when a player wants to "build" or "cement" a house of a specific value on the table, or when making a bid. Game rules state you can only build a house of value $X$ if you secretly hold another card of value $X$ in your hand. This circuit proves exactly that.

### Function: `main`

#### **Inputs:**
- `hand: [Field; 12]` (Private): An array representing the 12 card slots in the player's hand. Card values range from 1 to 13 (where 0 indicates an empty slot).
- `salt: Field` (Private): A random nonce used to prevent brute-force preimage attacks on the hand hash.
- `hand_hash: pub Field` (Public): The Poseidon2 hash of the player's hand and salt, which was committed on-chain during the `HandCommit` phase.
- `target_value: pub Field` (Public): The card value the player claims to possess (e.g., the house value they are trying to build).

#### **Constraints & Logic:**
1. **Hash Verification:** 
   The function first constructs a 13-element array called `preimage`, combining the 12 cards in the `hand` array with the private `salt` appended at the end. It then computes the Poseidon2 hash of this `preimage` and asserts that it matches the public `hand_hash`. This ensures the player is proving against the exact hand they originally committed to on-chain.
2. **Possession Verification:**
   The function iterates through the 12 elements of the `hand`. It checks if any card matches the public `target_value`. It sets a boolean flag `found` to `true` if a match is discovered. Finally, it asserts that `found` is `true`. If the player doesn't have the card, the proof generation fails.

---

## 2. `no_high_cards` Circuit
**File:** `circuits/no_high_cards/src/main.nr`

In the game of Seep, a player who is dealt an initial hand (the first 4 cards) with no "high" cards (values 9, 10, J, Q, K) is legally allowed to request a re-deal. This circuit allows a player to prove their starting hand meets this condition without showing the cards to the opponent.

### Function: `main`

#### **Inputs:**
- `hand: [Field; 4]` (Private): An array representing the initial 4 cards dealt to the player.
- `salt: Field` (Private): The random nonce used to salt the hash.
- `hand_hash: pub Field` (Public): The Poseidon2 hash of these 4 cards and the salt, committed on-chain.

#### **Constraints & Logic:**
1. **Hash Verification:**
   Similar to the `hand_contains` circuit, it constructs a 5-element `preimage` (4 cards + 1 salt) and computes its Poseidon2 hash. It then asserts that this computed hash exactly matches the public `hand_hash`.
2. **High-Card Verification:**
   It iterates over the 4 cards in the `hand`. For each card:
   - It asserts that the card value is at least `1` (ensuring no empty/invalid slots are maliciously passed).
   - It asserts that the card value is strictly less than `9` (`< 9`). 
   If any card in the initial hand is 9 or above, the constraint fails and the player cannot generate a valid re-deal proof.

---

## 3. `poseidon2_hash` Circuit
**File:** `circuits/poseidon2_hash/src/main.nr`

This is a helper circuit. Because Noir uses specific SNARK-friendly hashing algorithms like Poseidon2, computing the exact matching hash in a web browser (TypeScript) can be complex or require heavy WASM dependencies. This circuit is compiled to WASM and used directly by the frontend to accurately compute the `hand_hash` before sending it to the blockchain.

### Function: `main`

#### **Inputs:**
- `hand: [Field; 12]` (Private): The 12-card hand.
- `salt: Field` (Private): The random nonce.

#### **Outputs:**
- `pub Field`: Returns the Poseidon2 hash as a public output.

#### **Logic:**
The function simply maps the 12 `hand` elements and the `salt` into a 13-element `preimage` array and returns the result of `Poseidon2::hash(preimage, 13)`. It contains no assertions or constraints—it is purely a mathematical utility to guarantee the browser's hash matches the ZK prover's hash exactly.
