import { Card, cardEquals } from './Card';
import { Pile, createPile, addCardToPile, clonePile, pileEquals } from './Pile';

/**
 * The Center (floor) of the Seep game.
 * Contains all piles currently on the table.
 * Ported from Seep_AI Center.py.
 */
export class Center {
    piles: Pile[] = [];
    lastPickUp: number = -1; // Player ID of last player to pick up

    /** Sort piles by value (ascending). */
    private sortPiles(): void {
        this.piles.sort((a, b) => a.value - b.value);
    }

    /** Find index of a pile by reference equality with pileEquals. */
    private findPileIndex(pile: Pile): number {
        return this.piles.findIndex(p => pileEquals(p, pile));
    }

    /** Remove a pile from the center. */
    private removePile(pile: Pile): void {
        const idx = this.findPileIndex(pile);
        if (idx >= 0) {
            this.piles.splice(idx, 1);
        }
    }

    /**
     * Pick up piles that match the card value.
     * Also picks up ALL other combinations of piles that sum to the same value.
     * Returns all captured cards (including the played card).
     */
    pickUpPiles(card: Card, piles: Pile[], playerId: number): Card[] {
        this.lastPickUp = playerId;

        const pileSum = piles.reduce((sum, p) => sum + p.value, 0);
        if (pileSum !== card.value) {
            throw new Error(`Cannot pick up: pile sum ${pileSum} ≠ card value ${card.value}`);
        }

        const capturedCards: Card[] = [card];

        // Remove the targeted piles and collect their cards
        for (const pile of piles) {
            capturedCards.push(...pile.cards);
            this.removePile(pile);
        }

        // Also pick up ALL remaining combinations that equal the card value
        let hasMore = true;
        while (hasMore) {
            const combos = this.getMoves(card.value);
            if (combos.length === 0) {
                hasMore = false;
            } else {
                const combo = combos[0];
                for (const pile of combo) {
                    capturedCards.push(...pile.cards);
                    this.removePile(pile);
                }
            }
        }

        return capturedCards;
    }

    /**
     * Give all remaining floor cards to a player's captured cards.
     * Called at end of game — last player to pick up gets remaining floor.
     */
    finalCleanUp(): Card[] {
        const remaining: Card[] = [];
        for (const pile of this.piles) {
            remaining.push(...pile.cards);
        }
        this.piles = [];
        return remaining;
    }

    /**
     * Add a card to piles on the floor (house building/cementing).
     * This implements the 6 branching move types from Seep_AI.
     *
     * Move types handled (Types 2-6):
     * - Type 2: Build unfixed house (card + unfixed piles → new unfixed pile, value 9-13)
     * - Type 3: Cement (card matches unfixed pile value → fix it)
     * - Type 4: Merge unfixed piles to match an existing unfixed pile → fix both
     * - Type 5: Add card + piles to an existing fixed pile
     * - Type 6: Add card directly to a fixed pile of same value
     */
    addCardToPiles(card: Card, piles: Pile[]): void {
        const anyFixed = piles.some(p => p.fixed);

        if (!anyFixed) {
            // No fixed piles in the selection
            const totalValue = piles.reduce((sum, p) => sum + p.value, 0) + card.value;

            if (totalValue >= 9 && totalValue <= 13) {
                // Total is a valid house value
                const matchingPile = this.piles.find(p => p.value === totalValue);

                if (matchingPile) {
                    if (matchingPile.fixed) {
                        // Type 5: Add unfixed piles to existing fixed pile
                        this.addUnfixedToFixed(card, piles, matchingPile);
                    } else {
                        // Type 4: Merge with existing unfixed pile → both become fixed
                        this.mergeUnfixedToFixed(card, piles, matchingPile);
                    }
                } else {
                    // Type 2: Create new unfixed house
                    this.makeUnfixedPile(card, piles, totalValue);
                }
            } else {
                // Check if this is Type 3: cementing (card value matches pile sum, both >= 9)
                const pileSum = totalValue - card.value;
                if (pileSum >= 9 && totalValue === card.value * 2) {
                    // Type 3: Turn unfixed pile into fixed
                    this.makeUnfixedIntoFixed(card, piles);
                } else {
                    throw new Error(
                        `Invalid house: total ${totalValue} is out of range 9-13`
                    );
                }
            }
        } else {
            // Has fixed pile(s) in selection
            if (piles.length === 1 && piles[0].value === card.value) {
                // Type 6: Add card directly onto a fixed pile
                this.addCardToFixedPile(card, piles[0]);
            } else {
                throw new Error(
                    `Invalid move: can only add to a single fixed pile with matching value`
                );
            }
        }
    }

    /** Type 5: Card + unfixed piles → add to existing fixed pile. */
    private addUnfixedToFixed(card: Card, piles: Pile[], matchingPile: Pile): void {
        const cards: Card[] = [card];

        // Remove the selected unfixed piles
        for (const pile of piles) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        // Also collect any other piles with the same value
        const targetValue = matchingPile.value;
        const newPile = createPile(targetValue, [], true);

        // Collect matching piles
        const toRemove = this.piles.filter(p => p.value === targetValue);
        for (const pile of toRemove) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        // Add all cards to the new fixed pile
        for (const c of cards) {
            addCardToPile(newPile, c, false);
        }

        this.piles.push(newPile);
        this.sortPiles();
    }

    /** Type 4: Card + unfixed piles merge with existing unfixed pile → all become fixed. */
    private mergeUnfixedToFixed(card: Card, piles: Pile[], matchingPile: Pile): void {
        const cards: Card[] = [card];

        // Remove selected piles
        for (const pile of piles) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        const targetValue = matchingPile.value;
        const newPile = createPile(targetValue, [], true);

        // Also collect all piles with matching value (including the unfixed one)
        const toRemove = this.piles.filter(p => p.value === targetValue);
        for (const pile of toRemove) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        for (const c of cards) {
            addCardToPile(newPile, c, false);
        }

        this.piles.push(newPile);
        this.sortPiles();
    }

    /** Type 2: Card + unfixed piles → new unfixed house. */
    private makeUnfixedPile(card: Card, piles: Pile[], totalValue: number): void {
        const cards: Card[] = [card];

        for (const pile of piles) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        this.piles.push(createPile(totalValue, cards, false));
        this.sortPiles();
    }

    /** Type 3: Card cements an unfixed pile (card value = pile value, both >= 9). */
    private makeUnfixedIntoFixed(card: Card, piles: Pile[]): void {
        const cards: Card[] = [card];

        for (const pile of piles) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        this.piles.push(createPile(card.value, cards, true));
        this.sortPiles();
    }

    /** Type 6: Add a card to an existing fixed pile with matching value. */
    private addCardToFixedPile(card: Card, targetPile: Pile): void {
        const cards: Card[] = [card];

        // Also collect other piles with the same value (they merge into the fixed pile)
        const targetValue = targetPile.value;
        const idx = this.findPileIndex(targetPile);

        const otherSameValue = this.piles.filter(
            (p, i) => p.value === targetValue && i !== idx
        );
        for (const pile of otherSameValue) {
            cards.push(...pile.cards);
            this.removePile(pile);
        }

        // Re-find the target pile (indices may have shifted)
        const currentTarget = this.piles.find(p => p.value === targetValue && p.fixed);
        if (currentTarget) {
            for (const c of cards) {
                addCardToPile(currentTarget, c, false);
            }
        }
    }

    /**
     * Add a brand new pile to the center (Type 1: Throw).
     * During bid stage, duplicate values are allowed.
     */
    addNewPile(pile: Pile, bidStage = false): void {
        if (!bidStage) {
            const hasMatch = this.piles.some(p => p.value === pile.value);
            if (hasMatch) {
                throw new Error(`Cannot throw: a pile of value ${pile.value} already exists`);
            }
        }
        this.piles.push(pile);
        this.sortPiles();
    }

    /**
     * Get all combinations of piles whose values sum to `target`.
     * By default includes fixed piles as single-pile combos.
     * Used for move generation and pickup validation.
     */
    getMoves(target: number, includeFixed = true): Pile[][] {
        const notFixed = this.piles.filter(p => !p.fixed);
        const results: Pile[][] = [];

        // Generate all subsets of unfixed piles
        const n = notFixed.length;
        for (let mask = 0; mask < (1 << n); mask++) {
            const subset: Pile[] = [];
            let sum = 0;
            for (let i = 0; i < n; i++) {
                if (mask & (1 << i)) {
                    subset.push(notFixed[i]);
                    sum += notFixed[i].value;
                }
            }
            if (sum === target && subset.length > 0) {
                results.push(subset);
            }
        }

        // Add fixed piles individually if they match
        if (includeFixed) {
            for (const pile of this.piles) {
                if (pile.fixed && pile.value === target) {
                    results.push([pile]);
                }
            }
        }

        return results;
    }

    /** Deep clone the center. */
    clone(): Center {
        const c = new Center();
        c.piles = this.piles.map(p => clonePile(p));
        c.lastPickUp = this.lastPickUp;
        return c;
    }

    /** String representation. */
    toString(): string {
        return `Center (${this.piles.length} piles):\n` +
            this.piles.map(p => `  ${p.fixed ? '🔒' : '  '} Value ${p.value} (${p.cards.length} cards, score ${p.score})`).join('\n');
    }
}
