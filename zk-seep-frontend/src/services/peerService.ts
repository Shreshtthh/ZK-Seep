/**
 * Multiplayer messaging service.
 *
 * On localhost: uses BroadcastChannel (instant, no network needed).
 * On deployed URLs: uses PeerJS WebRTC for cross-device play.
 *
 * Both modes expose the same API: createRoom / joinRoom / send / cleanup.
 */
import Peer, { DataConnection } from 'peerjs';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type SyncMessage =
  | { type: 'join'; address: string }
  | { type: 'seed_and_auth'; seed: number; sessionId: number; hostAddress: string; authXdr: string; txXdr: string }
  | { type: 'start_game_success' }
  | { type: 'hand_committed' }
  | { type: 'bid'; bidValue: number }
  | { type: 'move'; moveIdx: number };

export type MessageHandler = (msg: SyncMessage) => void;

/* ------------------------------------------------------------------ */
/*  Detect mode                                                        */
/* ------------------------------------------------------------------ */
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/* ------------------------------------------------------------------ */
/*  PeerService                                                        */
/* ------------------------------------------------------------------ */
export class PeerService {
  // PeerJS state (cross-device)
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  // BroadcastChannel state (local)
  private bc: BroadcastChannel | null = null;

  private onMessage: MessageHandler | null = null;
  private _roomCode: string | null = null;
  private _connected = false;

  get roomCode() {
    return this._roomCode;
  }

  get isConnected() {
    if (IS_LOCAL) return this._connected;
    return this.conn !== null && this.conn.open;
  }

  /* ================================================================ */
  /*  Host: create a room                                              */
  /* ================================================================ */
  createRoom(onMessage: MessageHandler): Promise<string> {
    this.cleanup();
    this.onMessage = onMessage;

    if (IS_LOCAL) return this.createRoomBC();
    return this.createRoomPeer();
  }

  /* ================================================================ */
  /*  Joiner: connect to a room                                        */
  /* ================================================================ */
  joinRoom(roomCode: string, onMessage: MessageHandler): Promise<void> {
    this.cleanup();
    this.onMessage = onMessage;
    this._roomCode = roomCode;

    if (IS_LOCAL) return this.joinRoomBC(roomCode);
    return this.joinRoomPeer(roomCode);
  }

  /* ================================================================ */
  /*  Send                                                             */
  /* ================================================================ */
  send(msg: SyncMessage) {
    console.log('[sync] Sending:', msg.type, msg);

    if (IS_LOCAL) {
      if (this.bc) {
        this.bc.postMessage(msg);
      } else {
        console.warn('[sync] Cannot send — no BroadcastChannel');
      }
      return;
    }

    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    } else {
      console.warn('[sync] Cannot send — no open PeerJS connection');
    }
  }

  /* ================================================================ */
  /*  Cleanup                                                          */
  /* ================================================================ */
  cleanup() {
    // BroadcastChannel
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    // PeerJS
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this._roomCode = null;
    this._connected = false;
    this.onMessage = null;
  }

  /* ================================================================ */
  /*  BroadcastChannel implementation (localhost)                       */
  /* ================================================================ */

  private createRoomBC(): Promise<string> {
    // Generate a room code
    const roomCode = crypto.randomUUID();
    this._roomCode = roomCode;

    // Create channel named after the room code
    const bc = new BroadcastChannel(`zk-seep-${roomCode}`);
    this.bc = bc;

    bc.onmessage = (event) => {
      const msg = event.data as SyncMessage;
      console.log('[bc] Received:', msg.type, msg);
      this._connected = true;
      if (this.onMessage) this.onMessage(msg);
    };

    console.log('[bc] Room created, code:', roomCode);
    return Promise.resolve(roomCode);
  }

  private joinRoomBC(roomCode: string): Promise<void> {
    const bc = new BroadcastChannel(`zk-seep-${roomCode}`);
    this.bc = bc;

    bc.onmessage = (event) => {
      const msg = event.data as SyncMessage;
      console.log('[bc] Received:', msg.type, msg);
      this._connected = true;
      if (this.onMessage) this.onMessage(msg);
    };

    this._connected = true;
    console.log('[bc] Joined room:', roomCode);
    return Promise.resolve();
  }

  /* ================================================================ */
  /*  PeerJS implementation (cross-device / deployed)                   */
  /* ================================================================ */

  private createRoomPeer(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use public Google STUN servers for NAT traversal on testnet/deployed URLs
      const peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ]
        }
      });
      this.peer = peer;

      peer.on('open', (id) => {
        this._roomCode = id;
        console.log('[peer] Room created, code:', id);
        resolve(id);
      });

      peer.on('connection', (conn) => {
        console.log('[peer] Peer connected:', conn.peer);
        this.conn = conn;
        this.setupPeerConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('[peer] Error:', err);
        reject(err);
      });
    });
  }

  private joinRoomPeer(roomCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ]
        }
      });
      this.peer = peer;

      peer.on('open', () => {
        console.log('[peer] Connecting to room:', roomCode);
        const conn = peer.connect(roomCode, { reliable: true });
        this.conn = conn;

        conn.on('open', () => {
          console.log('[peer] Connected to host');
          this.setupPeerConnection(conn);
          resolve();
        });

        conn.on('error', (err) => {
          console.error('[peer] Connection error:', err);
          reject(err);
        });
      });

      peer.on('error', (err) => {
        console.error('[peer] Peer error:', err);
        reject(err);
      });
    });
  }

  private setupPeerConnection(conn: DataConnection) {
    conn.on('data', (data) => {
      const msg = data as SyncMessage;
      console.log('[peer] Received:', msg.type, msg);
      if (this.onMessage) this.onMessage(msg);
    });

    conn.on('close', () => {
      console.log('[peer] Connection closed');
      this.conn = null;
    });

    conn.on('error', (err) => {
      console.error('[peer] Connection error:', err);
    });
  }
}

/** Singleton for use throughout the app */
export const peerService = new PeerService();
