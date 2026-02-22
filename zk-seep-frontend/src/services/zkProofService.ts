/**
 * ZK Proof Service — Browser-side Noir proof generation
 *
 * Uses @noir-lang/noir_js + @noir-lang/backend_barretenberg to generate
 * UltraHonk proofs for the hand_contains circuit.
 *
 * Architecture:
 *   1. poseidon2_hash circuit → computes Poseidon2(hand || salt) to get hand_hash
 *   2. hand_contains circuit → proves hand contains target_value using that hash
 *
 * Both circuits are loaded from /circuits/ (compiled ACIR JSON artifacts).
 */

// @ts-nocheck — Noir.js types may not fully align with our usage
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';

// Hash helper circuit (computes Poseidon2, no proof needed)
let hashNoir: Noir | null = null;

// Main proof circuit (hand_contains)
let proofNoir: Noir | null = null;
let proofBackend: UltraHonkBackend | null = null;

let initialized = false;

/**
 * Initialize the proof service by loading both compiled circuits.
 */
export async function initZkProofService(): Promise<void> {
    if (initialized) return;

    console.log('[zk] Loading circuits...');

    const [hashRes, proofRes] = await Promise.all([
        fetch('/circuits/poseidon2_hash.json'),
        fetch('/circuits/hand_contains.json'),
    ]);

    if (!hashRes.ok) throw new Error(`Failed to load hash circuit: ${hashRes.status}`);
    if (!proofRes.ok) throw new Error(`Failed to load proof circuit: ${proofRes.status}`);

    const [hashCircuit, proofCircuit] = await Promise.all([
        hashRes.json(),
        proofRes.json(),
    ]);

    hashNoir = new Noir(hashCircuit);
    proofNoir = new Noir(proofCircuit);
    proofBackend = new UltraHonkBackend(proofCircuit.bytecode);

    initialized = true;
    console.log('[zk] Circuits loaded ✅');
}

/** Pad hand to 12 card values (0 = empty slot). */
function padHand(hand: number[]): string[] {
    const padded = [...hand];
    while (padded.length < 12) padded.push(0);
    if (padded.length > 12) throw new Error('Hand must be at most 12 cards');
    return padded.map(v => v.toString());
}

/**
 * Compute Poseidon2(hand || salt) using the hash helper circuit.
 * Returns the hash as a hex string suitable for the hand_contains circuit.
 */
export async function computeHandHash(
    hand: number[],
    salt: bigint,
): Promise<string> {
    if (!hashNoir) throw new Error('[zk] Not initialized');

    const paddedHand = padHand(hand);

    const { returnValue } = await hashNoir.execute({
        hand: paddedHand,
        salt: salt.toString(),
    });

    // returnValue is the Poseidon2 hash as a Field (hex string)
    const hashStr = typeof returnValue === 'string' ? returnValue : String(returnValue);
    console.log('[zk] Poseidon2 hash:', hashStr);
    return hashStr;
}

/**
 * Generate a ZK proof that the hand contains target_value.
 *
 * Internally:
 *   1. Computes hand_hash via poseidon2_hash circuit
 *   2. Generates UltraHonk proof via hand_contains circuit
 *
 * @param hand - Array of card values (1-13)
 * @param salt - Random bigint nonce for hash commitment
 * @param targetValue - The card value to prove possession of
 * @returns proof bytes as Uint8Array
 */
export async function generateProof(
    hand: number[],
    salt: bigint,
    targetValue: number,
): Promise<Uint8Array> {
    if (!proofNoir || !proofBackend) {
        throw new Error('[zk] Not initialized. Call initZkProofService() first.');
    }

    console.log('[zk] Generating proof for target_value:', targetValue);

    // Step 1: Compute hand hash
    const handHash = await computeHandHash(hand, salt);

    // Step 2: Generate witness for hand_contains
    const paddedHand = padHand(hand);
    const inputs = {
        hand: paddedHand,
        salt: salt.toString(),
        hand_hash: handHash,
        target_value: targetValue.toString(),
    };

    console.log('[zk] Generating witness...');
    const { witness } = await proofNoir.execute(inputs);

    console.log('[zk] Generating UltraHonk proof...');
    const proof = await proofBackend.generateProof(witness);

    console.log('[zk] Proof generated ✅', proof.proof.length, 'bytes');
    return proof.proof;
}

/**
 * Cleanup WASM resources.
 */
export async function destroyZkProofService(): Promise<void> {
    if (proofBackend) {
        await proofBackend.destroy();
        proofBackend = null;
    }
    hashNoir = null;
    proofNoir = null;
    initialized = false;
}
