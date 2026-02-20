import { useCallback } from 'react';
import { useWalletStore } from '../store/walletSlice';
import {
  requestAccess,
  signTransaction as freighterSignTransaction,
  signAuthEntry as freighterSignAuthEntry,
  isConnected as freighterIsConnected,
} from '@stellar/freighter-api';
import { NETWORK, NETWORK_PASSPHRASE } from '../utils/constants';
import type { ContractSigner } from '../types/signer';

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
        return freighterSignAuthEntry(authEntryXdr, {
          networkPassphrase: opts?.networkPassphrase || NETWORK_PASSPHRASE,
          address: opts?.address || publicKey,
        });
      },
    };
  }, [isConnected, publicKey]);

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
  };
}
