interface ScorePanelProps {
    player1Label: string;
    player2Label: string;
    player1Score: number;
    player2Score: number;
    player1Seeps: number;
    player2Seeps: number;
    activePlayer: 1 | 2 | null;
    cardsLeft: [number, number];
}

export function ScorePanel({
    player1Label,
    player2Label,
    player1Score,
    player2Score,
    player1Seeps,
    player2Seeps,
    activePlayer,
    cardsLeft,
}: ScorePanelProps) {
    return (
        <div className="seep-scores">
            <div className={`seep-score-card ${activePlayer === 1 ? 'seep-score-card--active' : ''}`}>
                <div className="seep-score-card__label">{player1Label}</div>
                <div className="seep-score-card__value">{player1Score}</div>
                <div className="seep-score-card__sub">
                    {player1Seeps > 0 && `${player1Seeps} seep${player1Seeps > 1 ? 's' : ''} · `}
                    {cardsLeft[0]} cards
                </div>
            </div>
            <div className={`seep-score-card ${activePlayer === 2 ? 'seep-score-card--active' : ''}`}>
                <div className="seep-score-card__label">{player2Label}</div>
                <div className="seep-score-card__value">{player2Score}</div>
                <div className="seep-score-card__sub">
                    {player2Seeps > 0 && `${player2Seeps} seep${player2Seeps > 1 ? 's' : ''} · `}
                    {cardsLeft[1]} cards
                </div>
            </div>
        </div>
    );
}
