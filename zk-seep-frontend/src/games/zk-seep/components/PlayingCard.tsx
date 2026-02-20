import { Suit, SUIT_SYMBOLS, VALUE_NAMES } from '@/game';
import type { Card } from '@/game';

interface PlayingCardProps {
  card?: Card;           // undefined = face-down
  selected?: boolean;
  selectable?: boolean;
  small?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, selected, selectable, small, onClick }: PlayingCardProps) {
  const isFaceDown = !card;
  const isRed = card && (card.suit === Suit.Hearts || card.suit === Suit.Diamonds);

  const classes = [
    'playing-card',
    isFaceDown ? 'playing-card--face-down' : 'playing-card--face-up',
    !isFaceDown && (isRed ? 'playing-card--red' : 'playing-card--black'),
    selectable && 'playing-card--selectable',
    selected && 'playing-card--selected',
    small && 'playing-card--small',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={selectable ? onClick : undefined}>
      {card && (
        <>
          <span className="playing-card__corner">
            {VALUE_NAMES[card.value]}<br />{SUIT_SYMBOLS[card.suit]}
          </span>
          <span className="playing-card__value">{VALUE_NAMES[card.value]}</span>
          <span className="playing-card__suit">{SUIT_SYMBOLS[card.suit]}</span>
          <span className="playing-card__corner playing-card__corner--bottom">
            {VALUE_NAMES[card.value]}<br />{SUIT_SYMBOLS[card.suit]}
          </span>
        </>
      )}
    </div>
  );
}
