import { Card, cardEquals, cardScore, cardCompare } from './Card';
import { Pile, createPile } from './Pile';
import { Center } from './Center';
import { Move, MoveType, moveRequiresZkProof } from './Move';

/** A "house" is any pile with > 1 card AND a valid house value (9-13). */
const isHouse = (p: Pile): boolean => p.cards.length > 1 && p.value >= 9 && p.value <= 13;

/**
 * A Seep player.
 * Manages hand, captured cards, score, and move generation.
 * Ported from Seep_AI Player.py — stripped of AI logic, kept move generation + validation.
 */
export class Player {
    id: number;
    hand: Card[] = [];
    capturedCards: Card[] = [];
    seeps: number = 0;
    seepBonus: number = 0; // Total seep bonus points (variable: 50 normally, bidValue for bid-move seep)
    score: number = 0;

    constructor(id: number) {
        this.id = id;
    }

    /** Add cards to the player's hand (sorted by value). */
    addCardsToHand(cards: Card[]): void {
        this.hand.push(...cards);
        this.hand.sort(cardCompare);
    }

    /** Remove a specific card from hand. */
    playCard(card: Card): void {
        const idx = this.hand.findIndex(c => cardEquals(c, card));
        if (idx === -1) {
            throw new Error(`Card not found in hand: ${card.value} of suit ${card.suit}`);
        }
        this.hand.splice(idx, 1);
    }

    /** Calculate the player's current score from captured cards + seep bonus. */
    calculateScore(): number {
        this.score = this.seepBonus;
        for (const card of this.capturedCards) {
            this.score += cardScore(card);
        }
        return this.score;
    }

    /** Check if the player has a card >= 9 (for bidding eligibility). */
    hasBidEligibleCard(): boolean {
        return this.hand.some(c => c.value >= 9);
    }

    /** Get all cards eligible for bidding (value >= 9). */
    getBidEligibleCards(): Card[] {
        return this.hand.filter(c => c.value >= 9);
    }

    /** Count how many cards of a given value are in hand. */
    private countValue(value: number): number {
        return this.hand.filter(c => c.value === value).length;
    }

    /**
     * Generate all legal moves for the current board state.
     * This is the core move generation logic from Seep_AI Player.possibleMoves().
     *
     * @param center  The current floor state
     * @param bidMove Whether this is the first move after bidding
     * @param bid     The bid value (only relevant if bidMove is true)
     */
    possibleMoves(center: Center, bidMove = false, bid = 0): Move[] {
        const moves: Move[] = [];
        const currentPileValues = center.piles.map(p => p.value);
        const fixedPiles = center.piles.filter(p => p.fixed);
        const notFixedPiles = center.piles.filter(p => !p.fixed);
        // Count ALL houses on the floor (fixed or unfixed, multi-card piles valued 9-13)
        const houseCount = center.piles.filter(isHouse).length;

        for (const card of this.hand) {
            const possiblePickUps = center.getMoves(card.value);

            // ───── Type 1: Throw ─────
            // Can throw if no pile/combo matches the card value
            const pickUpSums = possiblePickUps.map(combo => combo.reduce((s, p) => s + p.value, 0));
            if (!currentPileValues.includes(card.value) && !pickUpSums.includes(card.value)) {
                if (!bidMove || card.value === bid) {
                    moves.push({ type: MoveType.Throw, card });
                }
            }

            // ───── Type 2: Build unfixed house ─────
            // Blocked if 2 houses already exist on the floor
            if (houseCount < 2) {
                for (let points = Math.max(9 - card.value, 0); points < Math.max(14 - card.value, 0); points++) {
                    if (points > 0 && this.countValue(card.value + points) >= 1) {
                        const waysToMake = center.getMoves(points, false);
                        const totalValue = card.value + points;
                        if (waysToMake.length > 0 && !currentPileValues.includes(totalValue) &&
                            (!bidMove || totalValue === bid)) {
                            for (const way of waysToMake) {
                                // Net change: +1 new house - houses consumed by way piles
                                const housesConsumed = way.filter(isHouse).length;
                                if (houseCount + 1 - housesConsumed <= 2) {
                                    moves.push({ type: MoveType.Build, card, piles: way });
                                }
                            }
                        }
                    }
                }
            }

            // ───── Type 3: Cement (card value matches unfixed pile, card value >= 9, have 2+ of that value) ─────
            // Allowed if the way is already a house (cementing doesn't create a new one).
            // Blocked at 2 houses if the way is a single card (cementing WOULD create a new house).
            if (card.value >= 9 && this.countValue(card.value) >= 2 &&
                (!bidMove || bid === card.value)) {
                const waysToMake = center.getMoves(card.value, false);
                for (const way of waysToMake) {
                    const wayIsAlreadyHouse = way.length === 1 && isHouse(way[0]);
                    if (wayIsAlreadyHouse || houseCount < 2) {
                        moves.push({ type: MoveType.Cement, card, piles: way });
                    }
                }
            }

            // ───── Type 4: Merge + Fix (card + unfixed = matches another unfixed) ─────
            // Uses net-change analysis: +1 new house - houses consumed (way piles + matching target)
            {
                for (let points = Math.max(9 - card.value, 0); points < Math.max(14 - card.value, 0); points++) {
                    if (points > 0 && this.countValue(card.value + points) >= 1 &&
                        (!bidMove || card.value + points === bid)) {
                        const waysToMake = center.getMoves(points, false);
                        const totalValue = card.value + points;
                        if (waysToMake.length > 0 && notFixedPiles.some(p => p.value === totalValue)) {
                            for (const way of waysToMake) {
                                // Count houses consumed by way piles
                                const housesInWay = way.filter(isHouse).length;
                                // Check if ANY matching unfixed target pile is a house
                                const matchIsHouse = notFixedPiles.some(p => p.value === totalValue && isHouse(p)) ? 1 : 0;
                                // Net change = +1 (new fixed house) - housesInWay - matchIsHouse
                                const netChange = 1 - housesInWay - matchIsHouse;
                                if (houseCount + netChange <= 2) {
                                    moves.push({ type: MoveType.MergeFix, card, piles: way });
                                }
                            }
                        }
                    }
                }
            }

            // ───── Type 5: Add to Fixed (card + unfixed piles match a fixed pile) ─────
            for (let points = Math.max(9 - card.value, 0); points < Math.max(14 - card.value, 0); points++) {
                if (points > 0 && this.countValue(card.value + points) >= 1 && !bidMove) {
                    const waysToMake = center.getMoves(points, false);
                    const totalValue = card.value + points;
                    if (waysToMake.length > 0 && fixedPiles.some(p => p.value === totalValue)) {
                        for (const way of waysToMake) {
                            moves.push({ type: MoveType.AddToFixed, card, piles: way });
                        }
                    }
                }
            }

            // ───── Type 6: Direct Fix (card on fixed pile of same value, need 2+) ─────
            if (this.countValue(card.value) >= 2 && !bidMove) {
                for (const pile of fixedPiles) {
                    if (pile.value === card.value) {
                        moves.push({ type: MoveType.DirectFix, card, piles: [pile] });
                        break;
                    }
                }
            }

            // ───── Type 7: Pick Up ─────
            // In Seep, playing a card picks up ALL matching combos at once.
            // Center.pickUpPiles() auto-collects remaining combos after the initial
            // targeted pickup, so we only need ONE PickUp move per card.
            if (possiblePickUps.length > 0 && (!bidMove || card.value === bid)) {
                moves.push({ type: MoveType.PickUp, card, piles: possiblePickUps[0] });
            }
        }

        // ───── Bid-move pickup: if ALL floor piles sum to bid value, allow picking everything up ─────
        if (bidMove && center.piles.length > 0) {
            const floorSum = center.piles.reduce((s, p) => s + p.value, 0);
            if (floorSum === bid) {
                // Check if the player has a card of the bid value
                const bidCard = this.hand.find(c => c.value === bid);
                if (bidCard) {
                    // Check this combo isn't already in the moves
                    const allPiles = [...center.piles];
                    const alreadyExists = moves.some(m =>
                        m.type === MoveType.PickUp &&
                        m.card.value === bid &&
                        m.piles?.length === allPiles.length
                    );
                    if (!alreadyExists) {
                        moves.push({ type: MoveType.PickUp, card: bidCard, piles: allPiles });
                    }
                }
            }
        }

        // Sort by type for consistent ordering
        moves.sort((a, b) => a.type - b.type);
        return moves;
    }

    /**
     * Execute a move on the center.
     * If test is true, only simulates (doesn't modify player's hand/captured cards).
     * @param seepValue  Points for a seep (default 50; pass bid value during bid-move)
     */
    doMove(move: Move, center: Center, test = false, seepValue = 50): void {
        if (!test) {
            this.playCard(move.card);
        }

        switch (move.type) {
            case MoveType.Throw:
                center.addNewPile(createPile(move.card.value, [move.card]));
                break;

            case MoveType.Build:
            case MoveType.Cement:
            case MoveType.MergeFix:
            case MoveType.AddToFixed:
            case MoveType.DirectFix:
                center.addCardToPiles(move.card, move.piles!);
                break;

            case MoveType.PickUp:
                if (!test) {
                    const captured = center.pickUpPiles(move.card, move.piles!, this.id);
                    this.capturedCards.push(...captured);
                    if (center.piles.length === 0) {
                        // Seep! But max 2 allowed — 3rd seep discards all
                        if (this.seeps >= 2) {
                            // 3rd seep: discard all seeps
                            this.seeps = 0;
                            this.seepBonus = 0;
                        } else {
                            this.seeps++;
                            this.seepBonus += seepValue;
                        }
                    }
                } else {
                    center.pickUpPiles(move.card, move.piles!, this.id);
                }
                break;
        }

        this.calculateScore();
    }

    /** Deep clone the player. */
    clone(): Player {
        const p = new Player(this.id);
        p.hand = this.hand.map(c => ({ ...c }));
        p.capturedCards = this.capturedCards.map(c => ({ ...c }));
        p.seeps = this.seeps;
        p.seepBonus = this.seepBonus;
        p.score = this.score;
        return p;
    }
}
