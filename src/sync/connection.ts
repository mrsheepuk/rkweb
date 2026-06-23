// Connection recovery. Firestore keeps its backend stream alive and reconnects
// on its own — but when a mobile tab is frozen (battery saver, long background)
// the SDK's reconnect/backoff timers are frozen too, so on resume it can sit on
// an escalated backoff before retrying, leaving listeners serving stale cached
// data (the "had to reload to see the move" symptom). Cycling the network drops
// and rebuilds the stream and resets that backoff, forcing an immediate resync.
// Re-registering listeners alone wouldn't reset the connection-level backoff.

import { disableNetwork, enableNetwork } from "firebase/firestore";
import { db } from "./firebase";
import { logConn } from "./connectionLog";

let resyncing = false;

/**
 * Force Firestore to reconnect now. Best-effort and reentrancy-guarded so
 * overlapping triggers (e.g. `visibilitychange` and `online` firing together)
 * don't interleave the disable/enable pair. Callers gate this on observed
 * staleness so a healthy connection is never cycled.
 */
export async function forceResync(reason = "manual"): Promise<void> {
  if (resyncing) {
    logConn("resync", `skip (already running) reason=${reason}`);
    return;
  }
  resyncing = true;
  logConn("resync", `start reason=${reason}`);
  try {
    await disableNetwork(db);
    await enableNetwork(db);
    logConn("resync", "done");
  } catch (e) {
    logConn("resync", `error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    resyncing = false;
  }
}
