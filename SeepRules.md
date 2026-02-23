# Seep (Sweep) — Complete Rules, Strategy & Tips

A comprehensive guide to the classic South Asian card game **Seep** (also called Sweep), covering rules, scoring, strategy, and advanced tips. This guide is specifically written for the 2-player variant used in ZK Seep.

---

## Table of Contents

- [Overview](#overview)
- [The Deck & Card Values](#the-deck--card-values)
- [Scoring System](#scoring-system)
- [Game Setup & Dealing](#game-setup--dealing)
- [The Bid](#the-bid)
- [Move Types (Detailed)](#move-types-detailed)
- [House Rules (Deep Dive)](#house-rules-deep-dive)
- [Seep (Sweep) — The Big Play](#seep-sweep--the-big-play)
- [End of Game](#end-of-game)
- [Strategy & Tips](#strategy--tips)
- [Worked Examples](#worked-examples)
- [Common Mistakes](#common-mistakes)

---

## Overview

Seep is a **fishing-style** card game hugely popular in Punjab and across South Asia. Two players take turns playing cards from their hand to **capture** cards from the floor, building strategic houses to protect valuable piles. The goal is to accumulate **more than 50 points** (out of 100 total) from captured cards.

The game is played with a standard 52-card deck. Each card has a **capture value** equal to its face value:

| Card | Value |
|------|-------|
| Ace | 1 |
| 2 through 10 | Face value |
| Jack | 11 |
| Queen | 12 |
| King | 13 |

---

## The Deck & Card Values

All 52 cards participate. Suits don't affect capture value — a 7♠ and a 7♥ both have value 7, and either can capture the same piles. However, suits **do** matter for scoring (Spades are worth points).

---

## Scoring System

Points are counted from your **captured pile** at the end of the game:

| Card(s) | Points |
|---------|--------|
| A♠ (Ace of Spades) | 1 |
| 2♠ | 2 |
| 3♠ | 3 |
| 4♠ | 4 |
| 5♠ | 5 |
| 6♠ | 6 |
| 7♠ | 7 |
| 8♠ | 8 |
| 9♠ | 9 |
| 10♠ | 10 |
| J♠ (Jack of Spades) | 11 |
| Q♠ (Queen of Spades) | 12 |
| K♠ (King of Spades) | 13 |
| A♥ (Ace of Hearts) | 1 |
| A♦ (Ace of Diamonds) | 1 |
| A♣ (Ace of Clubs) | 1 |
| 10♦ (Ten of Diamonds) | 6 |
| **Seep bonus** | **+50 each time** |
| All other cards | 0 |

**Total points in the deck: 100** (91 from Spades + 3 from non-spade Aces + 6 from 10♦).

> **To win, you need more than 50 points.** Exactly 50-50 is a draw.

---

## Game Setup & Dealing

### Phase 1: Initial Deal

Each player receives **4 cards**. The bidding player examines their hand.

**Re-deal rule:** If the bidding player has **no card with value ≥ 9** (i.e., no 9, 10, J, Q, or K), the hand is re-dealt. This ensures meaningful bids are possible. In ZK Seep, this is proven with a ZK proof — the player proves none of their cards are ≥ 9 without revealing the cards.

### Phase 2: Floor Cards & Bid

4 cards are dealt **face-up** to the center of the table (the "floor"). The bidding player then declares a **bid value** (9–13) and makes their first move, which must involve the bid value.

### Phase 3: First Half

Each player receives **8 more cards** (for a total of 12 in hand minus the one already played during the bid). Players alternate turns, each playing one card per turn, until all cards are played.

### Phase 4: Second Half

The remaining 24 cards are dealt — **12 to each player**. Play continues alternating turns until all cards are exhausted.

**End rule:** Whoever **last captured** cards from the floor gets any remaining loose cards on the floor.

---

## The Bid

The bid is the opening move that sets the tempo:

1. The bidding player declares a value between **9 and 13**.
2. Their **first move** must involve that bid value — either:
   - Building a house of that value
   - Picking up a pile whose total equals that value
   - Or performing another valid move involving that value

**Why does the bid matter?**
- It commits you to a value, revealing minimal strategic info while kick-starting the game.
- A high bid (12 or 13) is aggressive — you're committing to capturing Kings or Queens.
- A low bid (9) is safer but may leave valuable cards exposed.

---

## Move Types (Detailed)

On each turn you must play **exactly one card** from your hand. Here are all the ways you can use it:

### 1. Throw (Drop)

Simply place a card on the floor as a new loose pile. This is the "do nothing" move — useful when you can't make any better play.

**When to throw:**
- You have no useful captures or builds available.
- You want to bait your opponent into a bad capture.
- You're placing a low-value card that gives away few or no points.

> ⚠️ **Never throw a Spade or an Ace carelessly** — those are points you're giving to your opponent.

### 2. Build a House (Create)

Combine your played card with one or more **loose piles** on the floor to form an **unfixed house** whose total value is between 9 and 13.

**Requirements:**
- The sum of your card + selected loose pile(s) must equal a value from 9–13.
- You **must hold another card of that total value** in your hand (so you can capture it later).
- **ZK Proof required** — prove you hold a matching card without revealing it.

**Example:** You play 3♥, combining it with a loose 4♦ and a loose 2♣ on the floor. Total = 3 + 4 + 2 = 9. This creates an unfixed house of value 9. You must hold a 9 in your hand.

### 3. Cement a House (Fix)

Play a card whose value matches an existing **unfixed** house's value. This converts it into a **fixed** house (🔒).

**Requirements:**
- Your card's value must equal the unfixed house's value.
- You must hold **yet another card** of that value in your hand.
- **ZK Proof required.**

**Example:** There's an unfixed house of value 11 on the floor. You play J♠ (value 11) on it. The house is now fixed. You must still hold another Jack (or card of value 11) in your hand.

### 4. Merge + Fix

Combine your card with loose piles so the total matches an existing **unfixed** house, then merge everything into a **fixed** house.

**Example:** Unfixed house of value 10 exists. You play 3♣, combining with a loose 7♥ (3 + 7 = 10). This merges into the existing house-10 and fixes it.

### 5. Add to Fixed House

Play your card + loose pile(s) whose sum equals a **fixed** house's value. The cards get added to that fixed house.

**Example:** Fixed house-12 exists (🔒). You play 5♦ and combine with loose 7♣ (5 + 7 = 12). Both cards join the fixed house-12.

### 6. Add Directly to Fixed House

Play a card whose value **directly matches** a fixed house's value. It simply joins the house.

**Example:** Fixed house-9 exists. You play 9♦ directly onto it. The 9♦ joins the house.

### 7. Pick Up / Capture

Play a card whose value matches a pile's total value. You capture the entire pile — take all cards and add them to your **score pile** (face-down in front of you).

**Key capture rules:**
- You can capture **multiple piles** at once if each pile's value matches your card.
- If there's a fixed house of value X on the floor, and you play a card of value X, you **must** capture it (mandatory).
- When capturing, your played card also goes into your score pile.

**Example:** Floor has: loose 7♣, loose pile of (4♦ + 3♠ = 7), and fixed house-7. You play 7♥ — you capture ALL three (each has value 7). All cards go to your score pile.

---

## House Rules (Deep Dive)

Houses are the core strategic element of Seep. Understanding them deeply is essential.

### Why Build Houses?

- **Protection:** A fixed house can only be captured by a card matching its exact value. Your opponent can't break it apart.
- **Accumulation:** Every card added to a house increases the points you capture when you eventually pick it up.
- **Control:** Controlling the floor with fixed houses limits your opponent's options.

### Fixed vs. Unfixed

| Property | Unfixed House | Fixed House (🔒) |
|----------|---------------|-------------------|
| Can be captured by matching card | ✅ | ✅ |
| Can be broken apart | ✅ (opponent can use individual cards) | ❌ |
| Can be added to | ✅ | ✅ (if you have the matching value) |
| Requires ZK proof to create | ✅ | ✅ |

### The Two-House Limit

A critical rule: **each player can have at most 2 fixed houses** on the floor at any time. This prevents indefinite stalling. You must capture one of your houses before creating a third.

### The "Last Jack" Trick

> 💡 **Power move:** If you know you hold the **last remaining Jack** (value 11) in the entire game — perhaps because you tracked the other three being played — you can build a fixed house of value 11. **Nobody else can capture it.** You can then keep adding cards to this house freely, and capture it at the very end. Any loose cards remaining on the floor when the game ends also go to whoever made the last capture — so this play can swing the game dramatically.

This works with any value where you hold the last remaining card(s), but Jacks are the most common since value 11 can only be achieved by a Jack itself.

---

## Seep (Sweep) — The Big Play

A **Seep** occurs when you **capture every single card** on the floor in one move, leaving it completely empty.

- **Reward: +50 points** per Seep — this is game-changing.
- Multiple Seeps can occur in a single game.
- The ✨ animations in ZK Seep celebrate this with a particle burst.

### How Seep Happens

Seep is possible when:
1. There's only one pile (or multiple piles of the same value) on the floor.
2. You have a card matching that value.

**Example:** Floor has a single 8♣. You play 8♥ — capture it. Floor is empty. **Seep! +50 points.**

> ⚠️ **Watch out after dealing!** Immediately after a deal, if the floor is sparse, a Seep becomes likely. Be careful not to leave a single loose card that your opponent can easily match.

---

## End of Game

The game ends when both players have played all their cards (after the second half). Then:

1. **Last capture rule:** Whoever made the last capture takes all remaining floor cards.
2. **Score counting:** Each player tallies points from their captured piles.
3. **Winner:** The player with more than 50 points wins.

---

## Strategy & Tips

### 🧠 1. Memorize Played Cards

This is the **single most impactful skill** in Seep. Keep a mental note of:

- **Which high-value Spades** have been played (10♠, K♠, Q♠, J♠ = 46 points total).
- **Which Aces** have been captured.
- **Whether the 10♦** (6 points) is still in play.
- **How many cards of each value** remain. If three 9s have been played, the fourth 9 is the last one — incredibly powerful for house-building.

> **Tip:** Focus on tracking values 9–13 (the house-building range) and high-point Spades. You don't need to memorize every card — just the important ones.

### 🏠 2. Build Houses Around High-Point Cards

If you have K♠ (13 points) on the floor as a loose card, **build a fixed house of value 13** over it immediately. This protects 13 points and forces your opponent to find a King to capture it.

Prioritize protecting:
- K♠ (13 pts), Q♠ (12 pts), J♠ (11 pts), 10♠ (10 pts)
- 10♦ (6 pts)
- Aces (1 pt each, but they add up)

### 🪤 3. Set Traps with Throws

Sometimes throwing a low-value card is strategic:
- **Bait:** Throw a 3♣ when the floor has a 3♥. Your opponent might capture with a 3, but if you have a plan to Seep the resulting sparse floor, that's fine.
- **Deny captures:** If you can't capture anything useful, throw your least valuable card (a non-Spade, non-Ace low card).

### 🛡️ 4. Prevent Seep Against You

Getting Seep'd costs you 50 points — devastating. To prevent it:

- **Never leave a single pile** on the floor if your opponent might have a matching card.
- **If you must leave one pile**, make it a fixed house you control.
- **Throw** a card to keep at least 2 different-valued piles on the floor.

> **Key insight:** If there are 2+ piles of different values on the floor, a Seep is impossible (one card can't capture piles of different values unless they all match).

### 💎 5. The Last-Card House Strategy

As described above, if you can confirm you hold the **only remaining card** of a specific value:

1. Build and fix a house of that value.
2. Start dumping cards into it (using "Add to Fixed" moves).
3. Capture it at the very end for a massive haul.
4. As the last capturer, you also get all remaining floor cards.

This strategy works best in the **second half** when many cards have been played and you can track what's left.

### 📊 6. Count Points Throughout

Keep a running tally of your captured points. If you're at 55 and your opponent is at 45, you can afford to play conservatively. If you're behind, take risks — build houses aggressively, hunt for Seep opportunities.

### 🃏 7. Second Half Awareness

The second half deal gives each player 12 fresh cards. Key adjustments:
- Re-evaluate the floor after the deal.
- Your memorized card info from the first half is still valid and now even more valuable.
- Houses from the first half persist — protect or capture them.

### 🎯 8. Prioritize Capturing Over Building

Capturing immediately scores points. Building a house is a **promise** of future points — but your opponent might capture it first (if unfixed) or find the matching value (if fixed). **When in doubt, capture.**

### 🔄 9. Avoid Getting "Seep'd" After Re-deal

After the second-half deal, the floor might have only 1 pile left from the first half. If your opponent has a matching card, they'll Seep immediately. Consider leaving the floor with multiple piles before the deal happens.

---

## Worked Examples

### Example 1: To Build or To Capture?

**Situation:**
- Your hand: `9♠, 5♣, 3♦, K♥`
- Floor: loose `4♠`, loose `5♦`, unfixed house-9 (contains `6♣ + 3♥`)

**Options:**
1. **Play 5♣ → capture loose 5♦.** You get 5♦ (0 pts). Safe, but low value.
2. **Play 9♠ → capture unfixed house-9.** You get 9♠ (9 pts) + 6♣ + 3♥. Excellent — 9 points!
3. **Play 3♦ + loose 4♠ → build house of value 7.** Wait — 7 is below 9, so you can't build a house of value 7. Invalid!
4. **Play K♥ → throw.** Waste of a King.

**Best move: Option 2.** Capturing the house-9 with 9♠ nets you 9 points and clears a pile. Always capture high-Spade piles when possible.

---

### Example 2: Preventing Seep

**Situation:**
- Floor: only a loose `7♣` remains
- Your hand: `7♦, 2♠, Q♣`
- It's your turn.

**Options:**
1. **Play 7♦ → capture 7♣.** Floor is now empty — that's a **Seep by you! +50 points!** 🎉
2. **Play 2♠ → throw.** Floor now has 7♣ and 2♠. No Seep risk for opponent.

**Best move: Obviously Option 1!** When you can Seep, almost always do it. The +50 bonus is enormous.

---

### Example 3: The Defensive Throw

**Situation:**
- Floor: loose `6♥` (only pile)
- Your hand: `3♣, 4♦, A♠` — no 6 to capture with
- Opponent likely has a 6 (you've only seen one 6 played so far)

If you throw any card, the floor will have 2 piles of different values, making Seep impossible for your opponent.

**Best move:** Throw `3♣` (0 points, least valuable). Now the floor has 6♥ and 3♣ — your opponent can't Seep.

> **Avoid throwing A♠** — that's 1 point you're handing away for free!

---

### Example 4: Building a House to Protect Points

**Situation:**
- Floor: loose `10♠` (10 pts!), loose `3♦`
- Your hand: `K♣, K♠, 8♥, 5♣`

That 10♠ sitting loose is dangerous — opponent could capture it with any 10.

**Options:**
1. **Play 3♦ is not in your hand.** Can't use it.
2. **Play K♣ → throw.** Wastes a King and doesn't protect 10♠.
3. **Play 3♦... wait, you don't have 3♦.** Let's rethink.
4. **Play 8♥ + loose 5♣... nope, 5♣ is in your hand not on the floor.**

Hmm. Let's reconsider: you have `K♣, K♠, 8♥, 5♣` and the floor has `10♠, 3♦`.

- **Play 5♣ + loose 3♦ → build house of value 8?** No, 8 is below 9. Invalid.
- **Play 8♥ → throw.** Floor has 10♠, 3♦, 8♥. At least the opponent needs a 10 specifically.
- **Play K♣ + loose 10♠ + loose 3♦ → build house-13 (10+3=13, then add K♣... wait, that's a capture, not a build).**

Actually: **Play 3♦'s value is 3, 10♠ is 10. 3 + 10 = 13 = King.** You can use a card from your hand to build: play `K♣` isn't right either because K = 13, and you'd be making a house of 13 from cards summing to 13.

**Correct move:** You **cannot** build with K♣ and the floor cards in a way that makes a normal house. But you could: **Throw 8♥** defensively, keeping the floor diversified. Then next turn, try to capture 10♠ by building around it.

**Sometimes there's no perfect move** — and throwing your worst card is correct.

---

### Example 5: The Last Jack Power Play

**Situation (second half, late game):**
- Three Jacks have already been played (J♥, J♦, J♣ — all in score piles)
- You have J♠ (11 pts) in your hand — the **last Jack in the game**
- Floor has: loose `4♣`, loose `7♥` (4 + 7 = 11)

**The play:**
1. Play another card + loose 4♣ + 7♥ → build house-11. Wait, you need to play a card that contributes.
   
   Actually: you can play **any card from your hand** and combine with floor cards to total 11.
   
2. Better: **Play 4-value card + loose 7♥ = 11.** If you have a 4, you can build house-11 from your 4 + floor 7♥. Then fix it with J♠ next turn — wait, you need another J to fix. But you have the LAST Jack.

   Simpler approach: **Build using floor cards.** Play any card value X, combining with floor cards summing to (11 - X).

3. Once you have house-11 (unfixed), **cement it with J♠** — this makes it fixed. Since you have the last Jack, nobody can capture it.

4. Now use "Add to Fixed" moves to pile valuable cards onto house-11.

5. At the end, capture the house for a massive point swing.

> **This is one of the most powerful moves in Seep.** It can single-handedly win a game.

---

## Common Mistakes

### ❌ Throwing Spades Carelessly
Every Spade is worth points. Throwing 8♠ gives your opponent a free 8 points if they capture it.

### ❌ Forgetting the House Requirement
You build a house of value 11 but don't have another 11 in your hand. In physical Seep, you might get away with it. In ZK Seep, the ZK proof will fail and the move is rejected.

### ❌ Leaving One Pile on the Floor
If only one pile exists and your opponent has a matching card, that's a **Seep (-50 for you).** Always keep at least 2 different-valued piles or a fixed house you control.

### ❌ Not Counting Points
You might play conservatively when you're actually behind. Track the score mentally and adjust your aggression level.

### ❌ Ignoring the 10♦
The Ten of Diamonds is worth **6 points** — more than most people remember. Treat it like a high Spade.

### ❌ Building Houses You Can't Defend
If two Kings have been played and you build a house-13, your opponent likely holds a King to capture it. Track card counts before investing in house-building.

---

## Quick Reference Card

```
POINTS:   Spades = face value (91 total)
          Non-spade Aces = 1 each (3 total)
          10♦ = 6
          Seep = +50
          Everything else = 0
          TOTAL IN DECK = 100

HOUSES:   Value 9-13 only
          Unfixed → anyone can capture
          Fixed (🔒) → only exact value captures
          Need another card of same value to build/fix (ZK proven)
          Max 2 fixed houses per player

WINNING:  Score > 50 points
```

---

*For a shorter overview of the rules, see the [README](./README.md#game-rules--2-player-seep). For the ZK implementation details, see the [Architecture section](./README.md#architecture).*
