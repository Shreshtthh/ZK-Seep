import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import './SeepTable.css';
import {
  SeepGame, GamePhase as EnginePhase,
  MoveType, describeMoveType, moveRequiresZkProof, cardToString,
} from '@/game';
import type { Card, Pile, Move } from '@/game';
import { PlayingCard } from './components/PlayingCard';
import { FloorPile } from './components/FloorPile';
import { ScorePanel } from './components/ScorePanel';
import { BidPanel } from './components/BidPanel';
import { GameOverPanel } from './components/GameOverPanel';
import { useWallet } from '@/hooks/useWallet';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface ZkSeepGameProps {
  userAddress?: string;
  currentEpoch?: number;
  availablePoints?: bigint;
  initialXDR?: string | null;
  initialSessionId?: number | null;
  onStandingsRefresh?: () => void;
  onGameComplete?: () => void;
}

type LobbyMode = 'menu' | 'creating' | 'joining' | 'waiting';

type UIPhase =
  | 'lobby'
  | 'bidding'
  | 'playing'
  | 'game_over';

/** Messages sent between tabs via BroadcastChannel */
type SyncMessage =
  | { type: 'join' }
  | { type: 'seed'; seed: number }
  | { type: 'bid'; bidValue: number }
  | { type: 'move'; moveIdx: number };

/* ---- Persistence ---- */
const SAVE_KEY = 'zk-seep-game-state';

interface SavedGameState {
  seed: number;
  sessionId: number;
  myPlayerIdx: number;
  bidValue: number | null;
  moveIndices: number[];
}

/* ---- Pile description helper ---- */
const SUIT_SYMS = ['♠', '♥', '♦', '♣'];
function describePileBrief(pile: Pile): string {
  if (pile.cards.length === 1) {
    const c = pile.cards[0];
    const v = c.value <= 10 ? String(c.value) : c.value === 11 ? 'J' : c.value === 12 ? 'Q' : c.value === 13 ? 'K' : 'A';
    return `${v}${SUIT_SYMS[c.suit]}`;
  }
  return `pile(${pile.value}${pile.fixed ? '🔒' : ''})`;
}
function describeMoveOption(move: Move): string {
  if (!move.piles || move.piles.length === 0) return describeMoveType(move.type);
  const pileStr = move.piles.map(describePileBrief).join(' + ');
  return `${describeMoveType(move.type)}: ${pileStr}`;
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */
function getSnapshot(engine: SeepGame) {
  return engine.getState();
}
type GameSnapshot = ReturnType<typeof getSnapshot>;

function generateSessionId(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

/**
 * Find a seed that produces a valid initial deal
 * (bidder has at least one card >= 9).
 */
function findWorkingSeed(): number {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const seed = Math.floor(Math.random() * 2147483647);
    const game = new SeepGame();
    game.initializeWithSeed(seed, 0); // seed2=0 so combined seed = seed
    // initializeWithSeed calls dealInitialCards which sets phase to Bidding
    // only if bidder has eligible card. If it doesn't, phase stays WaitingForPlayers.
    if (game.phase === EnginePhase.Bidding) {
      return seed;
    }
  }
  // Fallback: extremely unlikely to reach here
  return Math.floor(Math.random() * 2147483647);
}

function initEngineFromSeed(seed: number): SeepGame {
  const game = new SeepGame();
  game.initializeWithSeed(seed, 0);
  return game;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function ZkSeepGame({
  onGameComplete,
}: ZkSeepGameProps) {
  const { publicKey, isConnected, isConnecting, connectFreighter } = useWallet();
  const engineRef = useRef<SeepGame | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const seedRef = useRef<number | null>(null);
  const moveLogRef = useRef<number[]>([]);

  /* ---- Session State ---- */
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('menu');
  const [myPlayerIdx, setMyPlayerIdx] = useState<number>(0);

  /* ---- UI State ---- */
  const [uiPhase, setUiPhase] = useState<UIPhase>('lobby');
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedMoveType, setSelectedMoveType] = useState<MoveType | null>(null);
  const [selectedMoveIdx, setSelectedMoveIdx] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [loading, setLoading] = useState(false);

  /* ---- Derived state ---- */
  const engine = engineRef.current;
  const currentPlayerIdx = snapshot?.currentPlayerIdx ?? 0;
  const isMyTurn = currentPlayerIdx === myPlayerIdx;
  const myName = myPlayerIdx === 0 ? 'You (P1)' : 'You (P2)';
  const opponentName = myPlayerIdx === 0 ? 'Opponent (P2)' : 'Opponent (P1)';

  const myHand = useMemo<Card[]>(() => {
    if (!engine) return [];
    return engine.players[myPlayerIdx].hand;
  }, [engine, myPlayerIdx, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const opponentHandSize = useMemo(() => {
    if (!engine) return 0;
    return engine.players[1 - myPlayerIdx].hand.length;
  }, [engine, myPlayerIdx, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const centerPiles = useMemo<Pile[]>(() => {
    return snapshot?.centerPiles ?? [];
  }, [snapshot]);

  /* ---- Legal moves ---- */
  const legalMoves = useMemo<Move[]>(() => {
    if (!engine || uiPhase !== 'playing' || !isMyTurn) return [];
    try { return engine.getLegalMoves(); } catch { return []; }
  }, [engine, uiPhase, isMyTurn, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const movesForCard = useMemo<Move[]>(() => {
    if (!selectedCard) return [];
    return legalMoves.filter(
      m => m.card.suit === selectedCard.suit && m.card.value === selectedCard.value
    );
  }, [legalMoves, selectedCard]);

  const availableMoveTypes = useMemo<MoveType[]>(() => {
    const types = new Set(movesForCard.map(m => m.type));
    return Array.from(types).sort((a, b) => a - b);
  }, [movesForCard]);

  /** Moves matching selected card + selected move type */
  const movesForCardAndType = useMemo<Move[]>(() => {
    if (selectedMoveType === null) return [];
    return movesForCard.filter(m => m.type === selectedMoveType);
  }, [movesForCard, selectedMoveType]);

  /* ---- Actions ---- */
  const showStatus = useCallback((msg: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setStatusMsg(msg);
    setStatusType(type);
    if (type !== 'error') setTimeout(() => setStatusMsg(null), 5000);
  }, []);

  const refreshSnapshot = useCallback(() => {
    if (engineRef.current) setSnapshot(getSnapshot(engineRef.current));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCard(null);
    setSelectedMoveType(null);
    setSelectedMoveIdx(null);
  }, []);

  /* ---- Persistence helpers ---- */
  const saveGameState = useCallback(() => {
    if (!seedRef.current || !sessionId) return;
    const state: SavedGameState = {
      seed: seedRef.current,
      sessionId,
      myPlayerIdx,
      bidValue: engineRef.current?.bidValue ?? null,
      moveIndices: [...moveLogRef.current],
    };
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch { /* quota exceeded — ignore */ }
  }, [sessionId, myPlayerIdx]);

  const clearSavedGame = useCallback(() => {
    sessionStorage.removeItem(SAVE_KEY);
    moveLogRef.current = [];
  }, []);

  /* ---- BroadcastChannel send ---- */
  const broadcast = useCallback((msg: SyncMessage) => {
    if (channelRef.current) {
      console.log('[sync] Sending:', msg.type, msg);
      channelRef.current.postMessage(msg);
    }
  }, []);

  /* ---- Open channel for a session ---- */
  const openChannel = useCallback((sid: number) => {
    if (channelRef.current) channelRef.current.close();
    const ch = new BroadcastChannel(`zk-seep-${sid}`);
    channelRef.current = ch;
    console.log(`[sync] Channel opened: zk-seep-${sid}`);
    return ch;
  }, []);

  /* ---- Cleanup channel on unmount ---- */
  useEffect(() => {
    return () => {
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  /* ---- Restore saved game on mount ---- */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved: SavedGameState = JSON.parse(raw);
      console.log('[restore] Found saved game, replaying...', saved);

      // Reconstruct engine from seed
      const game = initEngineFromSeed(saved.seed);

      // Replay bid
      if (saved.bidValue !== null) {
        game.setBid(saved.bidValue);
      }

      // Replay all moves
      for (const idx of saved.moveIndices) {
        const moves = game.getLegalMoves();
        if (idx >= 0 && idx < moves.length) {
          game.makeMove(moves[idx]);
        } else {
          console.warn('[restore] Invalid move index, stopping replay at', idx);
          break;
        }
      }

      // Restore refs and state
      engineRef.current = game;
      seedRef.current = saved.seed;
      moveLogRef.current = [...saved.moveIndices];
      setSessionId(saved.sessionId);
      setMyPlayerIdx(saved.myPlayerIdx);

      // Determine UI phase from engine
      const snap = getSnapshot(game);
      setSnapshot(snap);
      if (snap.phase === EnginePhase.GameOver) {
        setUiPhase('game_over');
        clearSavedGame();
      } else if (snap.phase === EnginePhase.Bidding) {
        setUiPhase('bidding');
      } else {
        setUiPhase('playing');
      }

      // Re-open channel for sync
      openChannel(saved.sessionId);
      setLobbyMode('creating');
      console.log('[restore] Game restored successfully');
    } catch (err) {
      console.warn('[restore] Failed to restore saved game:', err);
      sessionStorage.removeItem(SAVE_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Quit Game ---- */
  const handleQuit = useCallback(() => {
    clearSavedGame();
    if (channelRef.current) {
      channelRef.current.close();
      channelRef.current = null;
    }
    engineRef.current = null;
    seedRef.current = null;
    setSessionId(null);
    setJoinCode('');
    setLobbyMode('menu');
    setUiPhase('lobby');
    setSnapshot(null);
    clearSelection();
    setStatusMsg(null);
  }, [clearSavedGame, clearSelection]);

  /* ---- Wallet Connect ---- */
  const handleConnectWallet = useCallback(async () => {
    try {
      setLoading(true);
      await connectFreighter();
      showStatus('Wallet connected!', 'success');
    } catch (err) {
      showStatus(`Failed to connect: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [connectFreighter, showStatus]);

  /* ---- Create Game ---- */
  const handleCreateGame = useCallback(() => {
    if (!publicKey) {
      showStatus('Please connect your wallet first.', 'error');
      return;
    }

    const sid = generateSessionId();
    const seed = findWorkingSeed();
    seedRef.current = seed;

    // Init engine
    const game = initEngineFromSeed(seed);
    engineRef.current = game;
    moveLogRef.current = [];

    setSessionId(sid);
    setMyPlayerIdx(0);
    setLobbyMode('creating');

    // Open channel and listen for join
    const ch = openChannel(sid);
    ch.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      console.log('[sync] Creator received:', msg.type, msg);

      if (msg.type === 'join') {
        // Send seed to joiner
        ch.postMessage({ type: 'seed', seed } as SyncMessage);
        console.log('[sync] Sent seed to joiner:', seed);
      } else if (msg.type === 'bid') {
        // Opponent bid
        if (engineRef.current) {
          try {
            engineRef.current.setBid(msg.bidValue);
            setSnapshot(getSnapshot(engineRef.current));
            setUiPhase('playing');
            showStatus(`Opponent bid ${msg.bidValue}.`, 'info');
            // Persist after opponent bid
            try {
              const s: SavedGameState = { seed, sessionId: sid, myPlayerIdx: 0, bidValue: msg.bidValue, moveIndices: [...moveLogRef.current] };
              sessionStorage.setItem(SAVE_KEY, JSON.stringify(s));
            } catch { /* ignore */ }
          } catch (err) {
            console.error('[sync] Failed to apply opponent bid:', err);
          }
        }
      } else if (msg.type === 'move') {
        // Opponent move — apply the same move by index
        if (engineRef.current) {
          try {
            const allMoves = engineRef.current.getLegalMoves();
            const move = allMoves[msg.moveIdx];
            if (!move) throw new Error(`Invalid move index: ${msg.moveIdx}`);
            engineRef.current.makeMove(move);
            moveLogRef.current.push(msg.moveIdx);
            const snap = getSnapshot(engineRef.current);
            setSnapshot(snap);
            if (snap.phase === EnginePhase.GameOver) {
              setUiPhase('game_over');
              sessionStorage.removeItem(SAVE_KEY);
            } else {
              try {
                const s: SavedGameState = { seed, sessionId: sid, myPlayerIdx: 0, bidValue: engineRef.current.bidValue, moveIndices: [...moveLogRef.current] };
                sessionStorage.setItem(SAVE_KEY, JSON.stringify(s));
              } catch { /* ignore */ }
            }
            showStatus(`Opponent played ${describeMoveType(move.type)} with ${cardToString(move.card)}`, 'info');
          } catch (err) {
            console.error('[sync] Failed to apply opponent move:', err);
          }
        }
      }
    };

    refreshSnapshot();
    showStatus(`Room created! Code: ${sid}. Share it with your opponent.`, 'success');
  }, [publicKey, showStatus, openChannel, refreshSnapshot]);

  /* ---- Start Playing (after room created) ---- */
  const handleStartPlaying = useCallback(() => {
    setUiPhase('bidding');
    showStatus('Game started! Player 1 bids first.', 'success');
  }, [showStatus]);

  /* ---- Join Game ---- */
  const handleJoinGame = useCallback(() => {
    if (!publicKey) {
      showStatus('Please connect your wallet first.', 'error');
      return;
    }
    if (!joinCode.trim()) return;

    const sid = parseInt(joinCode.trim(), 10);
    if (isNaN(sid)) {
      showStatus('Invalid session code.', 'error');
      return;
    }

    setSessionId(sid);
    setMyPlayerIdx(1);
    setLobbyMode('waiting');

    // Open channel and send join request
    const ch = openChannel(sid);
    ch.onmessage = (event: MessageEvent<SyncMessage>) => {
      const msg = event.data;
      console.log('[sync] Joiner received:', msg.type, msg);

      if (msg.type === 'seed') {
        // Init engine with the same seed
        const game = initEngineFromSeed(msg.seed);
        engineRef.current = game;
        seedRef.current = msg.seed;
        moveLogRef.current = [];
        setSnapshot(getSnapshot(game));
        setUiPhase('bidding');
        showStatus('Connected! Waiting for Player 1 to bid...', 'success');
      } else if (msg.type === 'bid') {
        // Opponent bid
        if (engineRef.current) {
          try {
            engineRef.current.setBid(msg.bidValue);
            setSnapshot(getSnapshot(engineRef.current));
            setUiPhase('playing');
            showStatus(`Opponent bid ${msg.bidValue}.`, 'info');
            // Persist after opponent bid
            try {
              const s: SavedGameState = { seed: seedRef.current!, sessionId: sid, myPlayerIdx: 1, bidValue: msg.bidValue, moveIndices: [...moveLogRef.current] };
              sessionStorage.setItem(SAVE_KEY, JSON.stringify(s));
            } catch { /* ignore */ }
          } catch (err) {
            console.error('[sync] Failed to apply opponent bid:', err);
          }
        }
      } else if (msg.type === 'move') {
        // Opponent move — apply the same move by index
        if (engineRef.current) {
          try {
            const allMoves = engineRef.current.getLegalMoves();
            const move = allMoves[msg.moveIdx];
            if (!move) throw new Error(`Invalid move index: ${msg.moveIdx}`);
            engineRef.current.makeMove(move);
            moveLogRef.current.push(msg.moveIdx);
            const snap = getSnapshot(engineRef.current);
            setSnapshot(snap);
            if (snap.phase === EnginePhase.GameOver) {
              setUiPhase('game_over');
              sessionStorage.removeItem(SAVE_KEY);
            } else {
              try {
                const s: SavedGameState = { seed: seedRef.current!, sessionId: sid, myPlayerIdx: 1, bidValue: engineRef.current.bidValue, moveIndices: [...moveLogRef.current] };
                sessionStorage.setItem(SAVE_KEY, JSON.stringify(s));
              } catch { /* ignore */ }
            }
            showStatus(`Opponent played ${describeMoveType(move.type)} with ${cardToString(move.card)}`, 'info');
          } catch (err) {
            console.error('[sync] Failed to apply opponent move:', err);
          }
        }
      }
    };

    // Request seed from creator
    ch.postMessage({ type: 'join' } as SyncMessage);
    showStatus(`Joining session ${sid}...`, 'info');
  }, [publicKey, joinCode, showStatus, openChannel]);

  /* ---- Submit bid ---- */
  const handleBid = useCallback((bidValue: number) => {
    if (!engine) return;
    setLoading(true);
    try {
      engine.setBid(bidValue);
      refreshSnapshot();
      setUiPhase('playing');
      clearSelection();
      showStatus(`Bid ${bidValue}. Make your bid move!`, 'success');

      // Broadcast to opponent
      broadcast({ type: 'bid', bidValue });

      // Persist
      saveGameState();
    } catch (err) {
      showStatus(`Invalid bid: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [engine, refreshSnapshot, clearSelection, showStatus, broadcast]);

  /* ---- Execute a specific legal move by index ---- */
  const handleExecuteMove = useCallback((moveIdxOverride?: number) => {
    const idx = moveIdxOverride ?? selectedMoveIdx;
    if (!engine || idx === null || idx === undefined) return;

    // Resolve the move from the engine's current legal moves
    const allMoves = engine.getLegalMoves();
    if (idx < 0 || idx >= allMoves.length) {
      showStatus('Move is no longer valid — please re-select.', 'error');
      clearSelection();
      return;
    }
    const move = allMoves[idx];

    setLoading(true);
    try {
      const { zkTargetValue } = engine.makeMove(move);
      moveLogRef.current.push(idx);
      refreshSnapshot();

      // Broadcast the move INDEX to opponent
      broadcast({ type: 'move', moveIdx: idx });

      // Check if game ended
      const newSnap = getSnapshot(engine);
      if (newSnap.phase === EnginePhase.GameOver) {
        setUiPhase('game_over');
        clearSelection();
        clearSavedGame();
      } else {
        const zkNote = zkTargetValue !== null ? ` 🔐 ZK proof: value ${zkTargetValue}` : '';
        showStatus(
          `Played ${describeMoveType(move.type)} with ${cardToString(move.card)}${zkNote}`,
          'info',
        );
        clearSelection();
        saveGameState();
      }
    } catch (err) {
      showStatus(`Invalid move: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [engine, selectedMoveIdx, refreshSnapshot, clearSelection, showStatus, broadcast, saveGameState, clearSavedGame]);

  /* Card selection */
  const handleCardClick = useCallback((card: Card) => {
    if (!isMyTurn) return;
    if (selectedCard && selectedCard.suit === card.suit && selectedCard.value === card.value) {
      clearSelection();
    } else {
      setSelectedCard(card);
      setSelectedMoveType(null);
      setSelectedMoveIdx(null);
    }
  }, [selectedCard, clearSelection, isMyTurn]);

  const phaseLabel = useMemo(() => {
    const p = snapshot?.phase;
    if (!p) return '';
    switch (p) {
      case EnginePhase.Bidding: return 'Bidding';
      case EnginePhase.BidMove: return 'Bid Move';
      case EnginePhase.DealRemaining: return 'Dealing';
      case EnginePhase.FirstHalf: return 'First Half';
      case EnginePhase.SecondDeal: return 'Dealing';
      case EnginePhase.SecondHalf: return 'Second Half';
      case EnginePhase.GameOver: return 'Game Over';
      default: return String(p);
    }
  }, [snapshot?.phase]);

  /* ================================================================= */
  /*  RENDER                                                            */
  /* ================================================================= */

  /* ---- LOBBY ---- */
  if (uiPhase === 'lobby') {
    return (
      <div className="seep-table" style={{ justifyContent: 'center', alignItems: 'center', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 className="seep-header__title" style={{ fontSize: '2.4rem', marginBottom: '8px' }}>
            🔒 ZK Seep
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 24px' }}>
            A traditional South Asian card game with zero-knowledge proof verification on Stellar.
          </p>
        </div>

        {/* Wallet Connection */}
        {!isConnected ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '12px',
            padding: '20px', background: 'var(--glass)', borderRadius: '12px',
            border: '1px solid var(--glass-border)', maxWidth: '400px', width: '100%',
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '8px' }}>
              Connect your Stellar wallet to play
            </p>
            <button
              className="seep-btn seep-btn--gold"
              onClick={handleConnectWallet}
              disabled={loading || isConnecting}
              style={{ fontSize: '1rem', padding: '14px 36px', margin: '0 auto' }}
            >
              {loading || isConnecting ? '⏳ Connecting...' : '🔗 Connect Wallet'}
            </button>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'center', opacity: 0.7 }}>
              Requires <a href="https://freighter.app" target="_blank" rel="noopener" style={{ color: 'var(--accent-teal)' }}>Freighter</a> browser extension
            </p>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '16px',
            maxWidth: '460px', width: '100%',
          }}>
            {/* Connected wallet info */}
            <div style={{
              padding: '12px 16px', background: 'var(--glass)', borderRadius: '8px',
              border: '1px solid var(--glass-border)', textAlign: 'center',
            }}>
              <span style={{ color: 'var(--accent-teal)', fontSize: '0.75rem' }}>Connected: </span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                {publicKey?.substring(0, 8)}...{publicKey?.substring(publicKey.length - 6)}
              </span>
            </div>

            {/* Create / Join Buttons */}
            {lobbyMode === 'menu' && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  className="seep-btn seep-btn--gold"
                  onClick={handleCreateGame}
                  disabled={loading}
                  style={{ fontSize: '1rem', padding: '16px 32px' }}
                >
                  {loading ? 'Creating...' : '🎮 Create Game'}
                </button>
                <button
                  className="seep-btn seep-btn--primary"
                  onClick={() => setLobbyMode('joining')}
                  disabled={loading}
                  style={{ fontSize: '1rem', padding: '16px 32px' }}
                >
                  🔗 Join Game
                </button>
              </div>
            )}

            {/* Creating — show session ID */}
            {lobbyMode === 'creating' && sessionId && (
              <div style={{
                padding: '20px', background: 'var(--glass)', borderRadius: '12px',
                border: '1px solid var(--accent-gold)', textAlign: 'center',
              }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                  Share this code with your opponent:
                </p>
                <div style={{
                  fontSize: '2.4rem', fontWeight: 'bold', fontFamily: 'monospace',
                  color: 'var(--accent-gold)', letterSpacing: '6px', marginBottom: '16px',
                }}>
                  {sessionId}
                </div>
                <button
                  className="seep-btn seep-btn--gold"
                  onClick={handleStartPlaying}
                  style={{ fontSize: '0.9rem', padding: '12px 32px' }}
                >
                  ▶ Start Game
                </button>
                <button
                  className="seep-btn seep-btn--small"
                  onClick={() => {
                    setLobbyMode('menu');
                    setSessionId(null);
                    if (channelRef.current) channelRef.current.close();
                  }}
                  style={{ marginLeft: '12px' }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Joining — enter session ID */}
            {lobbyMode === 'joining' && (
              <div style={{
                padding: '20px', background: 'var(--glass)', borderRadius: '12px',
                border: '1px solid var(--glass-border)', textAlign: 'center',
              }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                  Enter the session code from your opponent:
                </p>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  style={{
                    width: '200px', textAlign: 'center', fontSize: '1.6rem', fontFamily: 'monospace',
                    letterSpacing: '4px', padding: '12px',
                    background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                    borderRadius: '8px', color: 'var(--text-primary)', outline: 'none',
                    marginBottom: '16px',
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleJoinGame()}
                />
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    className="seep-btn seep-btn--gold"
                    onClick={handleJoinGame}
                    disabled={loading || joinCode.trim().length < 1}
                    style={{ fontSize: '0.9rem', padding: '12px 32px' }}
                  >
                    {loading ? 'Joining...' : '🔗 Join'}
                  </button>
                  <button
                    className="seep-btn seep-btn--small"
                    onClick={() => { setLobbyMode('menu'); setJoinCode(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Waiting for seed from creator */}
            {lobbyMode === 'waiting' && (
              <div style={{
                padding: '20px', background: 'var(--glass)', borderRadius: '12px',
                border: '1px solid var(--glass-border)', textAlign: 'center',
              }}>
                <p style={{ color: 'var(--accent-gold)', fontSize: '1rem', marginBottom: '8px' }}>
                  ⏳ Connecting to game...
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Waiting for the host to start. Make sure they have the game screen open.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Status */}
        {statusMsg && (
          <div className={`seep-status seep-status--${statusType}`}>{statusMsg}</div>
        )}

        {/* Decorative card fan */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '16px', opacity: 0.6 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="playing-card playing-card--face-down playing-card--small"
              style={{ transform: `rotate(${(i - 2) * 8}deg) translateY(${Math.abs(i - 2) * 4}px)` }} />
          ))}
        </div>
      </div>
    );
  }

  /* ---- GAME TABLE ---- */
  return (
    <div className="seep-table">
      {/* Header */}
      <div className="seep-header">
        <div className="seep-header__title">🔒 ZK Seep</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="seep-header__phase">{phaseLabel}</span>
          {sessionId && (
            <span style={{
              fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px',
              background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)',
              fontFamily: 'monospace',
            }}>
              Room: {sessionId}
            </span>
          )}
          <span className={`seep-turn-indicator ${isMyTurn ? 'seep-turn-indicator--your-turn' : ''}`}>
            ● {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
          <button
            className="seep-btn seep-btn--small"
            onClick={handleQuit}
            style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '4px 10px', opacity: 0.8 }}
          >
            ✕ Quit
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {statusMsg && (
        <div className={`seep-status seep-status--${statusType}`}>{statusMsg}</div>
      )}

      {/* Scores */}
      {snapshot && (
        <ScorePanel
          player1Label={myPlayerIdx === 0 ? myName : opponentName}
          player2Label={myPlayerIdx === 1 ? myName : opponentName}
          player1Score={snapshot.player1Score}
          player2Score={snapshot.player2Score}
          player1Seeps={snapshot.player1Seeps}
          player2Seeps={snapshot.player2Seeps}
          activePlayer={currentPlayerIdx === 0 ? 1 : 2}
          cardsLeft={[snapshot.player1HandSize, snapshot.player2HandSize]}
        />
      )}

      {/* Opponent Hand (face-down) */}
      <div className="seep-opponent-hand">
        <div className="seep-hand__label">{opponentName}</div>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {Array.from({ length: opponentHandSize }, (_, i) => (
            <PlayingCard key={i} small />
          ))}
        </div>
      </div>

      {/* Floor */}
      <div className="seep-floor">
        <div className="seep-floor__label">Floor</div>
        {centerPiles.length === 0 ? (
          <div className="seep-floor__empty">No piles on the floor</div>
        ) : (
          <div className="seep-floor__piles">
            {centerPiles.map((pile, i) => (
              <FloorPile
                key={`pile-${i}-${pile.value}`}
                pile={pile} index={i}
                selectable={false}
                selected={false}
                onClick={() => { }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bidding Phase */}
      {uiPhase === 'bidding' && isMyTurn && (
        <BidPanel
          playerName={myName}
          hand={myHand}
          onBid={handleBid}
          disabled={loading}
          loading={loading}
        />
      )}

      {uiPhase === 'bidding' && !isMyTurn && (
        <div style={{
          padding: '20px', textAlign: 'center',
          background: 'var(--glass)', borderRadius: '12px',
          border: '1px solid var(--glass-border)',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Waiting for <strong style={{ color: 'var(--accent-gold)' }}>{opponentName}</strong> to bid...
          </p>
        </div>
      )}

      {/* Game Over */}
      {uiPhase === 'game_over' && snapshot?.result && (
        <GameOverPanel
          winnerLabel={snapshot.result.winner === myPlayerIdx ? myName : opponentName}
          loserLabel={snapshot.result.winner === myPlayerIdx ? opponentName : myName}
          winnerScore={snapshot.result.winner === 0 ? snapshot.result.player1Score : snapshot.result.player2Score}
          loserScore={snapshot.result.winner === 0 ? snapshot.result.player2Score : snapshot.result.player1Score}
          winnerSeeps={snapshot.result.winner === 0 ? snapshot.result.player1Seeps : snapshot.result.player2Seeps}
          isCurrentPlayerWinner={snapshot.result.winner === myPlayerIdx}
          onNewGame={() => {
            engineRef.current = null;
            setSnapshot(null);
            setUiPhase('lobby');
            setSessionId(null);
            setLobbyMode('menu');
            clearSelection();
            if (channelRef.current) channelRef.current.close();
            onGameComplete?.();
          }}
        />
      )}

      {/* My Hand */}
      {(uiPhase === 'playing' || uiPhase === 'bidding') && (
        <div className="seep-hand">
          <div className="seep-hand__label">{myName}'s Hand</div>
          {myHand.map((card, i) => (
            <PlayingCard
              key={`hand-${card.suit}-${card.value}-${i}`}
              card={card}
              selectable={uiPhase === 'playing' && isMyTurn}
              selected={selectedCard !== null && selectedCard.suit === card.suit && selectedCard.value === card.value}
              onClick={() => uiPhase === 'playing' && handleCardClick(card)}
            />
          ))}
        </div>
      )}

      {/* Waiting for opponent indicator */}
      {uiPhase === 'playing' && !isMyTurn && (
        <div style={{
          padding: '16px 24px', textAlign: 'center',
          background: 'var(--glass)', borderRadius: '12px',
          border: '1px solid var(--glass-border)', marginTop: '8px',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            ⏳ Waiting for <strong style={{ color: 'var(--accent-gold)' }}>{opponentName}</strong> to play...
          </p>
        </div>
      )}

      {/* Move Action Bar */}
      {uiPhase === 'playing' && isMyTurn && selectedCard && (
        <div className="seep-actions">
          {/* Step 1: Choose move type */}
          <div className="seep-move-types" style={{ width: '100%' }}>
            {availableMoveTypes.map(type => (
              <button
                key={type}
                className={[
                  'seep-move-chip',
                  selectedMoveType === type && 'seep-move-chip--active',
                  moveRequiresZkProof(type) && 'seep-move-chip--zk',
                ].filter(Boolean).join(' ')}
                onClick={() => { setSelectedMoveType(type); setSelectedMoveIdx(null); }}
              >
                {describeMoveType(type)}
              </button>
            ))}
            {availableMoveTypes.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                No moves available for this card
              </span>
            )}
          </div>

          {/* Step 2: If move type selected, show specific pile combinations */}
          {selectedMoveType !== null && movesForCardAndType.length > 0 && (
            <div style={{ width: '100%' }}>
              {movesForCardAndType.length === 1 ? (
                /* Single option — auto-show it */
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {describeMoveOption(movesForCardAndType[0])}
                  </span>
                </div>
              ) : (
                /* Multiple options — let user pick */
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '4px',
                  maxHeight: '160px', overflowY: 'auto', marginBottom: '8px',
                }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'center', marginBottom: '4px' }}>
                    Choose which piles:
                  </p>
                  {movesForCardAndType.map((move, i) => {
                    // Find this move's index in the full legalMoves array
                    const globalIdx = legalMoves.findIndex(m =>
                      m.type === move.type &&
                      m.card.suit === move.card.suit && m.card.value === move.card.value &&
                      JSON.stringify(m.piles?.map(p => p.value)) === JSON.stringify(move.piles?.map(p => p.value))
                    );
                    return (
                      <button
                        key={i}
                        className={[
                          'seep-move-chip',
                          selectedMoveIdx === globalIdx && 'seep-move-chip--active',
                        ].filter(Boolean).join(' ')}
                        style={{ width: '100%', borderRadius: '8px', textAlign: 'left', padding: '8px 12px' }}
                        onClick={() => setSelectedMoveIdx(globalIdx)}
                      >
                        {describeMoveOption(move)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button
            className="seep-btn seep-btn--primary"
            onClick={() => {
              if (movesForCardAndType.length === 1) {
                // Auto-select the single option
                const globalIdx = legalMoves.findIndex(m =>
                  m.type === movesForCardAndType[0].type &&
                  m.card.suit === movesForCardAndType[0].card.suit &&
                  m.card.value === movesForCardAndType[0].card.value &&
                  JSON.stringify(m.piles?.map(p => p.value)) === JSON.stringify(movesForCardAndType[0].piles?.map(p => p.value))
                );
                handleExecuteMove(globalIdx);
              } else {
                handleExecuteMove();
              }
            }}
            disabled={loading || selectedMoveType === null || (movesForCardAndType.length > 1 && selectedMoveIdx === null)}
          >
            {loading ? 'Playing...' : `Play: ${selectedMoveType !== null ? describeMoveType(selectedMoveType) : '—'}`}
          </button>

          <button className="seep-btn seep-btn--small" onClick={clearSelection}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
