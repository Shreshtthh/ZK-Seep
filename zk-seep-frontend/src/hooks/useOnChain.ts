/**
 * Hook that wraps ZkSeepService contract calls for in-game use.
 *
 * All transactions use the session wallet signer so they execute
 * silently (no Freighter popup per move).
 *
 * When the mock verifier is deployed on testnet, proof bytes are
 * sent as empty — the mock always returns true.
 */
import { useCallback, useRef } from 'react';
import { ZkSeepService } from '../games/zk-seep/zkSeepService';
import { useWallet } from './useWallet';
import { ZK_SEEP_CONTRACT } from '@/utils/constants';
import { Buffer } from 'buffer';

const EMPTY_PROOF = Buffer.alloc(0);

export function useOnChain() {
    const { getSessionSigner, getSessionPublicKey } = useWallet();
    const serviceRef = useRef<ZkSeepService | null>(null);

    /** Lazily init the service (needs contract ID from env) */
    const getService = useCallback((): ZkSeepService | null => {
        if (!ZK_SEEP_CONTRACT) {
            console.warn('[on-chain] ZK_SEEP_CONTRACT not set — skipping on-chain calls');
            return null;
        }
        if (!serviceRef.current) {
            serviceRef.current = new ZkSeepService(ZK_SEEP_CONTRACT);
        }
        return serviceRef.current;
    }, []);

    /**
     * Call start_game on-chain.
     * For the hackathon demo, both "players" are session wallets on the same device
     * or the session wallet acts as the signable party.
     */
    const onChainStartGame = useCallback(async (
        sessionId: number,
        player1Address: string,
        player2Address: string,
    ): Promise<boolean> => {
        const svc = getService();
        if (!svc) return false;

        try {
            const signer = getSessionSigner();
            console.log('[on-chain] start_game:', sessionId);

            // Use simplified single-signer approach for demo:
            // The session wallet signs for the player on this device.
            await svc.prepareStartGame(
                sessionId,
                player1Address,
                player2Address,
                BigInt(0), // points
                BigInt(0), // points
                signer,
            );

            console.log('[on-chain] start_game success');
            return true;
        } catch (err) {
            console.error('[on-chain] start_game failed:', err);
            return false;
        }
    }, [getService, getSessionSigner]);

    /**
     * Commit hand hash on-chain.
     */
    const onChainCommitHand = useCallback(async (
        sessionId: number,
        handHash: Uint8Array,
        cardsCount: number,
    ): Promise<boolean> => {
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
    }, [getService, getSessionSigner, getSessionPublicKey]);

    /**
     * Make a bid on-chain.
     * Uses empty proof (mock verifier always returns true).
     */
    const onChainMakeBid = useCallback(async (
        sessionId: number,
        bidValue: number,
    ): Promise<boolean> => {
        const svc = getService();
        if (!svc) return false;

        const playerAddress = getSessionPublicKey();
        if (!playerAddress) return false;

        try {
            const signer = getSessionSigner();
            console.log('[on-chain] make_bid:', sessionId, 'value:', bidValue);
            await svc.makeBid(
                sessionId,
                playerAddress,
                bidValue,
                EMPTY_PROOF,
                signer,
            );
            console.log('[on-chain] make_bid success');
            return true;
        } catch (err) {
            console.error('[on-chain] make_bid failed:', err);
            return false;
        }
    }, [getService, getSessionSigner, getSessionPublicKey]);

    /**
     * Make a move on-chain.
     * For house-building moves (types 2-6), proof is required but
     * the mock verifier accepts empty proof.
     */
    const onChainMakeMove = useCallback(async (
        sessionId: number,
        moveType: number,
        cardValue: number,
        targetValue: number,
        scoreDelta: number,
        isSeep: boolean,
    ): Promise<boolean> => {
        const svc = getService();
        if (!svc) return false;

        const playerAddress = getSessionPublicKey();
        if (!playerAddress) return false;

        try {
            const signer = getSessionSigner();
            console.log('[on-chain] make_move:', sessionId, 'type:', moveType);
            await svc.makeMove(
                sessionId,
                playerAddress,
                moveType,
                cardValue,
                targetValue,
                scoreDelta,
                isSeep,
                EMPTY_PROOF,
                signer,
            );
            console.log('[on-chain] make_move success');
            return true;
        } catch (err) {
            console.error('[on-chain] make_move failed:', err);
            return false;
        }
    }, [getService, getSessionSigner, getSessionPublicKey]);

    /**
     * End game on-chain. Reports winner to GameHub.
     */
    const onChainEndGame = useCallback(async (
        sessionId: number,
    ): Promise<boolean> => {
        const svc = getService();
        if (!svc) return false;

        const playerAddress = getSessionPublicKey();
        if (!playerAddress) return false;

        try {
            const signer = getSessionSigner();
            console.log('[on-chain] end_game:', sessionId);
            await svc.endGame(sessionId, playerAddress, signer);
            console.log('[on-chain] end_game success');
            return true;
        } catch (err) {
            console.error('[on-chain] end_game failed:', err);
            return false;
        }
    }, [getService, getSessionSigner, getSessionPublicKey]);

    return {
        onChainStartGame,
        onChainCommitHand,
        onChainMakeBid,
        onChainMakeMove,
        onChainEndGame,
    };
}
