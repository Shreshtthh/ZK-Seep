import { useState } from 'react';
import type { Card } from '@/game';

interface BidPanelProps {
    playerName: string;
    hand: Card[];
    onBid: (value: number) => void;
    disabled?: boolean;
    loading?: boolean;
}

const ALL_BID_VALUES = [9, 10, 11, 12, 13];

function valueLabel(v: number): string {
    if (v <= 10) return String(v);
    if (v === 11) return 'J';
    if (v === 12) return 'Q';
    return 'K';
}

function valueName(v: number): string {
    if (v <= 10) return String(v);
    if (v === 11) return 'Jack';
    if (v === 12) return 'Queen';
    return 'King';
}

export function BidPanel({ playerName, hand, onBid, disabled, loading }: BidPanelProps) {
    const [selected, setSelected] = useState<number | null>(null);

    // Only values the player actually holds
    const eligibleValues = ALL_BID_VALUES.filter(v =>
        hand.some(c => c.value === v)
    );

    const handleClick = (v: number) => {
        if (!eligibleValues.includes(v)) return;
        setSelected(v);
    };

    return (
        <div className="seep-bid-panel">
            <div className="seep-bid-panel__title">
                🎯 Place Your Bid
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '16px' }}>
                {playerName}, select a card value to bid (9–K). You must hold a card of this value.
            </p>
            <div className="seep-bid-values">
                {ALL_BID_VALUES.map((v) => {
                    const isEligible = eligibleValues.includes(v);
                    return (
                        <button
                            key={v}
                            className={[
                                'seep-bid-chip',
                                selected === v && 'seep-bid-chip--selected',
                                !isEligible && 'seep-bid-chip--disabled',
                            ].filter(Boolean).join(' ')}
                            onClick={() => handleClick(v)}
                            disabled={disabled || !isEligible}
                            title={isEligible ? `Bid ${valueLabel(v)}` : `You don't have a ${valueLabel(v)} in your hand`}
                        >
                            {valueLabel(v)}
                        </button>
                    );
                })}
            </div>
            {eligibleValues.length === 0 && (
                <p style={{ color: 'var(--accent-red, #ff6b6b)', fontSize: '0.75rem', marginTop: '8px' }}>
                    ⚠️ No eligible bid cards in hand — re-deal needed!
                </p>
            )}
            <button
                className="seep-btn seep-btn--gold"
                onClick={() => selected !== null && onBid(selected)}
                disabled={disabled || selected === null || loading}
                style={{ width: '100%' }}
            >
                {loading ? 'Submitting bid...' : `Bid ${selected !== null ? valueName(selected) : '—'}`}
            </button>
        </div>
    );
}
