import { useEffect, useState } from "react";

/**
 * History-based router. We only have two "routes": the home screen (`/`) and a
 * game identified by its join code (`/g/ABCD`). Real paths (not a hash) keep
 * links clean and shareable; the host must serve index.html for any path — see
 * the catch-all rewrite in firebase.json (Vite dev and `vite preview` do this
 * by default).
 */
export function useRoute(): { gameId: string | null; goToGame: (id: string) => void; goHome: () => void } {
  const [gameId, setGameId] = useState<string | null>(parseGameId());

  useEffect(() => {
    // Migrate old shareable links (`#/g/ABCD`) to the new path form so they
    // still work for anyone holding one.
    const legacy = window.location.hash.match(/^#\/g\/([A-Za-z0-9]+)/);
    if (legacy && parseGameId() === null) {
      const id = legacy[1]!.toUpperCase();
      window.history.replaceState(null, "", `/g/${id}`);
      setGameId(id);
    }

    const onPop = () => setGameId(parseGameId());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return {
    gameId,
    // pushState doesn't fire popstate, so we mirror the change into state.
    goToGame: (id: string) => {
      window.history.pushState(null, "", `/g/${id.toUpperCase()}`);
      setGameId(id.toUpperCase());
    },
    goHome: () => {
      window.history.pushState(null, "", "/");
      setGameId(null);
    },
  };
}

function parseGameId(): string | null {
  const match = window.location.pathname.match(/^\/g\/([A-Za-z0-9]+)/);
  return match ? match[1]!.toUpperCase() : null;
}
