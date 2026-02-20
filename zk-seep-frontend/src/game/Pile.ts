import { Card, cardScore, cardEquals } from './Card';

/**
 * A pile on the center/floor of the game.
 * Can be fixed (cemented) or unfixed.
 */
export interface Pile {
    value: number;       // The "house value" of this pile (9-13 for houses, or face value for loose cards)
    cards: Card[];       // All cards in this pile
    fixed: boolean;      // true = cemented house (only matching value can capture)
    score: number;       // Sum of scoring card values in this pile
}

/** Create a new pile from cards. */
export function createPile(value: number, cards: Card[], fixed = false): Pile {
    let score = 0;
    for (const card of cards) {
        score += cardScore(card);
    }
    return { value, cards: [...cards], fixed, score };
}

/** Add a card to a pile. If changingValue is true, the pile's value increases by the card's value. */
export function addCardToPile(pile: Pile, card: Card, changingValue: boolean): void {
    if (changingValue) {
        pile.value += card.value;
    }
    pile.cards.push(card);
    pile.score += cardScore(card);
}

/** Check if two piles are equal. */
export function pileEquals(a: Pile, b: Pile): boolean {
    if (a.value !== b.value || a.fixed !== b.fixed || a.score !== b.score) return false;
    if (a.cards.length !== b.cards.length) return false;
    return a.cards.every((card, i) => cardEquals(card, b.cards[i]));
}

/** Deep clone a pile. */
export function clonePile(pile: Pile): Pile {
    return {
        value: pile.value,
        cards: pile.cards.map(c => ({ ...c })),
        fixed: pile.fixed,
        score: pile.score,
    };
}

/** String representation of a pile. */
export function pileToString(pile: Pile): string {
    const prefix = pile.fixed ? '🔒 Fixed' : 'Unfixed';
    return `${prefix} Pile (Value: ${pile.value}, Score: ${pile.score}, Cards: ${pile.cards.length})`;
}
