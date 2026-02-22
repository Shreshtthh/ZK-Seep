/**
 * Hook that wraps ZkSeepService contract calls for in-game use.
 *
 * All transactions use the session wallet signer so they execute
 * silently (no Freighter popup per move).
 *
 * On localnet with the real verifier, real proof bytes are expected.
 * On testnet with the mock verifier, empty proof bytes are accepted.
 *
 * Transactions are serialized via an internal queue to avoid txBadSeq
 * errors caused by rapid back-to-back calls hitting stale RPC state.
 */
import { useCallback, useRef } from 'react';
import { ZkSeepService } from '../games/zk-seep/zkSeepService';
import { useWallet } from './useWallet';
import { ZK_SEEP_CONTRACT, RPC_URL } from '@/utils/constants';
import { Buffer } from 'buffer';

// On testnet, the contract checks proof.len() == 0 → Error(Contract, #8) ProofRequired.
// A 1-byte dummy proof passes the length check and is accepted by the mock verifier.
const EMPTY_PROOF = Buffer.alloc(1);
const isLocalnet = RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1');

// Minimum delay (ms) between consecutive transactions to let the RPC index
const TX_BREATHING_DELAY = 1500;

export function useOnChain() {
    const { getSessionSigner, getSessionPublicKey } = useWallet();
    const serviceRef = useRef<ZkSeepService | null>(null);

    // ── Transaction Queue ──────────────────────────────────
    // Chains every on-chain call so they execute one at a time.
    // This prevents txBadSeq from rapid back-to-back moves.
    const txQueueRef = useRef<Promise<unknown>>(Promise.resolve());

    const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
        const result = txQueueRef.current.then(async () => {
            const res = await fn();
            // Breathing delay after each tx to let RPC sync the sequence number
            await new Promise(r => setTimeout(r, TX_BREATHING_DELAY));
            return res;
        }, async () => {
            // Even if the previous tx failed, still proceed with the next one
            const res = await fn();
            await new Promise(r => setTimeout(r, TX_BREATHING_DELAY));
            return res;
        });
        txQueueRef.current = result.catch(() => { }); // swallow for chaining
        return result;
    }, []);

    /** Lazily init the service (needs contract ID from env) */
    const getService = useCallback((): ZkSeepService | null => {
        if (!ZK_SEEP_CONTRACT) {
            console.warn('[on-chain] ZK_SEEP_CONTRACT not set — skipping on-chain calls');
            return null;
        }
        if (!serviceRef.current) {
            try {
                serviceRef.current = new ZkSeepService(ZK_SEEP_CONTRACT);
            } catch (err) {
                console.warn('[on-chain] Failed to init ZkSeepService (bindings spec may need regenerating):', err);
                return null;
            }
        }
        return serviceRef.current;
    }, []);

    /**
     * Host: Prepare start_game transaction and sign auth entry
     */
    const onChainPrepareStartGame = useCallback(async (
        sessionId: number,
        hostAddress: string,
        joinerAddress: string,
    ): Promise<{ authXdr: string; txXdr: string } | null> => {
        const svc = getService();
        if (!svc) return null;

        try {
            const signer = getSessionSigner();
            console.log('[on-chain] prepare start_game:', sessionId);

            const result = await svc.prepareStartGame(
                sessionId,
                hostAddress,
                joinerAddress,
                BigInt(0),
                BigInt(0),
                signer,
            );

            console.log('[on-chain] prepare success, generated authXdr + txXdr');
            return result;
        } catch (err) {
            console.error('[on-chain] prepare start_game failed:', err);
            return null;
        }
    }, [getService, getSessionSigner]);

    /**
     * Joiner: Receive authXdr, sign, and submit start_game transaction
     */
    const onChainSignAndSubmitStartGame = useCallback(async (
        authXdr: string,
        txXdr: string,
        joinerAddress: string,
    ): Promise<boolean> => {
        const svc = getService();
        if (!svc) return false;

        try {
            const signer = getSessionSigner();
            console.log('[on-chain] import, sign, and submit start_game...');

            // Use the HOST's tx XDR directly (no re-simulation)
            await svc.importAndSignAuthEntry(
                authXdr,
                txXdr,
                joinerAddress,
                BigInt(0),
                signer,
            );

            console.log('[on-chain] start_game success ✅');
            return true;
        } catch (err) {
            console.error('[on-chain] sign and submit start_game failed:', err);
            return false;
        }
    }, [getService, getSessionSigner]);

    /**
     * Commit hand hash on-chain. (Queued)
     */
    const onChainCommitHand = useCallback((
        sessionId: number,
        handHash: Uint8Array,
        cardsCount: number,
    ): Promise<boolean> => {
        return enqueue(async () => {
            const svc = getService();
            if (!svc) return false;

            const playerAddress = getSessionPublicKey();
            if (!playerAddress) return false;

            try {
                const signer = getSessionSigner();
                console.log('[on-chain] commit_hand:', sessionId);
                await svc.commitHand(
                    sessionId,
                    playerAddress,
                    Buffer.from(handHash),
                    cardsCount,
                    signer,
                );
                console.log('[on-chain] commit_hand success');
                return true;
            } catch (err) {
                console.error('[on-chain] commit_hand failed:', err);
                return false;
            }
        });
    }, [enqueue, getService, getSessionSigner, getSessionPublicKey]);

    /**
     * Make a bid on-chain. (Queued)
     * Accepts optional proof bytes; uses empty proof on testnet (mock verifier).
     */
    const onChainMakeBid = useCallback((
        sessionId: number,
        bidValue: number,
        proofBytes?: Uint8Array,
    ): Promise<boolean> => {
        return enqueue(async () => {
            const svc = getService();
            if (!svc) return false;

            const playerAddress = getSessionPublicKey();
            if (!playerAddress) return false;

            const proof = proofBytes ? Buffer.from(proofBytes) : EMPTY_PROOF;

            try {
                const signer = getSessionSigner();
                console.log('[on-chain] make_bid:', sessionId, 'value:', bidValue, 'proof:', proof.length, 'bytes');
                await svc.makeBid(
                    sessionId,
                    playerAddress,
                    bidValue,
                    proof,
                    signer,
                );
                console.log('[on-chain] make_bid success ✅');
                return true;
            } catch (err) {
                console.error('[on-chain] make_bid failed:', err);
                return false;
            }
        });
    }, [enqueue, getService, getSessionSigner, getSessionPublicKey]);

    /**
     * Make a move on-chain. (Queued)
     * Accepts optional proof bytes for house-building moves (types 2-6).
     */
    const onChainMakeMove = useCallback((
        sessionId: number,
        moveType: number,
        cardValue: number,
        targetValue: number,
        scoreDelta: number,
        isSeep: boolean,
        proofBytes?: Uint8Array,
    ): Promise<boolean> => {
        return enqueue(async () => {
            const svc = getService();
            if (!svc) return false;

            const playerAddress = getSessionPublicKey();
            if (!playerAddress) return false;

            const proof = proofBytes ? Buffer.from(proofBytes) : EMPTY_PROOF;

            try {
                const signer = getSessionSigner();
                console.log('[on-chain] make_move:', sessionId, 'type:', moveType, 'proof:', proof.length, 'bytes');
                await svc.makeMove(
                    sessionId,
                    playerAddress,
                    moveType,
                    cardValue,
                    targetValue,
                    scoreDelta,
                    isSeep,
                    proof,
                    signer,
                );
                console.log('[on-chain] make_move success ✅');
                return true;
            } catch (err) {
                console.error('[on-chain] make_move failed:', err);
                return false;
            }
        });
    }, [enqueue, getService, getSessionSigner, getSessionPublicKey]);

    /**
     * End game on-chain. Reports winner to GameHub. (Queued)
     */
    const onChainEndGame = useCallback((
        sessionId: number,
    ): Promise<boolean> => {
        return enqueue(async () => {
            const svc = getService();
            if (!svc) return false;

            const playerAddress = getSessionPublicKey();
            if (!playerAddress) return false;

            try {
                const signer = getSessionSigner();
                console.log('[on-chain] end_game:', sessionId);
                await svc.endGame(sessionId, playerAddress, signer);
                console.log('[on-chain] end_game success ✅');
                return true;
            } catch (err) {
                console.error('[on-chain] end_game failed:', err);
                return false;
            }
        });
    }, [enqueue, getService, getSessionSigner, getSessionPublicKey]);

    return {
        onChainPrepareStartGame,
        onChainSignAndSubmitStartGame,
        onChainCommitHand,
        onChainMakeBid,
        onChainMakeMove,
        onChainEndGame,
        isLocalnet,
    };
}
