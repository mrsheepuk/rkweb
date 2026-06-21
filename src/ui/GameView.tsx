import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "../state/model";
import { buildIndex, currentPlayerId } from "../state/engine";
import { commitTurn, drawTile, publishDraft, subscribeDraft, type Draft } from "../sync/gameSync";
import type { MeldIds } from "../game/rules";
import { Board, type BoardHandle } from "./Board";
import { isMuted, playTurnComplete, playWin, setMuted } from "./sounds";

const DRAFT_THROTTLE_MS = 300;

export function GameView({
  game,
  me,
  onLeave,
}: {
  game: GameState;
  me: string;
  onLeave: () => void;
}) {
  const index = useMemo(() => buildIndex(game), [game.seed]);
  const handle = useRef<BoardHandle>({ table: game.table, rack: game.hands[me] ?? [] });
  const [resetNonce, setResetNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [draft, setDraft] = useState<Draft | null>(null);

  // Watch the active player's in-progress turn (quasi-real-time).
  useEffect(() => {
    const unsub = subscribeDraft(game.id, setDraft);
    return unsub;
  }, [game.id]);

  // Play a chime whenever a turn passes (any player) and a flourish on a win.
  const prevTurn = useRef(game.currentTurn);
  const prevStatus = useRef(game.status);
  useEffect(() => {
    if (game.status === "finished" && prevStatus.current !== "finished") {
      playWin();
    } else if (game.status === "playing" && game.currentTurn !== prevTurn.current) {
      playTurnComplete();
    }
    prevTurn.current = game.currentTurn;
    prevStatus.current = game.status;
  }, [game.currentTurn, game.status]);

  const activeId = currentPlayerId(game);
  const myTurn = activeId === me && game.status === "playing";
  const players = Object.values(game.players).sort((a, b) => a.seat - b.seat);
  const myRack = game.hands[me] ?? [];
  const opened = game.hasOpened[me];

  // When spectating, mirror the active player's live draft (if it's for the
  // current turn) instead of the committed table.
  const liveDraft =
    !myTurn && draft && draft.turn === game.currentTurn && draft.uid === activeId ? draft : null;
  const boardTable = myTurn ? game.table : liveDraft?.table ?? game.table;

  // Throttle draft publishing to keep writes human-paced, and skip when the
  // table is unchanged (e.g. the player only rearranged their own rack).
  const publish = useRef<{ at: number; timer: ReturnType<typeof setTimeout> | null; last: string }>({
    at: 0,
    timer: null,
    last: "",
  });
  function publishLater(table: MeldIds[]) {
    const key = JSON.stringify(table);
    if (key === publish.current.last) return;
    publish.current.last = key;
    if (publish.current.timer) clearTimeout(publish.current.timer);
    const fire = () => {
      publish.current.at = Date.now();
      publish.current.timer = null;
      void publishDraft(game.id, game.currentTurn, table).catch(() => undefined);
    };
    const since = Date.now() - publish.current.at;
    if (since >= DRAFT_THROTTLE_MS) fire();
    else publish.current.timer = setTimeout(fire, DRAFT_THROTTLE_MS - since);
  }
  function cancelPendingPublish() {
    if (publish.current.timer) clearTimeout(publish.current.timer);
    publish.current.timer = null;
  }
  useEffect(() => cancelPendingPublish, []);

  async function onDraw() {
    cancelPendingPublish();
    setBusy(true);
    setError(null);
    try {
      await drawTile(game.id);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    cancelPendingPublish();
    setBusy(true);
    setError(null);
    try {
      await commitTurn(game.id, handle.current.table, handle.current.rack);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function onReset() {
    setError(null);
    setResetNonce((k) => k + 1);
  }

  const winner = game.winnerId ? game.players[game.winnerId]?.name : null;

  return (
    <div className="game">
      <header className="game-bar">
        <div className="turn-track">
          {players.map((p) => {
            const handCount = game.hands[p.uid]?.length ?? 0;
            return (
              <div
                key={p.uid}
                className={`turn-chip${p.uid === activeId ? " active" : ""}${p.uid === me ? " me" : ""}`}
              >
                <span className="chip-name">{p.name}</span>
                <span className="chip-count">{handCount}</span>
              </div>
            );
          })}
        </div>
        <div className="game-meta">
          <span className="pool-count">Pool: {game.pool.length}</span>
          <button
            className="btn btn-link"
            title={muted ? "Unmute sounds" : "Mute sounds"}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="btn btn-link" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      {game.status === "finished" && (
        <div className="winner-banner">🎉 {winner ?? "Someone"} wins!</div>
      )}

      <Board
        committedTable={boardTable}
        hand={myRack}
        index={index}
        myTurn={myTurn}
        storageKey={`rummle:rack:${game.id}:${me}`}
        resetNonce={resetNonce}
        onChange={(h) => {
          handle.current = h;
          if (myTurn) publishLater(h.table);
        }}
      />

      {error && <p className="error game-error">{error}</p>}

      <footer className="action-bar">
        {game.status === "finished" ? (
          <span className="hint">Game over.</span>
        ) : myTurn ? (
          <>
            {!opened && <span className="hint">Opening play must total 30+ points.</span>}
            <button className="btn" disabled={busy} onClick={onReset}>
              Reset
            </button>
            <button className="btn" disabled={busy} onClick={onDraw}>
              Draw &amp; pass
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={onCommit}>
              Commit play
            </button>
          </>
        ) : (
          <span className="hint">
            {game.players[activeId ?? ""]?.name ?? "…"}
            {liveDraft ? " is making their move…" : " is thinking…"}
          </span>
        )}
      </footer>
    </div>
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
