export const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    __TAURI_IPC__?: unknown;
  };
  return !!(w.__TAURI__ || w.__TAURI_INTERNALS__ || w.__TAURI_IPC__);
};

/** Browser-only sample list. Never used inside the real Tauri window. */
export const isBrowserPreview = (): boolean => {
  if (typeof window === "undefined") return false;
  const forced = (window as unknown as { __TIEZ_FORCE_PREVIEW?: boolean }).__TIEZ_FORCE_PREVIEW;
  if (forced) return true;
  return !isTauriRuntime();
};

