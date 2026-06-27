import { useEffect, useState } from "react";

// Surfacing "you can install this as an app" ourselves, because browsers bury it
// (Android/desktop: an address-bar icon or a menu item) or expose nothing at all
// (iOS Safari: the user must use Share → Add to Home Screen). The two platforms
// need different treatment — a programmatic prompt vs printed instructions — so
// the hook reports which one applies.

/** The non-standard event Chromium fires when the app is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS marks an installed PWA with this non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac, so also sniff for touch to catch iPads.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

export interface InstallState {
  /** Already running as an installed PWA — hide all install affordances. */
  installed: boolean;
  /** Chromium offered a native prompt we can trigger from a button. */
  canPrompt: boolean;
  /** iOS, not yet installed — show manual Add-to-Home-Screen steps instead. */
  needsIOSInstructions: boolean;
  /** Fire the native install prompt (no-op unless `canPrompt`). */
  promptInstall: () => Promise<void>;
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop the mini-infobar; we drive install from our own UI
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null); // the prompt is single-use
  };

  return {
    installed,
    canPrompt: !!deferred,
    needsIOSInstructions: isIOS() && !installed,
    promptInstall,
  };
}
