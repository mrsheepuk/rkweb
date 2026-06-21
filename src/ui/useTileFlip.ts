import { useLayoutEffect, useRef } from "react";

/**
 * FLIP animation for table tiles when an opponent's move streams in.
 *
 * Drafts arrive as discrete, throttled snapshots (see GameView), so we tween
 * between keyframes the opponent published rather than mirror their cursor.
 * Each tile carries a stable `data-tile-id`, so on every change of `key` we
 * measure where every tile *now* is, compare to where it *was* last render, and
 * play the difference: tiles that moved glide from their old box, tiles that
 * appeared fade/scale in. Uses the Web Animations API so it composes on top of
 * React/dnd-kit inline transforms without clobbering them.
 *
 * Returns a ref to attach to the container whose `[data-tile-id]` descendants
 * should animate. Pass `enabled` (we only animate while spectating) and a `key`
 * that changes whenever the board content does.
 */
export function useTileFlip<T extends HTMLElement>(enabled: boolean, key: string) {
  const containerRef = useRef<T>(null);
  const prev = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-tile-id]"));
    const next = new Map<string, DOMRect>();
    for (const node of nodes) next.set(node.dataset.tileId!, node.getBoundingClientRect());

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Skip the first pass (nothing to compare to) and any pass where we're not
    // animating; just record positions so the next change has a baseline.
    if (enabled && !reduced && prev.current.size > 0) {
      for (const node of nodes) {
        const id = node.dataset.tileId!;
        const now = next.get(id)!;
        const old = prev.current.get(id);
        if (!old) {
          // Entering: a tile the opponent just laid on the table.
          node.animate(
            [
              { opacity: 0, transform: "scale(0.8)" },
              { opacity: 1, transform: "scale(1)" },
            ],
            { duration: 180, easing: "ease-out" },
          );
          continue;
        }
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (dx || dy) {
          // Moving: glide from the previous slot, with a brief highlight so the
          // eye catches what changed.
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)`, boxShadow: "0 0 0 2px rgba(255,255,255,0.6)" },
              { transform: "translate(0, 0)", boxShadow: "0 0 0 0 rgba(255,255,255,0)" },
            ],
            { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
          );
        }
      }
    }

    prev.current = next;
  }, [key, enabled]);

  return containerRef;
}
