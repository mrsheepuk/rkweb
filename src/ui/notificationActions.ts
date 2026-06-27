// Orchestrates turning "your turn" notifications on/off for a specific player:
// the browser permission + preference (notifications.ts) plus the Web Push
// subscription (sync/push.ts). Kept in one place so the menu toggle and the
// priming dialog share identical behaviour.
//
// Push is best-effort and additive: where it isn't configured or the browser
// lacks PushManager, enabling still succeeds and the player gets phase-1 in-tab
// notifications. The uid must be the real authenticated uid (not a ?test seat),
// since a push subscription is tied to the signed-in account.

import { ensureServiceWorker, setNotifyEnabled } from "./notifications";
import { subscribeToPush, unsubscribeFromPush } from "../sync/push";

/** Returns whether notifications ended up enabled (permission granted). */
export async function enableTurnNotifications(uid: string): Promise<boolean> {
  const on = await setNotifyEnabled(true);
  if (!on) return false;
  const reg = await ensureServiceWorker();
  if (reg) {
    try {
      await subscribeToPush(uid, reg);
    } catch {
      /* push is optional; in-tab notifications still work */
    }
  }
  return true;
}

export async function disableTurnNotifications(uid: string): Promise<void> {
  await setNotifyEnabled(false);
  const reg = await ensureServiceWorker();
  if (reg) {
    try {
      await unsubscribeFromPush(uid, reg);
    } catch {
      /* nothing to undo */
    }
  }
}
