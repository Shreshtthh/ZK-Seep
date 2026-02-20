import { Card, Suit } from './Card';

/**
 * A standard 52-card deck.
 * Ported from Seep_AI Deck.py.
 */
export class Deck {
    cards: Card[];

    constructor() {
        this.cards = [];
        for (let suit = 0; suit < 4; suit++) {
            for (let value = 1; value <= 13; value++) {
                this.cards.push({ suit: suit as Suit, value });
            }
        }
        this.shuffle();
    }

    /** Fisher-Yates shuffle. */
    shuffle(): void {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    /**
     * Deterministic shuffle from a seed.
     * Both players compute the same deck from the combined seed.
     * Uses a simple seeded PRNG (mulberry32).
     *
     * IMPORTANT: Resets cards to canonical order first so that
     * the result depends ONLY on the seed, not the current order.
     */
    shuffleWithSeed(seed: number): void {
        // Reset to canonical order so result is purely seed-dependent
        this.cards.sort((a, b) => a.suit !== b.suit ? a.suit - b.suit : a.value - b.value);

        // Mulberry32 PRNG
        let s = seed | 0;
        const random = (): number => {
            s = (s + 0x6d2b79f5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // Fisher-Yates with seeded random
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    /** Deal one card from the top. */
    dealCard(): Card {
        const card = this.cards.pop();
        if (!card) throw new Error('Deck is empty');
        return card;
    }

    /** Deal multiple cards from the top. */
    dealCards(count: number): Card[] {
        const dealt: Card[] = [];
        for (let i = 0; i < count; i++) {
            dealt.push(this.dealCard());
        }
        return dealt;
    }

    /** Number of remaining cards. */
    get remaining(): number {
        return this.cards.length;
    }
}
