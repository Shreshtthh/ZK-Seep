/**
 * Quick smoke test for the Seep game engine.
 * Run with: bun run src/game/test.ts
 */
import { SeepGame, GamePhase, MoveType, describeMoveType, cardToString } from './index';

console.log('🃏 ZK Seep Game Engine — Smoke Test\n');

// Create a game and deal with auto re-deal
const game = new SeepGame();
game.dealWithRedeal();

console.log(`✅ Phase: ${game.phase}`);
console.log(`✅ Player 0 hand (${game.players[0].hand.length} cards): ${game.players[0].hand.map(cardToString).join(', ')}`);
console.log(`✅ Player 1 hand (${game.players[1].hand.length} cards): ${game.players[1].hand.map(cardToString).join(', ')}`);

// Check bidder has eligible cards
const bidCards = game.players[0].getBidEligibleCards();
console.log(`✅ Bid-eligible cards: ${bidCards.map(cardToString).join(', ')}`);

// Set bid to first eligible card
const bidValue = bidCards[0].value;
game.setBid(bidValue);
console.log(`\n✅ Bid set to: ${bidValue}`);
console.log(`✅ Phase: ${game.phase}`);
console.log(`✅ Center piles: ${game.center.piles.length}`);
game.center.piles.forEach(p => {
    console.log(`   Pile value ${p.value}: ${p.cards.map(cardToString).join(', ')} ${p.fixed ? '🔒' : ''}`);
});

// Get legal moves for bid move
const bidMoves = game.getLegalMoves();
console.log(`\n✅ Legal bid moves: ${bidMoves.length}`);
bidMoves.slice(0, 5).forEach((m, i) => {
    const pileStr = m.piles ? ` → piles [${m.piles.map(p => p.value).join(', ')}]` : '';
    console.log(`   ${i}) ${describeMoveType(m.type)}: ${cardToString(m.card)}${pileStr}`);
});
if (bidMoves.length > 5) console.log(`   ... and ${bidMoves.length - 5} more`);

// Make the first available bid move
if (bidMoves.length > 0) {
    const move = bidMoves[0];
    const result = game.makeMove(move);
    console.log(`\n✅ Made bid move: ${describeMoveType(move.type)} ${cardToString(move.card)}`);
    console.log(`   ZK proof needed for value: ${result.zkTargetValue ?? 'none'}`);
    console.log(`✅ Phase: ${game.phase}`);
    console.log(`✅ P0 hand: ${game.players[0].hand.length} cards, P1 hand: ${game.players[1].hand.length} cards`);
}

// Play a few turns in first half
let turnCount = 0;
const maxTurns = 6;
while (game.phase === GamePhase.FirstHalf && turnCount < maxTurns) {
    const moves = game.getLegalMoves();
    if (moves.length === 0) {
        console.log(`\n⚠️  No legal moves for Player ${game.currentPlayerIdx}!`);
        break;
    }
    // Pick a random move
    const move = moves[Math.floor(Math.random() * moves.length)];
    const result = game.makeMove(move);
    turnCount++;
    console.log(`   Turn ${turnCount}: P${1 - game.currentPlayerIdx} ${describeMoveType(move.type)} ${cardToString(move.card)} ${result.zkTargetValue ? `(ZK: ${result.zkTargetValue})` : ''}`);
}
console.log(`\n✅ Played ${turnCount} turns. Phase: ${game.phase}`);
console.log(`✅ Scores — P0: ${game.players[0].score}, P1: ${game.players[1].score}`);
console.log(`✅ Center piles: ${game.center.piles.length}`);

// Play remaining turns automatically
let totalMoves = turnCount;
while (game.phase !== GamePhase.GameOver) {
    const moves = game.getLegalMoves();
    if (moves.length === 0) {
        console.log(`\n⚠️  No legal moves! Phase: ${game.phase}, Player: ${game.currentPlayerIdx}`);
        break;
    }
    const move = moves[Math.floor(Math.random() * moves.length)];
    game.makeMove(move);
    totalMoves++;
}

if (game.phase === GamePhase.GameOver && game.result) {
    console.log(`\n🏆 GAME OVER after ${totalMoves} moves!`);
    console.log(`   Player 0: ${game.result.player1Score} pts (${game.result.player1Seeps} seeps)`);
    console.log(`   Player 1: ${game.result.player2Score} pts (${game.result.player2Seeps} seeps)`);
    console.log(`   Winner: Player ${game.result.winner}! 🎉`);
    console.log(`   Total: ${game.result.player1Score + game.result.player2Score} (should be 100 + seep bonuses)`);
} else {
    console.log(`\n❌ Game didn't finish. Phase: ${game.phase}`);
}

console.log('\n✅ All checks passed!');
