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
    contractId: "CBMD4JH436B663IZAQLX5RHNYICU4COZQIXOOLWQU6HVM2W555CGNCDM",
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
      // NOTE: This spec is a placeholder — the actual calls go through
      // the standard ContractClient machinery which builds XDR from
      // method names + args. For proper spec, run:
      //   stellar contract bindings typescript --contract-id <ID> --network testnet
      new ContractSpec([]),
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