import { useCallback, useEffect } from 'react';
import { useWalletStore } from '../store/walletSlice';
import {
  requestAccess,
  signTransaction as freighterSignTransaction,
  signAuthEntry as freighterSignAuthEntry,
  isConnected as freighterIsConnected,
} from '@stellar/freighter-api';
import { NETWORK, NETWORK_PASSPHRASE, RPC_URL } from '../utils/constants';
import type { ContractSigner } from '../types/signer';
import {
  Keypair,
  TransactionBuilder,
  Networks,
  Operation,
  Account,
  xdr,
  rpc,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

const SESSION_WALLET_KEY = 'zk-seep-session-wallet';
const SAVE_KEY = 'zk-seep-game-state';

export function useWallet() {
  const {
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    setWallet,
    setConnecting,
    setNetwork,
    setError,
    disconnect: storeDisconnect,
  } = useWalletStore();

  // On mount: validate stored session wallet still exists on-chain.
  // After a Docker/localnet restart, the old ledger is gone and stored
  // session wallets become stale. Detect this and auto-clear.
  useEffect(() => {
    const isLocalnet = RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1');
    if (!isLocalnet) return;

    const secret = sessionStorage.getItem(SESSION_WALLET_KEY);
    if (!secret) return;

    try {
      const kp = Keypair.fromSecret(secret);
      const server = new rpc.Server(RPC_URL, { allowHttp: true });
      server.getAccount(kp.publicKey()).catch(() => {
        console.warn('[session-wallet] Stale wallet detected (account not on-chain), clearing...');
        sessionStorage.removeItem(SESSION_WALLET_KEY);
        sessionStorage.removeItem(SAVE_KEY);
      });
    } catch {
      sessionStorage.removeItem(SESSION_WALLET_KEY);
      sessionStorage.removeItem(SAVE_KEY);
    }
  }, []);

  /**
   * Connect via Freighter browser extension
   */
  const connectFreighter = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);

      // Check if Freighter is installed
      const connResult = await freighterIsConnected();
      if (!connResult.isConnected) {
        throw new Error(
          'Freighter wallet not found. Please install the Freighter browser extension from freighter.app'
        );
      }

      // Request access — Freighter will prompt the user to approve
      const { address, error: accessError } = await requestAccess();

      if (accessError) {
        throw new Error(`Freighter access denied: ${accessError.message || 'Unknown error'}`);
      }

      if (!address) {
        throw new Error('No address returned from Freighter');
      }

      setWallet(address, 'freighter', 'wallet');
      setNetwork(NETWORK, NETWORK_PASSPHRASE);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect Freighter';
      setError(errorMessage);
      console.error('Freighter connection error:', err);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [setWallet, setConnecting, setNetwork, setError]);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    storeDisconnect();
  }, [storeDisconnect]);

  /**
   * Get a signer for contract interactions.
   * Uses Freighter extension for signing.
   */
  const getContractSigner = useCallback((): ContractSigner => {
    if (!isConnected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    return {
      signTransaction: async (txXdr: string, opts?: any) => {
        return freighterSignTransaction(txXdr, {
          networkPassphrase: opts?.networkPassphrase || NETWORK_PASSPHRASE,
          address: opts?.address || publicKey,
        });
      },

      signAuthEntry: async (authEntryXdr: string, opts?: any) => {
        const result = await freighterSignAuthEntry(authEntryXdr, {
          networkPassphrase: opts?.networkPassphrase || NETWORK_PASSPHRASE,
          address: opts?.address || publicKey,
        });
        return {
          ...result,
          signedAuthEntry: result.signedAuthEntry ?? '',
        };
      },
    };
  }, [isConnected, publicKey]);

  /**
   * Create (or load) an ephemeral session wallet.
   * Generates a random Keypair and stores the secret in sessionStorage.
   * Returns the public key.
   */
  const createSessionWallet = useCallback((): string => {
    // Check if we already have one
    const existing = sessionStorage.getItem(SESSION_WALLET_KEY);
    if (existing) {
      try {
        const kp = Keypair.fromSecret(existing);
        console.log('[session-wallet] Loaded existing:', kp.publicKey());
        return kp.publicKey();
      } catch {
        sessionStorage.removeItem(SESSION_WALLET_KEY);
      }
    }

    const kp = Keypair.random();
    sessionStorage.setItem(SESSION_WALLET_KEY, kp.secret());
    console.log('[session-wallet] Created new:', kp.publicKey());
    return kp.publicKey();
  }, []);

  /**
   * Get the session wallet public key (if one exists).
   */
  const getSessionPublicKey = useCallback((): string | null => {
    const secret = sessionStorage.getItem(SESSION_WALLET_KEY);
    if (!secret) return null;
    try {
      return Keypair.fromSecret(secret).publicKey();
    } catch {
      return null;
    }
  }, []);

  /**
   * Get a ContractSigner that signs silently using the session wallet.
   * No Freighter popups — used for in-game transactions.
   */
  const getSessionSigner = useCallback((): ContractSigner => {
    const secret = sessionStorage.getItem(SESSION_WALLET_KEY);
    if (!secret) throw new Error('Session wallet not created');
    const kp = Keypair.fromSecret(secret);

    return {
      signTransaction: async (txXdr: string) => {
        const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
        tx.sign(kp);
        return { signedTxXdr: tx.toXDR() };
      },

      signAuthEntry: async (authEntryXdr: string) => {
        // authorizeEntry passes the HashIdPreimage as base64 XDR.
        // We need to: decode → hash (SHA-256) → sign the hash
        const preimageBytes = Buffer.from(authEntryXdr, 'base64');
        const hashBytes = await globalThis.crypto.subtle.digest('SHA-256', preimageBytes);
        const signature = kp.sign(Buffer.from(hashBytes));
        return {
          signedAuthEntry: signature.toString('base64'),
          signerAddress: kp.publicKey(),
        };
      },
    };
  }, []);

  /**
   * Fund the session wallet.
   * - On localnet (http://localhost): use the local friendbot directly (no Freighter needed).
   * - On testnet/mainnet: send XLM from the connected Freighter wallet (one popup).
   */
  const fundSessionWallet = useCallback(async (amountXlm: string = '10'): Promise<void> => {
    const sessionPubKey = getSessionPublicKey();
    if (!sessionPubKey) throw new Error('Session wallet not created');

    const isLocalnet = RPC_URL.includes('localhost') || RPC_URL.includes('127.0.0.1');

    if (isLocalnet) {
      // Check if account already exists on-chain before hitting friendbot
      const friendbotUrl = RPC_URL.replace('/soroban/rpc', '').replace(/\/+$/, '');
      try {
        const server = new rpc.Server(RPC_URL, { allowHttp: true });
        await server.getAccount(sessionPubKey);
        // Account already exists — no need to fund
        console.log('[session-wallet] Already funded, skipping friendbot');
        return;
      } catch {
        // Account doesn't exist yet — fund it
      }

      const res = await fetch(`${friendbotUrl}/friendbot?addr=${sessionPubKey}`);
      if (!res.ok) {
        const text = await res.text();
        if (!text.includes('already funded')) {
          throw new Error(`Local friendbot failed (${res.status}): ${text}`);
        }
      }
      console.log('[session-wallet] Funded via local friendbot');
      return;
    }

    // Testnet/Mainnet: fund via Freighter
    if (!publicKey) throw new Error('Freighter wallet not connected');

    const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });

    try {
      await server.getAccount(sessionPubKey);
      console.log('[session-wallet] Already funded on Testnet, skipping Freighter popup');
      return;
    } catch {
      // Account doesn't exist yet, proceed to create it
    }

    const sourceAccount = await server.getAccount(publicKey);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.createAccount({
          destination: sessionPubKey,
          startingBalance: amountXlm,
        })
      )
      .setTimeout(30)
      .build();

    // Sign with Freighter (user approves once)
    const { signedTxXdr, error: signError } = await freighterSignTransaction(
      tx.toXDR(),
      { networkPassphrase: NETWORK_PASSPHRASE, address: publicKey }
    );
    if (signError) throw new Error(`Failed to sign funding tx: ${signError.message}`);

    const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
    const result = await server.sendTransaction(signedTx as any);

    if (result.status === 'ERROR') {
      throw new Error(`Funding transaction failed: ${result.status}`);
    }

    // Wait for confirmation
    let getResult = await server.getTransaction(result.hash);
    while (getResult.status === 'NOT_FOUND') {
      await new Promise(r => setTimeout(r, 1000));
      getResult = await server.getTransaction(result.hash);
    }

    if (getResult.status === 'FAILED') {
      throw new Error('Funding transaction failed on-chain');
    }

    console.log('[session-wallet] Funded with', amountXlm, 'XLM');
  }, [publicKey, getSessionPublicKey]);

  return {
    // State
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,

    // Actions
    connectFreighter,
    disconnect,
    getContractSigner,

    // Session wallet
    createSessionWallet,
    getSessionPublicKey,
    getSessionSigner,
    fundSessionWallet,
  };
}
