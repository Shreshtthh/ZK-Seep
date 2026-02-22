use poseidon::poseidon2::Poseidon2;

// Compute Poseidon2 hash of a 12-card hand + salt.
// This helper circuit is used by the browser to compute hand_hash
// before generating hand_contains proofs.
//
// Inputs:
//   - hand (private): array of 12 card values (1-13, 0 = empty)
//   - salt (private): random nonce
//
// Output:
//   - The Poseidon2 hash (returned as a public output)
fn main(hand: [Field; 12], salt: Field) -> pub Field {
    let mut preimage: [Field; 13] = [0; 13];
    for i in 0..12 {
        preimage[i] = hand[i];
    }
    preimage[12] = salt;
    Poseidon2::hash(preimage, 13)
}

#[test]
fn test_hash_matches_hand_contains() {
    // Same test vector as hand_contains circuit
    let hand: [Field; 12] = [1, 5, 9, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    let salt: Field = 42;
    let hash = main(hand, salt);

    // The hash should match Prover.toml from hand_contains:
    // 0x095340c8549c3f7f685dc4a421a1c40534fd8f9481a39ff76cd49e077fcee35b
    println(hash);
}
