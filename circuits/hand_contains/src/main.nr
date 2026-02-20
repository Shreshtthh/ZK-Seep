use poseidon::poseidon2::Poseidon2;

// Prove that a player's hand contains a card of a specific value,
// without revealing the hand itself.
//
// This is the core ZK mechanic for Seep:
//   - When building/cementing a house of value X, the player must prove
//     they hold another card of value X in their hand.
//   - When bidding, the player must prove they hold a card >= 9.
//
// Inputs:
//   - hand (private): array of card values in the player's hand (1-13, 0 = empty slot)
//   - salt (private): random nonce to prevent hash preimage attacks
//   - hand_hash (public): Poseidon2 hash of (hand ++ salt), committed on-chain
//   - target_value (public): the card value the player claims to possess
//
// Constraints:
//   1. The hash of the hand + salt must match the committed hand_hash
//   2. At least one card in the hand must equal target_value
fn main(
    hand: [Field; 12],
    salt: Field,
    hand_hash: pub Field,
    target_value: pub Field,
) {
    // 1. Verify hand commitment: hash(hand[0..12], salt) == hand_hash
    // Build a 13-element array: 12 card values + 1 salt
    let mut preimage: [Field; 13] = [0; 13];
    for i in 0..12 {
        preimage[i] = hand[i];
    }
    preimage[12] = salt;
    let computed_hash = Poseidon2::hash(preimage, 13);
    assert(computed_hash == hand_hash, "Hand hash mismatch");

    // 2. Prove possession: at least one card matches target_value
    let mut found: bool = false;
    for i in 0..12 {
        if hand[i] == target_value {
            found = true;
        }
    }
    assert(found, "Target value not found in hand");
}

#[test]
fn test_valid_hand() {
    // Hand: [1, 5, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0]
    // Target: 9 (player claims to have a 9)
    let hand: [Field; 12] = [1, 5, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    let salt: Field = 42;

    // Compute hash
    let mut preimage: [Field; 13] = [0; 13];
    for i in 0..12 {
        preimage[i] = hand[i];
    }
    preimage[12] = salt;
    let hand_hash = Poseidon2::hash(preimage, 13);

    // This should pass
    main(hand, salt, hand_hash, 9);
}

#[test(should_fail_with = "Target value not found in hand")]
fn test_invalid_hand() {
    // Hand has no 9 but player claims to have one
    let hand: [Field; 12] = [1, 5, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    let salt: Field = 42;

    let mut preimage: [Field; 13] = [0; 13];
    for i in 0..12 {
        preimage[i] = hand[i];
    }
    preimage[12] = salt;
    let hand_hash = Poseidon2::hash(preimage, 13);

    // Should fail - no card of value 9 in hand
    main(hand, salt, hand_hash, 9);
}

#[test(should_fail_with = "Hand hash mismatch")]
fn test_wrong_hash() {
    // Correct hand but wrong hash (trying to cheat)
    let hand: [Field; 12] = [1, 5, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    let salt: Field = 42;
    let fake_hash: Field = 12345;

    // Should fail - hash does not match
    main(hand, salt, fake_hash, 9);
}
