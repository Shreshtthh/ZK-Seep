interface GameOverPanelProps {
    winnerLabel: string;
    loserLabel: string;
    winnerScore: number;
    loserScore: number;
    winnerSeeps: number;
    isCurrentPlayerWinner: boolean;
    onNewGame?: () => void;
}

export function GameOverPanel({
    winnerLabel,
    loserLabel,
    winnerScore,
    loserScore,
    winnerSeeps,
    isCurrentPlayerWinner,
    onNewGame,
}: GameOverPanelProps) {
    return (
        <div className="seep-gameover">
            <div className="seep-gameover__trophy">
                {isCurrentPlayerWinner ? '🏆' : '🤝'}
            </div>
            <div className="seep-gameover__title">
                {isCurrentPlayerWinner ? 'Victory!' : 'Game Over'}
            </div>
            <div className="seep-gameover__subtitle">
                {isCurrentPlayerWinner
                    ? 'Congratulations, you won the match!'
                    : `${winnerLabel} wins the match.`}
            </div>
            <div className="seep-gameover__scores">
                <div className="seep-score-card seep-score-card--active">
                    <div className="seep-score-card__label">🏆 {winnerLabel}</div>
                    <div className="seep-score-card__value">{winnerScore}</div>
                    <div className="seep-score-card__sub">
                        {winnerSeeps > 0 && `${winnerSeeps} seep${winnerSeeps > 1 ? 's' : ''}`}
                    </div>
                </div>
                <div className="seep-score-card">
                    <div className="seep-score-card__label">{loserLabel}</div>
                    <div className="seep-score-card__value">{loserScore}</div>
                </div>
            </div>
            {onNewGame && (
                <button className="seep-btn seep-btn--gold" onClick={onNewGame} style={{ width: '100%' }}>
                    Play Again
                </button>
            )}
        </div>
    );
}
