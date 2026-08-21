import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Track whether the viewport is below the mobile breakpoint.
 *
 * useSyncExternalStore reads the current match during render instead of
 * setting state from an effect, which removes the extra render pass on mount
 * and the brief undefined state that came with it.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(query).matches;
}

function getServerSnapshot(): boolean {
  // No viewport during SSR or a thumbnail render; assume desktop.
  return false;
}
