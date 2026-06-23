import { useEffect, useRef } from "react";
import { forceResync } from "../sync/connection";
import { logConn } from "../sync/connectionLog";

// How long to let the SDK settle after the tab is foregrounded before deciding
// it's stuck. On resume from a frozen tab the SDK needs a moment to notice the
// dead stream and flip its listeners to cached (stale); waiting briefly lets a
// connection that recovers on its own do so, so we only kick when it doesn't.
const SETTLE_MS = 1500;

/**
 * Reconnect Firestore when the tab is brought back to the foreground (or the
 * network returns) *and* we're observably stale — i.e. serving cached data
 * because the SDK hasn't resynced. A still-connected listener reports fresh
 * server data (`stale === false`), so it's left untouched: no disconnect churn
 * on quick tab switches, only a one-shot resync for a genuinely stuck stream.
 */
export function useReconnectOnResume(stale: boolean): void {
  // Read the latest `stale` from the event handlers without re-binding them.
  const staleRef = useRef(stale);
  staleRef.current = stale;
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const onVisibility = () => {
      clear();
      if (document.visibilityState !== "visible") {
        hiddenAt.current = Date.now();
        logConn("hidden");
        return;
      }
      const hiddenMs = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      logConn("visible", `hiddenMs=${hiddenMs} stale=${staleRef.current}`);
      timer = setTimeout(() => {
        logConn("note", `settle check: stale=${staleRef.current}`);
        if (staleRef.current) void forceResync("visible");
      }, SETTLE_MS);
    };

    // A regained network connection is an unambiguous, rare signal — kick at
    // once if we're stale rather than waiting out the SDK's own backoff.
    const onOnline = () => {
      logConn("online", `stale=${staleRef.current}`);
      if (staleRef.current) void forceResync("online");
    };
    const onOffline = () => logConn("offline");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
}
