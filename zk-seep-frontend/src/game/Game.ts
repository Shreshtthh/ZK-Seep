import type { Card } from './Card';
import { Pile, createPile } from './Pile';
import { Deck } from './Deck';
import { Center } from './Center';
import { Player } from './Player';
import { Move, MoveType, moveRequiresZkProof } from './Move';

/**
 * Game phases.
 */
export enum GamePhase {
    WaitingForPlayers = 'waiting',
    SeedCommit = 'seed_commit',     // Both players submit random seeds
    SeedReveal = 'seed_reveal',     // Both players reveal seeds
    Dealing = 'dealing',            // Cards being dealt
    Bidding = 'bidding',            // Bidder chooses bid value
    BidMove = 'bid_move',           // Bidder makes first move (must relate to bid)
    DealRemaining = 'deal_remaining', // 8 more cards to each player
    FirstHalf = 'first_half',       // Alternating play until hands empty
    SecondDeal = 'second_deal',     // 12 cards to each player
    SecondHalf = 'second_half',     // Alternating play until hands empty
    GameOver = 'game_over',
}

/**
 * The result of a completed game.
 */
export interface GameResult {
    winner: number;          // Player ID (0 or 1)
    player1Score: number;
    player2Score: number;
    player1Seeps: number;
    player2Seeps: number;
}

/**
 * Seep Game orchestrator.
 * Manages the full game lifecycle: dealing, bidding, play, scoring.
 *
 * Ported from Seep_AI Game.py — restructured for 2-player PvP (no AI).
 *
 * Dealing flow (from Game.py):
 *   1. 4 cards to each player (alternate)
 *   2. Check bidder has card >= 9, else re-deal
 *   3. Bidder picks bid value
 *   4. 4 cards to center (floor, face-up)
 *   5. Bidder makes first move (must relate to bid)
 *   6. 8 more cards to each player
 *   7. Alternating play until hands empty (first half)
 *   8. 12 more cards to each player
 *   9. Alternating play until hands empty (second half)
 *   10. Last player to pick up gets remaining floor cards
 */
export class SeepGame {
    deck: Deck;
    center: Center;
    players: [Player, Player];
    phase: GamePhase;
    currentPlayerIdx: number;   // 0 or 1, whose turn it is
    bidValue: number;           // The bid value (9-13)
    bidderIdx: number;          // Who bids (always player 0 for now)
    result: GameResult | null = null;

    // Seed commitment for deterministic dealing
    seeds: [number | null, number | null] = [null, null];

    constructor() {
        this.deck = new Deck();
        this.center = new Center();
        this.players = [new Player(0), new Player(1)];
        this.phase = GamePhase.WaitingForPlayers;
        this.currentPlayerIdx = 0;
        this.bidValue = 0;
        this.bidderIdx = 0; // Player 0 always bids in 2-player
    }

    /** Get the current player. */
    get currentPlayer(): Player {
        return this.players[this.currentPlayerIdx];
    }

    /** Get the opponent of the current player. */
    get opponent(): Player {
        return this.players[1 - this.currentPlayerIdx];
    }

    /**
     * Initialize the deck with a combined seed and deal initial cards.
     * Call this after both seeds are submitted.
     */
    initializeWithSeed(seed1: number, seed2: number): void {
        this.seeds = [seed1, seed2];

        // Combined seed = xor of both seeds
        const combinedSeed = seed1 ^ seed2;

        this.deck = new Deck();
        this.deck.shuffleWithSeed(combinedSeed);

        this.dealInitialCards();
    }

    /**
     * Initialize with a random deck (for local testing).
     */
    initializeRandom(): void {
        this.deck = new Deck();
        // shuffle is called in Deck constructor
        this.dealInitialCards();
    }

    /**
     * Deal initial 4 cards to each player.
     * Checks if bidding player has card >= 9.
     * Returns false if re-deal is needed.
     */
    private dealInitialCards(): boolean {
        // Deal 4 cards alternating (like the Python code)
        for (let i = 0; i < 4; i++) {
            this.players[0].addCardsToHand([this.deck.dealCard()]);
            this.players[1].addCardsToHand([this.deck.dealCard()]);
        }

        // Check bidder has eligible card
        if (!this.players[this.bidderIdx].hasBidEligibleCard()) {
            return false; // Need re-deal
        }

        this.phase = GamePhase.Bidding;
        return true;
    }

    /**
     * Deal initial cards, re-dealing until bidder has a card >= 9.
     * For local/testing use.
     */
    dealWithRedeal(): void {
        let success = false;
        while (!success) {
            this.deck = new Deck();
            this.players = [new Player(0), new Player(1)];
            this.center = new Center();
            success = this.dealInitialCards();
        }
    }

    /**
     * Bidder selects a bid value.
     * Must be the value of a card in their hand with value >= 9.
     */
    setBid(bidValue: number): void {
        if (this.phase !== GamePhase.Bidding) {
            throw new Error(`Cannot bid in phase: ${this.phase}`);
        }
        if (bidValue < 9 || bidValue > 13) {
            throw new Error(`Bid must be 9-13, got ${bidValue}`);
        }

        const bidder = this.players[this.bidderIdx];
        if (!bidder.hand.some(c => c.value === bidValue)) {
            throw new Error(`Bidder does not hold a card of value ${bidValue}`);
        }

        this.bidValue = bidValue;

        // Deal 4 cards to center (floor)
        for (let i = 0; i < 4; i++) {
            const card = this.deck.dealCard();
            this.center.addNewPile(createPile(card.value, [card]), true);
        }

        this.phase = GamePhase.BidMove;
        this.currentPlayerIdx = this.bidderIdx;
    }

    /**
     * Make a move. Validates and applies the move, advances the game state.
     *
     * @returns The ZK target value if a ZK proof is needed, or null.
     */
    makeMove(move: Move): { zkTargetValue: number | null } {
        const player = this.currentPlayer;
        let zkTargetValue: number | null = null;

        // Determine ZK requirement
        if (moveRequiresZkProof(move.type)) {
            if (move.type === MoveType.Build || move.type === MoveType.MergeFix || move.type === MoveType.AddToFixed) {
                // House value = card + piles
                zkTargetValue = move.card.value + (move.piles?.reduce((s: number, p: { value: number }) => s + p.value, 0) ?? 0);
            } else if (move.type === MoveType.Cement || move.type === MoveType.DirectFix) {
                zkTargetValue = move.card.value;
            }
        }

        // Execute the move (bid-move seep is worth the bid value)
        const seepValue = this.phase === GamePhase.BidMove ? this.bidValue : 50;
        player.doMove(move, this.center, false, seepValue);

        // Advance game state
        this.advanceState();

        return { zkTargetValue };
    }

    /**
     * Get all legal moves for the current player.
     */
    getLegalMoves(): Move[] {
        const isBidMove = this.phase === GamePhase.BidMove;
        return this.currentPlayer.possibleMoves(this.center, isBidMove, this.bidValue);
    }

    /**
     * Advance the game state after a move.
     */
    private advanceState(): void {
        switch (this.phase) {
            case GamePhase.BidMove:
                // After bid move, deal 8 more to each player
                for (let i = 0; i < 8; i++) {
                    this.players[0].addCardsToHand([this.deck.dealCard()]);
                    this.players[1].addCardsToHand([this.deck.dealCard()]);
                }
                this.phase = GamePhase.FirstHalf;
                // Next turn goes to opponent
                this.currentPlayerIdx = 1 - this.bidderIdx;
                break;

            case GamePhase.FirstHalf:
                // Switch turns
                this.currentPlayerIdx = 1 - this.currentPlayerIdx;

                // Check if first half is done (both hands empty)
                if (this.players[0].hand.length === 0 && this.players[1].hand.length === 0) {
                    // Deal second half: 12 cards to each
                    for (let i = 0; i < 12; i++) {
                        this.players[0].addCardsToHand([this.deck.dealCard()]);
                        this.players[1].addCardsToHand([this.deck.dealCard()]);
                    }
                    this.phase = GamePhase.SecondHalf;
                }
                break;

            case GamePhase.SecondHalf:
                // Switch turns
                this.currentPlayerIdx = 1 - this.currentPlayerIdx;

                // Check if game is over (both hands empty)
                if (this.players[0].hand.length === 0 && this.players[1].hand.length === 0) {
                    this.endGame();
                }
                break;

            default:
                break;
        }
    }

    /**
     * End the game, calculate final scores.
     */
    private endGame(): void {
        // Last player to pick up gets remaining floor cards
        if (this.center.piles.length > 0) {
            const lastPickUpPlayer = this.center.lastPickUp >= 0
                ? this.players[this.center.lastPickUp]
                : this.players[0]; // Default to player 0

            const remainingCards = this.center.finalCleanUp();
            lastPickUpPlayer.capturedCards.push(...remainingCards);
        }

        // Calculate final scores
        const p1Score = this.players[0].calculateScore();
        const p2Score = this.players[1].calculateScore();

        this.result = {
            winner: p1Score >= p2Score ? 0 : 1,
            player1Score: p1Score,
            player2Score: p2Score,
            player1Seeps: this.players[0].seeps,
            player2Seeps: this.players[1].seeps,
        };

        this.phase = GamePhase.GameOver;
    }

    /**
     * Get a serializable snapshot of the game state.
     * Used for syncing with the blockchain / UI.
     */
    getState() {
        return {
            phase: this.phase,
            currentPlayerIdx: this.currentPlayerIdx,
            bidValue: this.bidValue,
            bidderIdx: this.bidderIdx,
            centerPiles: this.center.piles.map(p => ({
                value: p.value,
                cards: p.cards,
                fixed: p.fixed,
                score: p.score,
            })),
            player1HandSize: this.players[0].hand.length,
            player2HandSize: this.players[1].hand.length,
            player1Score: this.players[0].score,
            player2Score: this.players[1].score,
            player1Seeps: this.players[0].seeps,
            player2Seeps: this.players[1].seeps,
            result: this.result,
        };
    }
}
