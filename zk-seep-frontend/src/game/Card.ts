// Card suits as numeric enum for compact storage
export enum Suit {
  Spades = 0,
  Hearts = 1,
  Clubs = 2,
  Diamonds = 3,
}

export const SUIT_NAMES: Record<Suit, string> = {
  [Suit.Spades]: 'Spades',
  [Suit.Hearts]: 'Hearts',
  [Suit.Clubs]: 'Clubs',
  [Suit.Diamonds]: 'Diamonds',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.Spades]: '♠',
  [Suit.Hearts]: '♥',
  [Suit.Clubs]: '♣',
  [Suit.Diamonds]: '♦',
};

export const VALUE_NAMES: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export interface Card {
  suit: Suit;
  value: number; // 1-13 (A=1, J=11, Q=12, K=13)
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function cardToString(card: Card): string {
  return `${VALUE_NAMES[card.value]}${SUIT_SYMBOLS[card.suit]}`;
}

export function cardDisplayName(card: Card): string {
  return `${VALUE_NAMES[card.value]} of ${SUIT_NAMES[card.suit]}`;
}

/**
 * Score contribution of a single card.
 * Spades: face value (A♠=1, 2♠=2, ... K♠=13)
 * Non-spade Aces: 1
 * 10♦: 6
 * Everything else: 0
 */
export function cardScore(card: Card): number {
  if (card.suit === Suit.Spades) {
    return card.value;
  }
  if (card.value === 1) {
    return 1; // Non-spade Ace
  }
  if (card.value === 10 && card.suit === Suit.Diamonds) {
    return 6; // 10 of Diamonds
  }
  return 0;
}

/** Sort comparator: by value ascending, then by suit */
export function cardCompare(a: Card, b: Card): number {
  if (a.value !== b.value) return a.value - b.value;
  return a.suit - b.suit;
}

/**
 * Create a unique numeric ID for a card (0-51).
 * Used for hashing and compact representation.
 */
export function cardId(card: Card): number {
  return card.suit * 13 + (card.value - 1);
}

/** Create a Card from its numeric ID (0-51). */
export function cardFromId(id: number): Card {
  return {
    suit: Math.floor(id / 13) as Suit,
    value: (id % 13) + 1,
  };
}
