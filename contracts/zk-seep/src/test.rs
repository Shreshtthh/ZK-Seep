#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Address, BytesN, Env,
};

// Inline mock GameHub for testing (matches the interface our contract expects)
mod mock_hub {
    use soroban_sdk::{contract, contractimpl, Address, Env};

    #[contract]
    pub struct MockGameHub;

    #[contractimpl]
    impl MockGameHub {
        pub fn start_game(
            _env: Env,
            _game_id: Address,
            _session_id: u32,
            _player1: Address,
            _player2: Address,
            _player1_points: i128,
            _player2_points: i128,
        ) {
            // No-op for testing
        }

        pub fn end_game(
            _env: Env,
            _session_id: u32,
            _player1_won: bool,
        ) {
            // No-op for testing
        }
    }
}

/// Helper: create a test environment and deploy the contract with mock dependencies
fn setup_test() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);

    // Register mock GameHub contract
    let game_hub = env.register(mock_hub::MockGameHub, ());

    // Verifier is just a mock address (we won't test ZK proofs in unit tests)
    let verifier = Address::generate(&env);

    // Deploy our contract
    let contract_id = env.register(
        ZkSeepContract,
        (&admin, &game_hub, &verifier),
    );

    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    (env, contract_id, player1, player2)
}

#[test]
fn test_start_game() {
    let (env, contract_id, player1, player2) = setup_test();
    let client = ZkSeepContractClient::new(&env, &contract_id);

    let result = client.start_game(&1u32, &player1, &player2, &100i128, &100i128);
    assert_eq!(result, ());

    let game = client.get_game(&1u32);
    assert_eq!(game.player1, player1);
    assert_eq!(game.player2, player2);
    assert_eq!(game.phase, GamePhase::HandCommit);
    assert_eq!(game.player1_score, 0);
    assert_eq!(game.player2_score, 0);
}

#[test]
fn test_commit_hand() {
    let (env, contract_id, player1, player2) = setup_test();
    let client = ZkSeepContractClient::new(&env, &contract_id);

    client.start_game(&1u32, &player1, &player2, &100i128, &100i128);

    let hash1 = BytesN::from_array(&env, &[1u8; 32]);
    let hash2 = BytesN::from_array(&env, &[2u8; 32]);

    client.commit_hand(&1u32, &player1, &hash1, &4u32);

    // After one commit, still in HandCommit phase
    let game = client.get_game(&1u32);
    assert_eq!(game.phase, GamePhase::HandCommit);
    assert_eq!(game.player1_cards_left, 4);

    client.commit_hand(&1u32, &player2, &hash2, &4u32);

    // After both commit, should be in Bidding phase
    let game = client.get_game(&1u32);
    assert_eq!(game.phase, GamePhase::Bidding);
    assert_eq!(game.player2_cards_left, 4);
}

#[test]
fn test_game_state_query() {
    let (env, contract_id, player1, player2) = setup_test();
    let client = ZkSeepContractClient::new(&env, &contract_id);

    client.start_game(&1u32, &player1, &player2, &100i128, &100i128);

    let game = client.get_game(&1u32);
    assert_eq!(game.phase, GamePhase::HandCommit);
    assert_eq!(game.bid_value, 0);
    assert_eq!(game.current_turn, 1);
    assert_eq!(game.move_count, 0);
    assert_eq!(game.winner, None);
}

#[test]
fn test_update_hand_hash() {
    let (env, contract_id, player1, player2) = setup_test();
    let client = ZkSeepContractClient::new(&env, &contract_id);

    client.start_game(&1u32, &player1, &player2, &100i128, &100i128);

    let hash1 = BytesN::from_array(&env, &[1u8; 32]);
    let hash2 = BytesN::from_array(&env, &[2u8; 32]);
    client.commit_hand(&1u32, &player1, &hash1, &4u32);
    client.commit_hand(&1u32, &player2, &hash2, &4u32);

    // Update hand after new deal
    let new_hash = BytesN::from_array(&env, &[3u8; 32]);
    client.update_hand(&1u32, &player1, &new_hash, &12u32);

    let game = client.get_game(&1u32);
    assert_eq!(game.player1_hand_hash, new_hash);
    assert_eq!(game.player1_cards_left, 12);
}
