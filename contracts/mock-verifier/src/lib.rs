#![no_std]

use soroban_sdk::{contract, contractimpl, Bytes, Env};

/// Mock ZK Verifier — always returns true.
///
/// Used on testnet where UltraHonk verification exceeds the CPU budget (400M instructions).
/// The real verifier (indextree/ultrahonk_soroban_contract) works on localnet with --limits unlimited.
///
/// Interface matches indextree/ultrahonk_soroban_contract:
///   verify_proof(public_inputs: Bytes, proof_bytes: Bytes) -> bool
#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    /// Always returns true — real verification done on localnet.
    pub fn verify_proof(
        _env: Env,
        _public_inputs: Bytes,
        _proof_bytes: Bytes,
    ) -> bool {
        true
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_verify_always_true() {
        let env = Env::default();
        let contract_id = env.register_contract(None, MockVerifier);
        let client = MockVerifierClient::new(&env, &contract_id);

        let empty_inputs = Bytes::new(&env);
        let empty_proof = Bytes::new(&env);
        assert!(client.verify_proof(&empty_inputs, &empty_proof));
    }
}
