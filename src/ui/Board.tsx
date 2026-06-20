import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Tile } from "../game/types";
import type { MeldIds } from "../game/rules";
import { analyzeMeld } from "../game/melds";
import { rackSortKey } from "../game/tiles";
import { TileView } from "./TileView";

const RACK_ROWS = ["rack-0", "rack-1", "rack-2"];
const RACK_ROW_COUNT = RACK_ROWS.length;
const NEW_MELD = "new-meld";

type Containers = Record<string, string[]>;

export interface BoardHandle {
  table: MeldIds[];
  rack: string[];
}

// Prefer the drop zone directly under the pointer, then any it overlaps, and
// only fall back to nearest-corner. Without this, a large/wrapped drop zone
// (e.g. the full-width "new meld" box on its own line) loses out to a nearer
// existing meld's corner, so tiles can't be dropped onto it.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  const rects = rectIntersection(args);
  if (rects.length > 0) return rects;
  return closestCorners(args);
};

const isMeldKey = (k: string) => k.startsWith("meld-");
const isRackKey = (k: string) => k.startsWith("rack-");
const meldNum = (k: string) => Number(k.slice(5));

/** Splits an ordered id list across the rack rows, roughly balanced. */
function chunkRows(ids: string[]): string[][] {
  const out: string[][] = Array.from({ length: RACK_ROW_COUNT }, () => []);
  const per = Math.ceil(ids.length / RACK_ROW_COUNT) || 1;
  ids.forEach((id, i) => out[Math.min(RACK_ROW_COUNT - 1, Math.floor(i / per))]!.push(id));
  return out;
}

/**
 * Reconciles the rack rows with the set of tiles that *should* be in the rack:
 * keeps tiles already placed where the player put them, drops tiles no longer
 * present (played/committed), and appends genuinely new tiles (drawn) to the
 * shortest row. This is what makes a player's hand-sorting persist across other
 * players' turns instead of being reset.
 */
function reconcileRows(rows: string[][], wanted: string[]): string[][] {
  const want = new Set(wanted);
  const seen = new Set<string>();
  const kept: string[][] = [];
  for (let i = 0; i < RACK_ROW_COUNT; i++) {
    const src = rows[i] ?? [];
    kept.push(src.filter((id) => want.has(id) && !seen.has(id) && (seen.add(id), true)));
  }
  for (const id of wanted) {
    if (seen.has(id)) continue;
    let t = 0;
    for (let i = 1; i < RACK_ROW_COUNT; i++) if (kept[i]!.length < kept[t]!.length) t = i;
    kept[t]!.push(id);
    seen.add(id);
  }
  return kept;
}

function loadRack(key: string): string[][] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(parsed) && parsed.every((r) => Array.isArray(r))) return parsed as string[][];
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

/**
 * The play surface. The committed game state is the source of truth; the table
 * working copy is editable only on your turn, while the rack can always be
 * rearranged (mirroring the physical three-row tile holder). Rack layout is
 * reconciled — not reset — on updates, and persisted to localStorage.
 */
export function Board({
  committedTable,
  hand,
  index,
  myTurn,
  storageKey,
  resetNonce,
  onChange,
}: {
  committedTable: MeldIds[];
  hand: string[];
  index: Map<string, Tile>;
  myTurn: boolean;
  storageKey: string;
  resetNonce: number;
  onChange: (handle: BoardHandle) => void;
}) {
  const committedKey = useMemo(() => JSON.stringify(committedTable), [committedTable]);
  const handKey = useMemo(() => JSON.stringify(hand), [hand]);

  const [containers, setContainers] = useState<Containers>(() => {
    const init: Containers = {};
    const saved = loadRack(storageKey);
    const rows = saved ? reconcileRows(saved, hand) : chunkRows([...hand]);
    RACK_ROWS.forEach((k, i) => (init[k] = rows[i] ?? []));
    committedTable.forEach((m, i) => (init[`meld-${i}`] = [...m]));
    return init;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const nextMeldId = useRef(committedTable.length);

  const prevMyTurn = useRef(myTurn);
  const prevReset = useRef(resetNonce);
  const prevCommitted = useRef(committedKey);

  // Sync working state with external changes (turn boundaries, opponents'
  // moves, draws, resets) without clobbering an in-progress play or the rack
  // sort. The table is re-seeded from the committed state only when it should
  // be; the rack is always reconciled rather than reset.
  useEffect(() => {
    setContainers((prev) => {
      const next: Containers = { ...prev };
      const committedSet = new Set(committedTable.flat());

      const reseedTable =
        !myTurn ||
        prevMyTurn.current !== myTurn ||
        prevReset.current !== resetNonce ||
        prevCommitted.current !== committedKey;

      if (reseedTable) {
        for (const k of Object.keys(next)) if (isMeldKey(k)) delete next[k];
        committedTable.forEach((m, i) => (next[`meld-${i}`] = [...m]));
        nextMeldId.current = committedTable.length;
      }

      // Tiles staged from hand onto the table this turn shouldn't reappear in
      // the rack.
      const staged = new Set(
        Object.keys(next)
          .filter(isMeldKey)
          .flatMap((k) => next[k] ?? [])
          .filter((id) => !committedSet.has(id)),
      );
      const wanted = hand.filter((id) => !staged.has(id));
      const reconciled = reconcileRows(
        RACK_ROWS.map((k) => next[k] ?? []),
        wanted,
      );
      RACK_ROWS.forEach((k, i) => (next[k] = reconciled[i] ?? []));
      return next;
    });
    prevMyTurn.current = myTurn;
    prevReset.current = resetNonce;
    prevCommitted.current = committedKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, committedKey, handKey, resetNonce]);

  const containersKey = JSON.stringify(containers);

  // Persist rack layout and report the current table/rack up for committing.
  useEffect(() => {
    const rackRows = RACK_ROWS.map((k) => containers[k] ?? []);
    try {
      localStorage.setItem(storageKey, JSON.stringify(rackRows));
    } catch {
      /* ignore storage failures */
    }
    const table = Object.keys(containers)
      .filter(isMeldKey)
      .sort((a, b) => meldNum(a) - meldNum(b))
      .map((k) => containers[k] ?? [])
      .filter((m) => m.length > 0);
    onChange({ table, rack: rackRows.flat() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containersKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findContainer(id: string): string | undefined {
    if (id in containers) return id;
    return Object.keys(containers).find((key) => containers[key]!.includes(id));
  }

  function materializeNewMeld(): string {
    const key = `meld-${nextMeldId.current++}`;
    setContainers((prev) => ({ ...prev, [key]: [] }));
    return key;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(String(active.id));
    let to = findContainer(String(over.id)) ?? String(over.id);
    if (to === NEW_MELD) {
      if (!myTurn) return;
      to = materializeNewMeld();
    }
    if (!from || from === to) return;
    // Off-turn, tiles may only move between rack rows — the table is locked.
    if (!myTurn && !isRackKey(to)) return;

    setContainers((prev) => {
      const fromItems = prev[from] ?? [];
      const toItems = prev[to] ?? [];
      if (!fromItems.includes(String(active.id))) return prev;
      const overIndex = toItems.indexOf(String(over.id));
      const insertAt = overIndex >= 0 ? overIndex : toItems.length;
      return {
        ...prev,
        [from]: fromItems.filter((t) => t !== String(active.id)),
        [to]: [...toItems.slice(0, insertAt), String(active.id), ...toItems.slice(insertAt)],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const container = findContainer(String(active.id));
    if (!container || container !== findContainer(String(over.id))) return;
    const items = containers[container]!;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex !== newIndex && newIndex >= 0) {
      setContainers((prev) => ({ ...prev, [container]: arrayMove(prev[container]!, oldIndex, newIndex) }));
    }
  }

  function sortRack() {
    setContainers((prev) => {
      const all = RACK_ROWS.flatMap((k) => prev[k] ?? []);
      all.sort((a, b) => {
        const ta = index.get(a);
        const tb = index.get(b);
        return ta && tb ? rackSortKey(ta) - rackSortKey(tb) : 0;
      });
      const rows = chunkRows(all);
      const next = { ...prev };
      RACK_ROWS.forEach((k, i) => (next[k] = rows[i] ?? []));
      return next;
    });
  }

  const activeTile = activeId ? index.get(activeId) : null;
  const meldKeys = Object.keys(containers)
    .filter(isMeldKey)
    .sort((a, b) => meldNum(a) - meldNum(b))
    .filter((k) => (containers[k] ?? []).length > 0);
  const rackCount = RACK_ROWS.reduce((n, k) => n + (containers[k]?.length ?? 0), 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="table-area">
        {meldKeys.length === 0 && <p className="table-empty">No melds on the table yet.</p>}
        {meldKeys.map((key) => (
          <MeldRow key={key} id={key} items={containers[key] ?? []} index={index} tilesDisabled={!myTurn} variant="meld" />
        ))}
        {myTurn && <NewMeldDrop />}
      </div>

      <div className="rack-area">
        <div className="rack-header">
          <span>Your tiles ({rackCount})</span>
          <button className="btn btn-small" onClick={sortRack} type="button">
            Sort
          </button>
        </div>
        <div className="rack-rows">
          {RACK_ROWS.map((k) => (
            <MeldRow key={k} id={k} items={containers[k] ?? []} index={index} tilesDisabled={false} variant="rack" />
          ))}
        </div>
      </div>

      <DragOverlay>{activeTile ? <TileView tile={activeTile} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function MeldRow({
  id,
  items,
  index,
  tilesDisabled,
  variant,
}: {
  id: string;
  items: string[];
  index: Map<string, Tile>;
  tilesDisabled: boolean;
  variant: "rack" | "meld";
}) {
  const { setNodeRef } = useDroppable({ id });
  const tiles = items.map((tid) => index.get(tid)).filter(Boolean) as Tile[];
  const analysis = variant === "meld" && items.length > 0 ? analyzeMeld(tiles) : null;
  const cls = [
    "meld-row",
    variant === "rack" ? "rack-row" : "meld",
    analysis && !analysis.valid ? "meld-invalid" : "",
    analysis?.valid ? "meld-valid" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} className={cls}>
      <SortableContext items={items} strategy={horizontalListSortingStrategy}>
        {items.map((tid) => {
          const tile = index.get(tid);
          if (!tile) return null;
          return <SortableTile key={tid} id={tid} tile={tile} disabled={tilesDisabled} />;
        })}
      </SortableContext>
      {analysis && <span className="meld-points">{analysis.valid ? `${analysis.points}` : "✗"}</span>}
    </div>
  );
}

function SortableTile({ id, tile, disabled }: { id: string; tile: Tile; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TileView tile={tile} />
    </div>
  );
}

function NewMeldDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_MELD });
  return (
    <div ref={setNodeRef} className={`new-meld-drop${isOver ? " over" : ""}`}>
      Drop here to start a new meld
    </div>
  );
}
