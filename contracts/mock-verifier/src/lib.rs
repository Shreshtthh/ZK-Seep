#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, Bytes, Env};

/// Mock ZK Verifier — always returns Ok(()).
///
/// Used on testnet where UltraHonk verification exceeds the CPU budget (400M instructions).
/// The real verifier (indextree/ultrahonk_soroban_contract) works on localnet with --limits unlimited.
///
/// Interface matches indextree/ultrahonk_soroban_contract:
///   verify_proof(public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), Error>
#[contract]
pub struct MockVerifier;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    VerificationFailed = 1,
}

#[contractimpl]
impl MockVerifier {
    /// Always returns Ok(()) — real verification done on localnet.
    pub fn verify_proof(
        _env: Env,
        _public_inputs: Bytes,
        _proof_bytes: Bytes,
    ) -> Result<(), Error> {
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_verify_always_ok() {
        let env = Env::default();
        let contract_id = env.register_contract(None, MockVerifier);
        let client = MockVerifierClient::new(&env, &contract_id);

        let empty_inputs = Bytes::new(&env);
        let empty_proof = Bytes::new(&env);
        assert_eq!(client.verify_proof(&empty_inputs, &empty_proof), ());
    }
}
