/**
 * PeerJS wrapper for cross-device multiplayer.
 *
 * Host creates a room (Peer instance), joiner connects using the host's Peer ID.
 * Messages are the same shape as the old BroadcastChannel SyncMessage.
 */
import Peer, { DataConnection } from 'peerjs';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type SyncMessage =
  | { type: 'join' }
  | { type: 'seed'; seed: number }
  | { type: 'bid'; bidValue: number }
  | { type: 'move'; moveIdx: number };

export type MessageHandler = (msg: SyncMessage) => void;

/* ------------------------------------------------------------------ */
/*  PeerService                                                         */
/* ------------------------------------------------------------------ */
export class PeerService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private onMessage: MessageHandler | null = null;
  private _roomCode: string | null = null;

  /** Resolves once the local Peer is registered with the signaling server. */
  private peerReady: Promise<string> | null = null;

  get roomCode() {
    return this._roomCode;
  }

  get isConnected() {
    return this.conn !== null && this.conn.open;
  }

  /* ---- Host: create a room ---- */
  createRoom(onMessage: MessageHandler): Promise<string> {
    this.cleanup();
    this.onMessage = onMessage;

    return new Promise((resolve, reject) => {
      // Let PeerJS assign a random ID (acts as the room code)
      const peer = new Peer();
      this.peer = peer;

      peer.on('open', (id) => {
        this._roomCode = id;
        console.log('[peer] Room created, code:', id);
        resolve(id);
      });

      peer.on('connection', (conn) => {
        console.log('[peer] Peer connected:', conn.peer);
        this.conn = conn;
        this.setupConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('[peer] Error:', err);
        reject(err);
      });
    });
  }

  /* ---- Joiner: connect to a room ---- */
  joinRoom(roomCode: string, onMessage: MessageHandler): Promise<void> {
    this.cleanup();
    this.onMessage = onMessage;
    this._roomCode = roomCode;

    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;

      peer.on('open', () => {
        console.log('[peer] Connecting to room:', roomCode);
        const conn = peer.connect(roomCode, { reliable: true });
        this.conn = conn;

        conn.on('open', () => {
          console.log('[peer] Connected to host');
          this.setupConnection(conn);
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

  /* ---- Send ---- */
  send(msg: SyncMessage) {
    if (this.conn && this.conn.open) {
      console.log('[peer] Sending:', msg.type, msg);
      this.conn.send(msg);
    } else {
      console.warn('[peer] Cannot send — no open connection');
    }
  }

  /* ---- Cleanup ---- */
  cleanup() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this._roomCode = null;
    this.onMessage = null;
  }

  /* ---- Internal ---- */
  private setupConnection(conn: DataConnection) {
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
