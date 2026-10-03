import { useCallback, useState } from "react";

const STORAGE_KEY = "tiez_active_group";

export const useActiveGroup = () => {
  const [activeGroup, setActiveGroupState] = useState<string | null>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved && saved.trim() ? saved : null;
    } catch {
      return null;
    }
  });

  const setActiveGroup = useCallback((name: string | null) => {
    setActiveGroupState(name);
    try {
      if (name) {
        window.localStorage.setItem(STORAGE_KEY, name);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures; the in-memory tab still switches.
    }
  }, []);

  return { activeGroup, setActiveGroup };
};
