#![no_std]

//! # ZK Seep Card Game Contract
//!
//! A 2-player Seep card game on Stellar with ZK proof enforcement.
//! Players prove they hold specific cards (for house building/cementing)
//! without revealing their hand, using Noir/Ultrahonk ZK proofs.
//!
//! **Game Hub Integration:**
//! This game is Game Hub-aware. Games are started and ended through the
//! Game Hub contract for points tracking.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype,
    vec, Address, Bytes, BytesN, Env, IntoVal, Vec,
};

// ============================================================================
// External Contract Interfaces
// ============================================================================

/// GameHub contract interface for game lifecycle management
#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

/// Ultrahonk ZK verifier contract interface (indextree/ultrahonk_soroban_contract)
/// VK is baked into the verifier at deploy time; we only send proof + public inputs.
#[contractclient(name = "VerifierClient")]
pub trait ZkVerifier {
    fn verify_proof(env: Env, public_inputs: Bytes, proof_bytes: Bytes);
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    NotPlayer = 2,
    NotYourTurn = 3,
    InvalidPhase = 4,
    GameAlreadyEnded = 5,
    InvalidBid = 6,
    InvalidMove = 7,
    ProofRequired = 8,
    ProofVerificationFailed = 9,
    HandAlreadyCommitted = 10,
    HandNotCommitted = 11,
    InvalidMoveType = 12,
}

// ============================================================================
// Data Types
// ============================================================================

/// Game phases matching the TypeScript engine
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GamePhase {
    WaitingForPlayers = 0,
    HandCommit = 1,
    Bidding = 2,
    BidMove = 3,
    FirstHalf = 4,
    SecondHalf = 5,
    GameOver = 6,
}

/// A playing card
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Card {
    pub suit: u32,  // 0-3 (Spades, Hearts, Clubs, Diamonds)
    pub value: u32, // 1-13 (A=1, J=11, Q=12, K=13)
}

/// A pile on the floor
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pile {
    pub value: u32,
    pub card_count: u32, // Track count instead of full card list (saves storage)
    pub fixed: bool,
}

/// Move types (matching TypeScript MoveType enum)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MoveType {
    Throw = 1,
    Build = 2,
    Cement = 3,
    MergeFix = 4,
    AddToFixed = 5,
    DirectFix = 6,
    PickUp = 7,
}

/// The full game state stored on-chain
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeepGame {
    pub player1: Address,
    pub player2: Address,
    pub player1_points: i128,
    pub player2_points: i128,
    pub phase: GamePhase,
    pub current_turn: u32,         // 1 or 2
    pub bid_value: u32,
    pub bidder: u32,               // 1 = player1, 2 = player2
    pub player1_hand_hash: BytesN<32>,
    pub player2_hand_hash: BytesN<32>,
    pub player1_score: u32,
    pub player2_score: u32,
    pub player1_seeps: u32,
    pub player2_seeps: u32,
    pub player1_cards_left: u32,
    pub player2_cards_left: u32,
    pub center_piles: Vec<Pile>,
    pub move_count: u32,
    pub last_pickup_player: u32,   // 0 = none, 1 or 2
    pub deal_phase: u32,           // 1 = first deal, 2 = second deal done
    pub winner: Option<Address>,
}

/// Storage keys
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    GameHubAddress,
    VerifierAddress,
    Admin,
}

// ============================================================================
// Constants
// ============================================================================

/// TTL for game storage (30 days in ledgers, ~5 seconds per ledger)
const GAME_TTL_LEDGERS: u32 = 518_400;

/// Empty hand hash (32 zero bytes) used as default
fn empty_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

// ============================================================================
// Contract
// ============================================================================

#[contract]
pub struct ZkSeepContract;

#[contractimpl]
impl ZkSeepContract {
    /// Initialize the contract with admin, GameHub, and verifier addresses
    pub fn __constructor(env: Env, admin: Address, game_hub: Address, verifier: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &game_hub);
        env.storage()
            .instance()
            .set(&DataKey::VerifierAddress, &verifier);
    }

    // ========================================================================
    // Game Lifecycle
    // ========================================================================

    /// Start a new Seep game between two players.
    /// Creates a session in GameHub and initializes game state.
    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    ) -> Result<(), Error> {
        // Prevent self-play
        if player1 == player2 {
            panic!("Cannot play against yourself");
        }

        // Require auth from both players
        player1.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player1_points.into_val(&env),
        ]);
        player2.require_auth_for_args(vec![
            &env,
            session_id.into_val(&env),
            player2_points.into_val(&env),
        ]);

        // Register with GameHub
        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub not set");
        let game_hub = GameHubClient::new(&env, &game_hub_addr);
        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &player2,
            &player1_points,
            &player2_points,
        );

        // Initialize game state
        let game = SeepGame {
            player1: player1.clone(),
            player2: player2.clone(),
            player1_points,
            player2_points,
            phase: GamePhase::HandCommit,
            current_turn: 1,
            bid_value: 0,
            bidder: 1,
            player1_hand_hash: empty_hash(&env),
            player2_hand_hash: empty_hash(&env),
            player1_score: 0,
            player2_score: 0,
            player1_seeps: 0,
            player2_seeps: 0,
            player1_cards_left: 0,
            player2_cards_left: 0,
            center_piles: Vec::new(&env),
            move_count: 0,
            last_pickup_player: 0,
            deal_phase: 0,
            winner: None,
        };

        let key = DataKey::Game(session_id);
        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(())
    }

    /// Commit the hash of a player's hand.
    /// Both players must commit before bidding can begin.
    pub fn commit_hand(
        env: Env,
        session_id: u32,
        player: Address,
        hand_hash: BytesN<32>,
        cards_count: u32,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: SeepGame = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::HandCommit {
            return Err(Error::InvalidPhase);
        }

        if player == game.player1 {
            if game.player1_hand_hash != empty_hash(&env) {
                return Err(Error::HandAlreadyCommitted);
            }
            game.player1_hand_hash = hand_hash;
            game.player1_cards_left = cards_count;
        } else if player == game.player2 {
            if game.player2_hand_hash != empty_hash(&env) {
                return Err(Error::HandAlreadyCommitted);
            }
            game.player2_hand_hash = hand_hash;
            game.player2_cards_left = cards_count;
        } else {
            return Err(Error::NotPlayer);
        }

        // If both committed, advance to bidding
        if game.player1_hand_hash != empty_hash(&env)
            && game.player2_hand_hash != empty_hash(&env)
        {
            game.phase = GamePhase::Bidding;
        }

        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    /// Submit a bid value. Only the bidder (player 1) can bid.
    /// Requires ZK proof that the bidder holds a card of the bid value.
    pub fn make_bid(
        env: Env,
        session_id: u32,
        player: Address,
        bid_value: u32,
        proof: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: SeepGame = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::Bidding {
            return Err(Error::InvalidPhase);
        }

        // Only the bidder can bid
        let bidder_addr = if game.bidder == 1 {
            &game.player1
        } else {
            &game.player2
        };
        if player != *bidder_addr {
            return Err(Error::NotYourTurn);
        }

        // Bid must be 9-13
        if bid_value < 9 || bid_value > 13 {
            return Err(Error::InvalidBid);
        }

        // Verify ZK proof: player holds a card of bid_value
        let hand_hash = if game.bidder == 1 {
            &game.player1_hand_hash
        } else {
            &game.player2_hand_hash
        };
        Self::verify_hand_contains_proof(&env, &proof, hand_hash, bid_value)?;

        game.bid_value = bid_value;
        game.phase = GamePhase::BidMove;
        game.current_turn = game.bidder;

        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    /// Submit a move. The core game action.
    ///
    /// For move types 2-6 (house building/cementing), a ZK proof is required
    /// proving the player holds a card matching the target house value.
    ///
    /// The game server validates the full move logic off-chain;
    /// on-chain we verify the ZK constraint and update scores/phase.
    pub fn make_move(
        env: Env,
        session_id: u32,
        player: Address,
        move_type: u32,
        _card_value: u32,
        target_value: u32,  // House value for ZK proof (0 if not needed)
        score_delta: u32,   // Score gained from this move
        is_seep: bool,      // True if this move clears the table
        proof: Bytes,       // ZK proof (empty bytes if not needed)
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: SeepGame = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        // Check phase
        let valid_phase = game.phase == GamePhase::BidMove
            || game.phase == GamePhase::FirstHalf
            || game.phase == GamePhase::SecondHalf;
        if !valid_phase {
            return Err(Error::InvalidPhase);
        }

        if game.winner.is_some() {
            return Err(Error::GameAlreadyEnded);
        }

        // Check this player is in the game
        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        if !is_p1 && !is_p2 {
            return Err(Error::NotPlayer);
        }
        let player_num = if is_p1 { 1u32 } else { 2u32 };
        // Note: turn order is NOT enforced on-chain. The frontend engine handles
        // turn sequencing; PeerJS delivers moves faster than on-chain confirmation,
        // so strict turn checks cause race-condition failures. The ZK proofs are
        // the real on-chain security enforcement.

        // Validate move type range
        if move_type < 1 || move_type > 7 {
            return Err(Error::InvalidMoveType);
        }

        // ZK proof required for house moves (types 2-6)
        let needs_proof = move_type >= 2 && move_type <= 6;
        if needs_proof {
            if proof.len() == 0 {
                return Err(Error::ProofRequired);
            }
            let hand_hash = if is_p1 {
                &game.player1_hand_hash
            } else {
                &game.player2_hand_hash
            };
            Self::verify_hand_contains_proof(&env, &proof, hand_hash, target_value)?;
        }

        // Update game state
        game.move_count += 1;

        // Decrement cards in hand
        if is_p1 {
            if game.player1_cards_left > 0 {
                game.player1_cards_left -= 1;
            }
            game.player1_score += score_delta;
            if is_seep {
                game.player1_seeps += 1;
            }
        } else {
            if game.player2_cards_left > 0 {
                game.player2_cards_left -= 1;
            }
            game.player2_score += score_delta;
            if is_seep {
                game.player2_seeps += 1;
            }
        }

        // Track last pickup
        if move_type == 7 {
            game.last_pickup_player = player_num;
        }

        // Advance phase
        match game.phase {
            GamePhase::BidMove => {
                // After bid move, transition to first half
                game.phase = GamePhase::FirstHalf;
                game.current_turn = if game.bidder == 1 { 2 } else { 1 };
            }
            GamePhase::FirstHalf | GamePhase::SecondHalf => {
                // Switch turns — the frontend engine handles dealing and game-over
                // detection. The contract stays in a valid play phase until
                // end_game is explicitly called.
                game.current_turn = if game.current_turn == 1 { 2 } else { 1 };
            }
            _ => {}
        }

        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    /// Update hand hash after a new deal (e.g., after bid move or between halves).
    /// Called by the game server to update the committed hand hash.
    pub fn update_hand(
        env: Env,
        session_id: u32,
        player: Address,
        new_hand_hash: BytesN<32>,
        new_cards_count: u32,
    ) -> Result<(), Error> {
        player.require_auth();

        let key = DataKey::Game(session_id);
        let mut game: SeepGame = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if player == game.player1 {
            game.player1_hand_hash = new_hand_hash;
            game.player1_cards_left = new_cards_count;
        } else if player == game.player2 {
            game.player2_hand_hash = new_hand_hash;
            game.player2_cards_left = new_cards_count;
        } else {
            return Err(Error::NotPlayer);
        }

        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
        Ok(())
    }

    /// End the game and submit result to GameHub.
    /// Can be called when the game phase is GameOver.
    pub fn end_game(env: Env, session_id: u32) -> Result<Option<Address>, Error> {
        let key = DataKey::Game(session_id);
        let mut game: SeepGame = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.phase != GamePhase::GameOver {
            return Err(Error::InvalidPhase);
        }

        // Already ended?
        if game.winner.is_some() {
            return Ok(game.winner.clone());
        }

        // Calculate total scores (base + seep bonus)
        let p1_total = game.player1_score + (game.player1_seeps * 50);
        let p2_total = game.player2_score + (game.player2_seeps * 50);

        let player1_won = p1_total >= p2_total;
        let winner = if player1_won {
            game.player1.clone()
        } else {
            game.player2.clone()
        };

        // Notify GameHub BEFORE finalizing winner state (per AGENTS.md rule)
        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub not set");
        let game_hub = GameHubClient::new(&env, &game_hub_addr);
        game_hub.end_game(&session_id, &player1_won);

        // Now finalize winner state
        game.winner = Some(winner.clone());
        env.storage().temporary().set(&key, &game);
        env.storage()
            .temporary()
            .extend_ttl(&key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);

        Ok(Some(winner))
    }

    /// Get game state (read-only)
    pub fn get_game(env: Env, session_id: u32) -> Result<SeepGame, Error> {
        let key = DataKey::Game(session_id);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    // ========================================================================
    // ZK Proof Verification (internal)
    // ========================================================================

    /// Verify a hand_contains ZK proof.
    /// Calls the external indextree/ultrahonk_soroban_contract verifier.
    /// Public inputs are concatenated into a single Bytes blob (32 bytes per field).
    fn verify_hand_contains_proof(
        env: &Env,
        proof: &Bytes,
        hand_hash: &BytesN<32>,
        target_value: u32,
    ) -> Result<(), Error> {
        let verifier_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::VerifierAddress)
            .expect("Verifier not set");

        let verifier = VerifierClient::new(env, &verifier_addr);

        // Public inputs for the circuit (concatenated, 32 bytes each, big-endian):
        // 1. hand_hash (Field)  — 32 bytes
        // 2. target_value (Field) — 32 bytes (u32 right-padded in big-endian)
        let mut public_inputs = Bytes::new(env);
        public_inputs.extend_from_slice(hand_hash.to_array().as_slice());

        let mut target_bytes = [0u8; 32];
        target_bytes[28..32].copy_from_slice(&target_value.to_be_bytes());
        public_inputs.extend_from_slice(&target_bytes);

        verifier.verify_proof(&public_inputs, proof);

        Ok(())
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn get_hub(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub not set")
    }

    pub fn set_hub(env: Env, new_hub: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &new_hub);
    }

    pub fn set_verifier(env: Env, new_verifier: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::VerifierAddress, &new_verifier);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
