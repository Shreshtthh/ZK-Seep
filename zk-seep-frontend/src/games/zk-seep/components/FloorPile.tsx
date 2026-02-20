import { PlayingCard } from './PlayingCard';
import type { Pile } from '@/game';

interface FloorPileProps {
    pile: Pile;
    index: number;
    selectable?: boolean;
    selected?: boolean;
    onClick?: () => void;
}

export function FloorPile({ pile, selectable, selected, onClick }: FloorPileProps) {
    const classes = [
        'seep-pile',
        selectable && 'seep-pile--selectable',
        selected && 'seep-pile--selected',
        pile.fixed && 'seep-pile--fixed',
    ].filter(Boolean).join(' ');

    return (
        <div className={classes} onClick={selectable ? onClick : undefined}>
            <span className={`seep-pile__badge ${pile.fixed ? 'seep-pile__badge--fixed' : ''}`}>
                {pile.fixed ? `⚓ ${pile.value}` : `${pile.value}`}
            </span>
            <div className="seep-pile__cards">
                {pile.cards.map((card, i) => (
                    <PlayingCard key={i} card={card} small />
                ))}
            </div>
        </div>
    );
}
