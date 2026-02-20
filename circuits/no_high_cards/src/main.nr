use poseidon::poseidon2::Poseidon2;

// Prove that ALL cards in the player's initial 4-card hand are below value 9,
// justifying a re-deal request.
//
// In Seep, the bidder must hold at least one card with value >= 9 (9, 10, J, Q, K).
// If they don't, they can request a re-deal. This circuit proves that claim
// without revealing the actual hand.
//
// Inputs:
//   - hand (private): array of 4 card values (1-13)
//   - salt (private): random nonce
//   - hand_hash (public): Poseidon2 hash of (hand ++ salt), committed on-chain
//
// Constraints:
//   1. The hash of the hand + salt must match the committed hand_hash
//   2. Every card value must be strictly less than 9
fn main(
    hand: [Field; 4],
    salt: Field,
    hand_hash: pub Field,
) {
    // 1. Verify hand commitment
    let mut preimage: [Field; 5] = [0; 5];
    for i in 0..4 {
        preimage[i] = hand[i];
    }
    preimage[4] = salt;
    let computed_hash = Poseidon2::hash(preimage, 5);
    assert(computed_hash == hand_hash, "Hand hash mismatch");

    // 2. Prove all cards are below 9
    // Card values are 1-13, we need each < 9
    for i in 0..4 {
        let card_val = hand[i] as u8;
        assert(card_val >= 1, "Card value must be at least 1");
        assert(card_val < 9, "Card value must be less than 9 for re-deal");
    }
}

#[test]
fn test_valid_low_hand() {
    // Hand: [1, 3, 5, 8] - all below 9
    let hand: [Field; 4] = [1, 3, 5, 8];
    let salt: Field = 99;

    let mut preimage: [Field; 5] = [0; 5];
    for i in 0..4 {
        preimage[i] = hand[i];
    }
    preimage[4] = salt;
    let hand_hash = Poseidon2::hash(preimage, 5);

    // This should pass
    main(hand, salt, hand_hash);
}

#[test(should_fail_with = "Card value must be less than 9 for re-deal")]
fn test_has_high_card() {
    // Hand: [1, 3, 9, 8] - has a 9, should fail
    let hand: [Field; 4] = [1, 3, 9, 8];
    let salt: Field = 99;

    let mut preimage: [Field; 5] = [0; 5];
    for i in 0..4 {
        preimage[i] = hand[i];
    }
    preimage[4] = salt;
    let hand_hash = Poseidon2::hash(preimage, 5);

    // Should fail - hand contains a 9
    main(hand, salt, hand_hash);
}

#[test(should_fail_with = "Hand hash mismatch")]
fn test_wrong_hash_redeal() {
    let hand: [Field; 4] = [1, 3, 5, 8];
    let salt: Field = 99;
    let fake_hash: Field = 54321;

    // Should fail - hash does not match
    main(hand, salt, fake_hash);
}
