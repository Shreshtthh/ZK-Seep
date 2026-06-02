# ZK-Seep Game Engine Deep Dive

This document provides a detailed, file-by-file and concept-by-concept breakdown of the frontend game engine used in ZK-Seep. The engine is written in TypeScript and handles all the complex rules, move generation, and scoring for the game. It is located in `zk-seep-frontend/src/game/`.

---

## 1. Game Orchestration (`Game.ts`)

The `SeepGame` class is the master orchestrator. It manages the complete lifecycle of a single game session, transitioning through various `GamePhase` states (Dealing, Bidding, BidMove, FirstHalf, SecondHalf, etc.).

### Key Concepts & Mechanics
- **Deterministic Dealing (`initializeWithSeed`)**: Instead of relying on a trusted server, both players generate a random seed. The engine XORs these two seeds together (`seed1 ^ seed2`) to produce a single, deterministic combined seed. This ensures neither player can cheat the shuffle, as both must commit to their seeds before the cards are dealt.
- **The Deal Sequence**: 
  1. The initial 4 cards are dealt to each player.
  2. The game verifies that the bidding player (always Player 0 in this 2-player setup) possesses at least one card of value 9 or higher. If not, the engine triggers a re-deal (which ties into the `no_high_cards` ZK circuit).
  3. The bidder sets a bid (9-13).
  4. 4 cards are dealt face-up to the Center (the floor).
  5. The bidder makes the first move (which must relate to the bid).
  6. 8 more cards are dealt to each player.
  7. The `FirstHalf` begins, alternating turns until hands are empty.
  8. A final 12 cards are dealt to each player for the `SecondHalf`.
- **Move Processing (`makeMove`)**: When a player submits a move, the engine identifies if it requires a ZK proof (types 2-6). If so, it calculates the `zkTargetValue` (the house value the player must prove they hold). It then executes the move on the player's state, applies Seep bonuses (50 points, or the bid value if it's the opening bid-move seep), and advances the game phase.
- **End Game (`endGame`)**: At the end of the second half, any remaining cards on the floor are awarded to the player who made the last successful "Pick Up" move. The engine then tallies scores and declares a winner.

---

## 2. Player Logic & Move Generation (`Player.ts`)

The `Player` class holds a player's hand, their captured cards, their current score, and the number of "Seeps" they have achieved. Its most critical role, however, is **Move Generation**.

### `possibleMoves()`
This function computes every legal move a player can make given their current hand and the state of the center floor. It implements the highly complex branching logic of Seep:
1. **Throw**: A card is dropped on the floor as a new loose pile. This is only allowed if the card does *not* match any existing pile or combination of piles.
2. **Build**: A player combines their card with loose piles on the floor to form a new "unfixed house" (valued between 9 and 13). The engine enforces the "Net-Change Rule," ensuring that there are never more than 2 houses on the floor at once.
3. **Cement**: If a player holds two cards of the same value (≥ 9) and there is a matching unfixed pile on the floor, they can "cement" (fix) it. A fixed pile can only be picked up by that exact card value.
4. **Merge + Fix**: A player combines their card with loose piles to match *another* existing unfixed pile, merging them all into a newly cemented house.
5. **Add to Fixed**: A player combines their card with loose piles to equal the value of an *already fixed* pile, adding the new cards to that cemented house.
6. **Direct Fix**: A player places their card directly onto a fixed pile of the identical value (requires holding two or more of that card).
7. **Pick Up**: A player plays a card that matches the value of a pile or combination of piles. In Seep, this automatically scoops up *all* combinations on the floor that sum to that value simultaneously.

---

## 3. Floor Management (`Center.ts` & `Pile.ts`)

The `Center` class represents the physical table/floor. It contains an array of `Pile` objects.

### `Pile.ts`
A `Pile` is a collection of one or more cards. 
- A pile is considered a **"House"** if it contains more than one card and has a specific tracked value (9-13).
- Piles can be `fixed = true` (cemented, locked to a specific value) or `fixed = false` (loose, can be picked up or manipulated into other combinations).

### `Center.ts`
- **`pickUpPiles()`**: Executes a capture. It removes the targeted piles from the floor, but crucially, it also loops through the remaining floor to find *any other* combinations that equal the played card's value and captures them too.
- **`addCardToPiles()`**: Executes the complex building/cementing moves (Types 2-6 from the Move Generation section). It properly mutates the floor by replacing loose piles with new fixed houses, merging piles together, or appending cards to existing cemented houses.
- **`getMoves(target)`**: A combinatorial algorithm that generates all possible subsets of loose piles that sum exactly to a given `target` value. This powers both the pickup logic and the house-building move generation.

---

## 4. Move Actions (`Move.ts`)

This file defines the `MoveType` enum and the `Move` interface. 
- It standardizes the 7 types of moves (Throw, Build, Cement, MergeFix, AddToFixed, DirectFix, PickUp).
- It contains the `moveRequiresZkProof()` helper, which explicitly flags Move Types 2, 3, 4, 5, and 6 as requiring cryptographic validation on the blockchain.

---

## 5. Cards & Deck Management (`Card.ts` & `Deck.ts`)

### `Card.ts`
- Standardizes the 52 cards using numeric IDs. 
- Contains the critical `cardScore()` function, which defines the unique scoring system of Seep:
  - Spades are worth their face value (e.g., King of Spades = 13 points, Ace of Spades = 1 point).
  - Non-spade Aces are worth 1 point.
  - The 10 of Diamonds is exceptionally worth 6 points.
  - All other cards are worth 0 points.

### `Deck.ts`
- Manages the 52-card deck array.
- Contains the `shuffleWithSeed(seed)` function. This function uses the `mulberry32` PRNG algorithm to ensure that a given numerical seed produces the exact same shuffled deck array across all clients, allowing for decentralized, trustless dealing based on the combined player seeds.
