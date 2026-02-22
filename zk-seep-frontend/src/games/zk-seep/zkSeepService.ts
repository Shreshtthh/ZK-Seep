// @ts-nocheck — Contract Client methods are auto-generated and may not match TS bindings
import { Client as ZkSeepClient, type Game, GamePhase } from './bindings';
import { NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS, DEFAULT_AUTH_TTL_MINUTES, MULTI_SIG_AUTH_TTL_MINUTES } from '@/utils/constants';
import { contract, TransactionBuilder, StrKey, xdr, Address, authorizeEntry, Keypair } from '@stellar/stellar-sdk';
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
      allowHttp: RPC_URL.startsWith('http://'),
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
      allowHttp: RPC_URL.startsWith('http://'),
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
   * start_game — simple single-signer flow (localnet)
   * ================================================================ */

  /**
   * Start a game with a single signer (for localnet demo).
   * Both players can be the same address.
   */
  async startGameSimple(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    return this.submitTx(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds);
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
      allowHttp: RPC_URL.startsWith('http://'),
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

    // For session wallets, use the raw Keypair directly with authorizeEntry
    // This avoids signature format issues with the signAuthEntry callback
    const sessionSecret = globalThis.sessionStorage?.getItem('zk-seep-session-wallet');
    if (!sessionSecret) {
      throw new Error('Session wallet not found — cannot sign auth entry');
    }
    const signingKeypair = Keypair.fromSecret(sessionSecret);

    const signedAuthEntry = await authorizeEntry(
      player1AuthEntry,
      signingKeypair,
      validUntilLedgerSeq,
      NETWORK_PASSPHRASE,
    );

    const signedAuthEntryXdr = signedAuthEntry.toXDR('base64');

    // Also return the full transaction XDR — it has the correct footprint
    // (including Player 1's nonce). The Joiner MUST NOT re-simulate because
    // re-simulation with populated auth strips the nonce from the footprint.
    const fullTxXdr = tx.toXDR();

    return { authXdr: signedAuthEntryXdr, txXdr: fullTxXdr };
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
   * STEP 2 (Player 2): Use the HOST's pre-simulated transaction, inject Player 1's
   * signed auth entry, sign the envelope, and submit directly.
   *
   * CRITICAL: Do NOT re-simulate! Re-simulation with populated auth entries
   * strips Player 1's nonce from the footprint, causing INVOKE_HOST_FUNCTION_TRAPPED.
   */
  async importAndSignAuthEntry(
    player1SignedAuthEntryXdr: string,
    hostTxXdr: string,
    player2Address: string,
    player2Points: bigint,
    player2Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<any> {
    // Parse the HOST's transaction (which has the correct footprint including Player 1's nonce)
    const hostTx = TransactionBuilder.fromXDR(hostTxXdr, NETWORK_PASSPHRASE);
    console.log('[importAndSignAuthEntry] Parsed HOST tx, source:', hostTx.source);

    const { injectSignedAuthEntry } = await import('@/utils/authEntryUtils');
    const { rpc } = await import('@stellar/stellar-sdk');

    // Reuse the working `injectSignedAuthEntry` utility to correctly swap Player 1's auth 
    // and properly sign Player 2's auth entry if it isn't `sorobanCredentialsSourceAccount`
    // Note: We cast `hostTx` to `contract.AssembledTransaction` because `injectSignedAuthEntry` 
    // expects it, though it only strictly needs `simulationData.result.auth` 
    // Since `hostTx` is just a `Transaction`, we need to mock the simulation data interface
    // to match `injectSignedAuthEntry`'s expectations.

    // A safer, more direct approach given the strict footprint requirements:
    const player1SignedAuth = xdr.SorobanAuthorizationEntry.fromXDR(player1SignedAuthEntryXdr, 'base64');
    const envelope = hostTx.toEnvelope();
    const txBody = envelope.v1().tx();
    const ops = txBody.operations();
    const invokeOp = ops[0].body().invokeHostFunctionOp();
    const authEntries = invokeOp.auth();

    const player1SignedAddress = Address.fromScAddress(
      player1SignedAuth.credentials().address().address()
    ).toString();

    let replaced = false;
    for (let i = 0; i < authEntries.length; i++) {
      try {
        const credType = authEntries[i].credentials().switch().name;
        if (credType === 'sorobanCredentialsAddress') {
          const entryAddr = Address.fromScAddress(
            authEntries[i].credentials().address().address()
          ).toString();
          if (entryAddr === player1SignedAddress) {
            authEntries[i] = player1SignedAuth;
            replaced = true;
            console.log('[importAndSignAuthEntry] Replaced Player 1 auth at index', i);
            break;
          }
        }
      } catch { continue; }
    }

    if (!replaced) {
      throw new Error('Could not find Player 1 auth entry in HOST transaction');
    }

    invokeOp.auth(authEntries);

    // Rebuild the transaction object from the modified envelope XDR!
    // Since we mutated `envelope` above, its XDR now contains Player 1's signature.
    // If we just do `hostTx.sign(kp)`, it signs the *old* unsigned ops array inside hostTx.
    const modifiedTxXdr = envelope.toXDR('base64');
    const modifiedTx = TransactionBuilder.fromXDR(modifiedTxXdr, NETWORK_PASSPHRASE);

    // Sign the envelope with the session keypair
    const sessionSecret = globalThis.sessionStorage?.getItem('zk-seep-session-wallet');
    if (!sessionSecret) throw new Error('Session wallet not found');
    const kp = Keypair.fromSecret(sessionSecret);
    console.log('[importAndSignAuthEntry] Signing modified tx as:', kp.publicKey());

    // Sign the NEW builder object containing the correct auth array
    modifiedTx.sign(kp);

    // Try simulating the EXACT transaction we are about to send to verify footprint/auth traps!
    const server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
    try {
      console.log('[importAndSignAuthEntry] Dry-running simulation to check for footprint/auth traps...');
      const simMatch = await server.simulateTransaction(modifiedTx as any);
      if (rpc.Api.isSimulationError(simMatch)) {
        console.error('[importAndSignAuthEntry] SIMULATION PRE-CHECK FAILED:', simMatch.error);
        if (simMatch.events) {
          console.error('[importAndSignAuthEntry] Sim Events:', JSON.stringify(simMatch.events, null, 2));
        }
      } else {
        console.log('[importAndSignAuthEntry] SIMULATION PRE-CHECK PASSED ✅');
      }
    } catch (e) {
      console.error('[importAndSignAuthEntry] Failed to run simulation pre-check:', e);
    }

    // Submit directly — NO re-simulation
    // We send the exact assembled transaction with the precise footprint that was simulated
    const sendResponse = await server.sendTransaction(modifiedTx as any);
    console.log('[importAndSignAuthEntry] sendTransaction status:', sendResponse.status);

    if (sendResponse.status === 'ERROR') {
      console.error('[importAndSignAuthEntry] sendTransaction immediate ERROR:', JSON.stringify(sendResponse, null, 2));
      throw new Error(`Transaction send error: ${JSON.stringify(sendResponse)}`);
    }

    // Poll for completion
    const maxWait = 30_000;
    const start = Date.now();
    let getResponse = await server.getTransaction(sendResponse.hash);
    while (getResponse.status === 'NOT_FOUND' && Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 1000));
      getResponse = await server.getTransaction(sendResponse.hash);
    }

    if (getResponse.status === 'SUCCESS') {
      console.log('[importAndSignAuthEntry] Transaction confirmed ✅');
      return true;
    } else {
      console.error('[importAndSignAuthEntry] FAILED. getResponse:', JSON.stringify(getResponse, null, 2));

      // Let's decode the meta XDR to see the exact VM trap reason if possible
      try {
        if (getResponse.resultMetaXdr) {
          this.extractErrorFromDiagnostics(getResponse);
        } else {
          console.error('[importAndSignAuthEntry] No resultMetaXdr found on failed transaction object:', getResponse);
        }
      } catch (e) {
        console.error('Failed to parse resultMetaXdr', e);
      }

      throw new Error(`Transaction failed: ${getResponse.status}`);
    }
  }

  /**
   * STEP 3: No longer needed — importAndSignAuthEntry now submits directly.
   * Kept as a no-op for backward compatibility.
   */
  async finalizeStartGame(
    _txXdr: string,
    _signerAddress: string,
    _signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    _authTtlMinutes?: number
  ) {
    // This is now a no-op. The transaction was already submitted by importAndSignAuthEntry.
    console.log('[finalizeStartGame] No-op — transaction already submitted by importAndSignAuthEntry');
    return true;
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
      console.error('[extractErrorFromDiagnostics] Extracting from response:', transactionResponse);

      // Attempt to decode resultMetaXdr for more detailed VM errors
      if (transactionResponse?.resultMetaXdr) {
        try {
          let meta = transactionResponse.resultMetaXdr;

          // Only parse if it's a string (in recent SDK versions, getTransaction returns the raw parsed object)
          if (typeof meta === 'string') {
            meta = xdr.TransactionMeta.fromXDR(meta, 'base64');
          }

          console.error('[extractErrorFromDiagnostics] Decoded Meta:', JSON.stringify(meta, null, 2));

          // In stellar-sdk, TransactionMeta is a union. We can get the inner value safely:
          const metaValue = meta.value ? meta.value() : meta._value;

          if (metaValue && metaValue.sorobanMeta && typeof metaValue.sorobanMeta === 'function') {
            const sorobanMeta = metaValue.sorobanMeta();
            if (sorobanMeta && sorobanMeta.diagnosticEvents && typeof sorobanMeta.diagnosticEvents === 'function') {
              const events = sorobanMeta.diagnosticEvents();
              for (const event of events) {
                const eventInfo = event.event();
                const ext = eventInfo.body().v0();
                const topics = ext.topics();

                const isError = topics.some(t => {
                  if (t.switch().name === 'scvSymbol') {
                    const sym = t.sym().toString();
                    return sym === 'error' || sym.includes('error');
                  }
                  return false;
                });

                if (isError) {
                  // The data field contains the actual error message or code
                  const data = ext.data();
                  console.error('[extractErrorFromDiagnostics] Found VM TRAP ERROR:', JSON.stringify(data, null, 2));

                  // Try to extract a readable string if it's a string/symbol or a vec of strings
                  if (data) {
                    try {
                      const dataObj = JSON.parse(JSON.stringify(data));
                      console.error('[extractErrorFromDiagnostics] Error details:', dataObj);
                    } catch (e) { }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('[extractErrorFromDiagnostics] Failed to parse resultMetaXdr:', e);
        }
      }

      const diagnosticEvents = transactionResponse?.diagnosticEventsXdr ||
        transactionResponse?.diagnostic_events || [];

      for (const event of diagnosticEvents) {
        let parsedEvent = event;
        // if event is XDR string, decode it
        if (typeof event === 'string') {
          try {
            parsedEvent = xdr.DiagnosticEvent.fromXDR(event, 'base64');
          } catch {
            continue; // Not parsable XDR
          }
        }

        if (parsedEvent?.topics) {
          const topics = Array.isArray(parsedEvent.topics) ? parsedEvent.topics : [];
          const hasErrorTopic = topics.some((topic: any) =>
            topic?.symbol === 'error' || topic?.error
          );

          if (hasErrorTopic && parsedEvent.data) {
            if (typeof parsedEvent.data === 'string') return parsedEvent.data;
            if (parsedEvent.data.vec && Array.isArray(parsedEvent.data.vec)) {
              const messages = parsedEvent.data.vec
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
