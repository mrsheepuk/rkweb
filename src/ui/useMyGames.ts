import { useEffect, useState } from "react";
import { subscribeMyGames, type GameSummary } from "../sync/gameSync";

export interface MyGames {
  games: GameSummary[];
  loading: boolean;
}

/** Live-subscribes to every game the signed-in player belongs to. */
export function useMyGames(uid: string | null): MyGames {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(!!uid);

  useEffect(() => {
    if (!uid) {
      setGames([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeMyGames(
      uid,
      (g) => {
        setGames(g);
        setLoading(false);
      },
      // A failed list is non-fatal: the player can still create/join by code.
      // Still log it — a swallowed list error (e.g. a missing composite index)
      // is invisible otherwise, and Firestore's message includes a fix link.
      (err) => {
        console.error("[useMyGames] subscribeMyGames failed:", err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  return { games, loading };
}
