import { Client as ZkSeepClient, type Game, GamePhase } from './bindings';
import { NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS, DEFAULT_AUTH_TTL_MINUTES, MULTI_SIG_AUTH_TTL_MINUTES } from '@/utils/constants';
import { contract, TransactionBuilder, StrKey, xdr, Address, authorizeEntry } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import { calculateValidUntilLedger } from '@/utils/ledgerUtils';
import { injectSignedAuthEntry } from '@/utils/authEntryUtils';

type ClientOptions = contract.ClientOptions;

/**
 * Service for interacting with the ZkSeep game contract.
 *
 * On-chain game lifecycle:
 *   start_game → commit_hand (×2) → make_bid → make_move (alternating) → end_game
 */
export class ZkSeepService {
  private baseClient: ZkSeepClient;
  private contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new ZkSeepClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  /* ================================================================
   * Helpers
   * ================================================================ */

  private createSigningClient(
    publicKey: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): ZkSeepClient {
    return new ZkSeepClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    });
  }

  private async submitTx(
    tx: any,
    timeoutSeconds: number,
    authTtlMinutes?: number
  ) {
    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    const sentTx = await signAndSendViaLaunchtube(
      tx,
      timeoutSeconds,
      validUntilLedgerSeq
    );

    if (sentTx.getTransactionResponse?.status === 'FAILED') {
      const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
      throw new Error(`Transaction failed: ${errorMessage}`);
    }

    return sentTx.result;
  }

  /* ================================================================
   * Read-only
   * ================================================================ */

  /**
   * Get game state. Returns null if game doesn't exist.
   */
  async getGame(sessionId: number): Promise<Game | null> {
    try {
      const tx = await this.baseClient.get_game({ session_id: sessionId });
      const result = await tx.simulate();

      if (result.result.isOk()) {
        return result.result.unwrap();
      } else {
        console.log('[getGame] Game not found for session:', sessionId);
        return null;
      }
    } catch (err) {
      console.log('[getGame] Error querying game:', err);
      return null;
    }
  }

  /* ================================================================
   * start_game — multi-sig flow (3 steps)
   * ================================================================ */

  /**
   * STEP 1 (Player 1): Prepare a start_game transaction.
   * Player 1 signs their auth entry and exports it as XDR.
   */
  async prepareStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    player1Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<string> {
    const buildClient = new ZkSeepClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player2,
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries found in simulation');
    }

    const authEntries = tx.simulationData.result.auth;
    let player1AuthEntry = null;

    for (let i = 0; i < authEntries.length; i++) {
      const entry = authEntries[i];
      try {
        const entryAddress = entry.credentials().address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();
        if (entryAddressString === player1) {
          player1AuthEntry = entry;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!player1AuthEntry) {
      throw new Error(`No auth entry found for Player 1 (${player1})`);
    }

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    if (!player1Signer.signAuthEntry) {
      throw new Error('signAuthEntry function not available');
    }

    const signedAuthEntry = await authorizeEntry(
      player1AuthEntry,
      async (preimage) => {
        if (!player1Signer.signAuthEntry) {
          throw new Error('Wallet does not support auth entry signing');
        }
        const signResult = await player1Signer.signAuthEntry(
          preimage.toXDR('base64'),
          { networkPassphrase: NETWORK_PASSPHRASE, address: player1 }
        );
        if (signResult.error) {
          throw new Error(`Failed to sign auth entry: ${signResult.error.message}`);
        }
        return Buffer.from(signResult.signedAuthEntry, 'base64');
      },
      validUntilLedgerSeq,
      NETWORK_PASSPHRASE,
    );

    return signedAuthEntry.toXDR('base64');
  }

  /**
   * Parse a signed auth entry to extract game parameters.
   */
  parseAuthEntry(authEntryXdr: string): {
    sessionId: number;
    player1: string;
    player1Points: bigint;
    functionName: string;
  } {
    const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64');
    const addressCreds = authEntry.credentials().address();
    const player1Address = addressCreds.address();
    const player1 = Address.fromScAddress(player1Address).toString();

    const rootInvocation = authEntry.rootInvocation();
    const contractFn = rootInvocation.function().contractFn();
    const functionName = contractFn.functionName().toString();

    if (functionName !== 'start_game') {
      throw new Error(`Unexpected function: ${functionName}. Expected start_game.`);
    }

    const args = contractFn.args();
    if (args.length !== 2) {
      throw new Error(`Expected 2 arguments for start_game auth entry, got ${args.length}`);
    }

    return {
      sessionId: args[0].u32(),
      player1,
      player1Points: args[1].i128().lo().toBigInt(),
      functionName,
    };
  }

  /**
   * STEP 2 (Player 2): Import Player 1's signed auth entry and rebuild transaction.
   */
  async importAndSignAuthEntry(
    player1SignedAuthEntryXdr: string,
    player2Address: string,
    player2Points: bigint,
    player2Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<string> {
    const gameParams = this.parseAuthEntry(player1SignedAuthEntryXdr);

    if (player2Address === gameParams.player1) {
      throw new Error('Cannot play against yourself.');
    }

    const buildClient = new ZkSeepClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player2Address,
    });

    const tx = await buildClient.start_game({
      session_id: gameParams.sessionId,
      player1: gameParams.player1,
      player2: player2Address,
      player1_points: gameParams.player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    const txWithInjectedAuth = await injectSignedAuthEntry(
      tx,
      player1SignedAuthEntryXdr,
      player2Address,
      player2Signer,
      validUntilLedgerSeq
    );

    const player2Client = this.createSigningClient(player2Address, player2Signer);
    const player2Tx = player2Client.txFromXDR(txWithInjectedAuth.toXDR());

    const needsSigning = await player2Tx.needsNonInvokerSigningBy();
    if (needsSigning.includes(player2Address)) {
      await player2Tx.signAuthEntries({ expiration: validUntilLedgerSeq });
    }

    return player2Tx.toXDR();
  }

  /**
   * STEP 3: Finalize and submit the start_game transaction.
   */
  async finalizeStartGame(
    txXdr: string,
    signerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(signerAddress, signer);
    const tx = client.txFromXDR(txXdr);
    await tx.simulate();

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    const sentTx = await signAndSendViaLaunchtube(
      tx,
      DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
      validUntilLedgerSeq
    );
    return sentTx.result;
  }

  /* ================================================================
   * Game Actions
   * ================================================================ */

  /**
   * Commit hand hash (both players must do this before bidding).
   */
  async commitHand(
    sessionId: number,
    playerAddress: string,
    handHash: Buffer,
    cardsCount: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.commit_hand({
      session_id: sessionId,
      player: playerAddress,
      hand_hash: handHash,
      cards_count: cardsCount,
    }, DEFAULT_METHOD_OPTIONS);

    return this.submitTx(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, authTtlMinutes);
  }

  /**
   * Submit a bid (9-13). Requires ZK proof that player holds a card of bid value.
   */
  async makeBid(
    sessionId: number,
    playerAddress: string,
    bidValue: number,
    proof: Buffer,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    if (bidValue < 9 || bidValue > 13) {
      throw new Error('Bid must be between 9 and 13');
    }

    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.make_bid({
      session_id: sessionId,
      player: playerAddress,
      bid_value: bidValue,
      proof,
    }, DEFAULT_METHOD_OPTIONS);

    return this.submitTx(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, authTtlMinutes);
  }

  /**
   * Submit a move. For house-building moves (types 2-6), a ZK proof is required.
   */
  async makeMove(
    sessionId: number,
    playerAddress: string,
    moveType: number,
    cardValue: number,
    targetValue: number,
    scoreDelta: number,
    isSeep: boolean,
    proof: Buffer,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    if (moveType < 1 || moveType > 7) {
      throw new Error('Move type must be between 1 and 7');
    }

    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.make_move({
      session_id: sessionId,
      player: playerAddress,
      move_type: moveType,
      card_value: cardValue,
      target_value: targetValue,
      score_delta: scoreDelta,
      is_seep: isSeep,
      proof,
    }, DEFAULT_METHOD_OPTIONS);

    return this.submitTx(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, authTtlMinutes);
  }

  /**
   * Update hand hash after a new deal (e.g., after bid move or between halves).
   */
  async updateHand(
    sessionId: number,
    playerAddress: string,
    newHandHash: Buffer,
    newCardsCount: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(playerAddress, signer);
    const tx = await client.update_hand({
      session_id: sessionId,
      player: playerAddress,
      new_hand_hash: newHandHash,
      new_cards_count: newCardsCount,
    }, DEFAULT_METHOD_OPTIONS);

    return this.submitTx(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, authTtlMinutes);
  }

  /**
   * End the game when phase is GameOver. Submits result to GameHub.
   */
  async endGame(
    sessionId: number,
    callerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(callerAddress, signer);
    const tx = await client.end_game({
      session_id: sessionId,
    }, DEFAULT_METHOD_OPTIONS);

    return this.submitTx(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, authTtlMinutes);
  }

  /* ================================================================
   * Helpers (parse, diagnostics)
   * ================================================================ */

  parseTransactionXDR(txXdr: string): {
    sessionId: number;
    player1: string;
    player2: string;
    player1Points: bigint;
    player2Points: bigint;
    transactionSource: string;
    functionName: string;
  } {
    const transaction = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
    const transactionSource = 'source' in transaction ? transaction.source : '';
    const operation = transaction.operations[0];

    if (!operation || operation.type !== 'invokeHostFunction') {
      throw new Error('Transaction does not contain a contract invocation');
    }

    const invokeContractArgs = operation.func.invokeContract();
    const functionName = invokeContractArgs.functionName().toString();

    if (functionName !== 'start_game') {
      throw new Error(`Unexpected function: ${functionName}. Expected start_game.`);
    }

    const args = invokeContractArgs.args();
    if (args.length !== 5) {
      throw new Error(`Expected 5 arguments for start_game, got ${args.length}`);
    }

    return {
      sessionId: args[0].u32(),
      player1: StrKey.encodeEd25519PublicKey(args[1].address().accountId().ed25519()),
      player2: StrKey.encodeEd25519PublicKey(args[2].address().accountId().ed25519()),
      player1Points: args[3].i128().lo().toBigInt(),
      player2Points: args[4].i128().lo().toBigInt(),
      transactionSource,
      functionName,
    };
  }

  async checkRequiredSignatures(txXdr: string, publicKey: string): Promise<string[]> {
    const client = this.createSigningClient(publicKey, {
      signTransaction: async (xdr: string) => ({ signedTxXdr: xdr }),
      signAuthEntry: async (xdr: string) => ({ signedAuthEntry: xdr }),
    });
    const tx = client.txFromXDR(txXdr);
    return tx.needsNonInvokerSigningBy();
  }

  private extractErrorFromDiagnostics(transactionResponse: any): string {
    try {
      console.error('Transaction response:', JSON.stringify(transactionResponse, null, 2));

      const diagnosticEvents = transactionResponse?.diagnosticEventsXdr ||
        transactionResponse?.diagnostic_events || [];

      for (const event of diagnosticEvents) {
        if (event?.topics) {
          const topics = Array.isArray(event.topics) ? event.topics : [];
          const hasErrorTopic = topics.some((topic: any) =>
            topic?.symbol === 'error' || topic?.error
          );

          if (hasErrorTopic && event.data) {
            if (typeof event.data === 'string') return event.data;
            if (event.data.vec && Array.isArray(event.data.vec)) {
              const messages = event.data.vec
                .filter((item: any) => item?.string)
                .map((item: any) => item.string);
              if (messages.length > 0) return messages.join(': ');
            }
          }
        }
      }

      const status = transactionResponse?.status || 'Unknown';
      return `Transaction ${status}. Check console for details.`;
    } catch (err) {
      console.error('Failed to extract error from diagnostics:', err);
      return 'Transaction failed with unknown error';
    }
  }
}
