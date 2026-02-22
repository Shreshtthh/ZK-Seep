import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i128,
  Option,
} from "@stellar/stellar-sdk/contract";
// Note: Do not use wildcard re-exports from @stellar/stellar-sdk here
// as they are CJS modules and Vite cannot interop them.
// Import directly from @stellar/stellar-sdk where needed.

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCMG3EP4S6UDNNYWWV5F7SE7A7DY53OZV3BRWTELSFOB2L2JGKQSBKWB",
  }
} as const;

/* ------------------------------------------------------------------ */
/*  Contract Types (matching zk-seep lib.rs)                           */
/* ------------------------------------------------------------------ */

export enum GamePhase {
  WaitingForPlayers = 0,
  HandCommit = 1,
  Bidding = 2,
  BidMove = 3,
  FirstHalf = 4,
  SecondHalf = 5,
  GameOver = 6,
}

export enum MoveType {
  Throw = 1,
  Build = 2,
  Cement = 3,
  MergeFix = 4,
  AddToFixed = 5,
  DirectFix = 6,
  PickUp = 7,
}

export interface Card {
  suit: u32;
  value: u32;
}

export interface Pile {
  value: u32;
  card_count: u32;
  fixed: boolean;
}

/** On-chain game state */
export interface Game {
  player1: string;
  player2: string;
  player1_points: i128;
  player2_points: i128;
  phase: GamePhase;
  current_turn: u32;
  bid_value: u32;
  bidder: u32;
  player1_hand_hash: Buffer;
  player2_hand_hash: Buffer;
  player1_score: u32;
  player2_score: u32;
  player1_seeps: u32;
  player2_seeps: u32;
  player1_cards_left: u32;
  player2_cards_left: u32;
  center_piles: Pile[];
  move_count: u32;
  last_pickup_player: u32;
  deal_phase: u32;
  winner: Option<string>;
}

export const Errors = {
  1: { message: "GameNotFound" },
  2: { message: "NotPlayer" },
  3: { message: "NotYourTurn" },
  4: { message: "InvalidPhase" },
  5: { message: "GameAlreadyEnded" },
  6: { message: "InvalidBid" },
  7: { message: "InvalidMove" },
  8: { message: "ProofRequired" },
  9: { message: "ProofVerificationFailed" },
  10: { message: "HandAlreadyCommitted" },
  11: { message: "HandNotCommitted" },
  12: { message: "InvalidMoveType" },
};

export type DataKey =
  | { tag: "Game"; values: readonly [u32] }
  | { tag: "GameHubAddress"; values: void }
  | { tag: "VerifierAddress"; values: void }
  | { tag: "Admin"; values: void };

/* ------------------------------------------------------------------ */
/*  Client interface (method signatures)                               */
/* ------------------------------------------------------------------ */

export interface ClientInterface {
  get_hub: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
  set_hub: (args: { new_hub: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
  set_admin: (args: { new_admin: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
  set_verifier: (args: { new_verifier: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
  upgrade: (args: { new_wasm_hash: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;

  get_game: (args: { session_id: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>;

  start_game: (args: {
    session_id: u32;
    player1: string;
    player2: string;
    player1_points: i128;
    player2_points: i128;
  }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;

  commit_hand: (args: {
    session_id: u32;
    player: string;
    hand_hash: Buffer;
    cards_count: u32;
  }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;

  make_bid: (args: {
    session_id: u32;
    player: string;
    bid_value: u32;
    proof: Buffer;
  }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;

  make_move: (args: {
    session_id: u32;
    player: string;
    move_type: u32;
    card_value: u32;
    target_value: u32;
    score_delta: u32;
    is_seep: boolean;
    proof: Buffer;
  }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;

  update_hand: (args: {
    session_id: u32;
    player: string;
    new_hand_hash: Buffer;
    new_cards_count: u32;
  }, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>;

  end_game: (args: { session_id: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Option<string>>>>;
}

/* ------------------------------------------------------------------ */
/*  Client class                                                       */
/* ------------------------------------------------------------------ */

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec(["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",
        "AAAAAAAAAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAFlFbmQgdGhlIGdhbWUgYW5kIHN1Ym1pdCByZXN1bHQgdG8gR2FtZUh1Yi4KQ2FuIGJlIGNhbGxlZCB3aGVuIHRoZSBnYW1lIHBoYXNlIGlzIEdhbWVPdmVyLgAAAAAAAAhlbmRfZ2FtZQAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAA+gAAAATAAAAAw==",
        "AAAAAAAAABpHZXQgZ2FtZSBzdGF0ZSAocmVhZC1vbmx5KQAAAAAACGdldF9nYW1lAAAAAQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAEAAAPpAAAH0AAAAAhTZWVwR2FtZQAAAAM=",
        "AAAAAAAAAHhTdWJtaXQgYSBiaWQgdmFsdWUuIE9ubHkgdGhlIGJpZGRlciAocGxheWVyIDEpIGNhbiBiaWQuClJlcXVpcmVzIFpLIHByb29mIHRoYXQgdGhlIGJpZGRlciBob2xkcyBhIGNhcmQgb2YgdGhlIGJpZCB2YWx1ZS4AAAAIbWFrZV9iaWQAAAAEAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAACWJpZF92YWx1ZQAAAAAAAAQAAAAAAAAABXByb29mAAAAAAAADgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAASRTdWJtaXQgYSBtb3ZlLiBUaGUgY29yZSBnYW1lIGFjdGlvbi4KCkZvciBtb3ZlIHR5cGVzIDItNiAoaG91c2UgYnVpbGRpbmcvY2VtZW50aW5nKSwgYSBaSyBwcm9vZiBpcyByZXF1aXJlZApwcm92aW5nIHRoZSBwbGF5ZXIgaG9sZHMgYSBjYXJkIG1hdGNoaW5nIHRoZSB0YXJnZXQgaG91c2UgdmFsdWUuCgpUaGUgZ2FtZSBzZXJ2ZXIgdmFsaWRhdGVzIHRoZSBmdWxsIG1vdmUgbG9naWMgb2ZmLWNoYWluOwpvbi1jaGFpbiB3ZSB2ZXJpZnkgdGhlIFpLIGNvbnN0cmFpbnQgYW5kIHVwZGF0ZSBzY29yZXMvcGhhc2UuAAAACW1ha2VfbW92ZQAAAAAAAAgAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAJbW92ZV90eXBlAAAAAAAABAAAAAAAAAAKY2FyZF92YWx1ZQAAAAAABAAAAAAAAAAMdGFyZ2V0X3ZhbHVlAAAABAAAAAAAAAALc2NvcmVfZGVsdGEAAAAABAAAAAAAAAAHaXNfc2VlcAAAAAABAAAAAAAAAAVwcm9vZgAAAAAAAA4AAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAGNTdGFydCBhIG5ldyBTZWVwIGdhbWUgYmV0d2VlbiB0d28gcGxheWVycy4KQ3JlYXRlcyBhIHNlc3Npb24gaW4gR2FtZUh1YiBhbmQgaW5pdGlhbGl6ZXMgZ2FtZSBzdGF0ZS4AAAAACnN0YXJ0X2dhbWUAAAAAAAUAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAAB3BsYXllcjEAAAAAEwAAAAAAAAAHcGxheWVyMgAAAAATAAAAAAAAAA5wbGF5ZXIxX3BvaW50cwAAAAAACwAAAAAAAAAOcGxheWVyMl9wb2ludHMAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAFZDb21taXQgdGhlIGhhc2ggb2YgYSBwbGF5ZXIncyBoYW5kLgpCb3RoIHBsYXllcnMgbXVzdCBjb21taXQgYmVmb3JlIGJpZGRpbmcgY2FuIGJlZ2luLgAAAAAAC2NvbW1pdF9oYW5kAAAAAAQAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAJaGFuZF9oYXNoAAAAAAAD7gAAACAAAAAAAAAAC2NhcmRzX2NvdW50AAAAAAQAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAIhVcGRhdGUgaGFuZCBoYXNoIGFmdGVyIGEgbmV3IGRlYWwgKGUuZy4sIGFmdGVyIGJpZCBtb3ZlIG9yIGJldHdlZW4gaGFsdmVzKS4KQ2FsbGVkIGJ5IHRoZSBnYW1lIHNlcnZlciB0byB1cGRhdGUgdGhlIGNvbW1pdHRlZCBoYW5kIGhhc2guAAAAC3VwZGF0ZV9oYW5kAAAAAAQAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAANbmV3X2hhbmRfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAA9uZXdfY2FyZHNfY291bnQAAAAABAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAMbmV3X3ZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAENJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIGFkbWluLCBHYW1lSHViLCBhbmQgdmVyaWZpZXIgYWRkcmVzc2VzAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAA="]),
      options
    );
  }

  public readonly fromJSON = {
    get_hub: this.txFromJSON<string>,
    set_hub: this.txFromJSON<null>,
    get_admin: this.txFromJSON<string>,
    set_admin: this.txFromJSON<null>,
    set_verifier: this.txFromJSON<null>,
    upgrade: this.txFromJSON<null>,
    get_game: this.txFromJSON<Result<Game>>,
    start_game: this.txFromJSON<Result<void>>,
    commit_hand: this.txFromJSON<Result<void>>,
    make_bid: this.txFromJSON<Result<void>>,
    make_move: this.txFromJSON<Result<void>>,
    update_hand: this.txFromJSON<Result<void>>,
    end_game: this.txFromJSON<Result<Option<string>>>,
  };
}