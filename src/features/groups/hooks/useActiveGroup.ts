import { useCallback, useState } from "react";

const STORAGE_KEY = "tiez_active_group_id";

export const useActiveGroup = () => {
  const [activeGroup, setActiveGroupState] = useState<number | null>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const id = Number(saved);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  });

  const setActiveGroup = useCallback((id: number | null) => {
    setActiveGroupState(id);
    try {
      if (id == null) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(id));
      }
    } catch {
      // Ignore storage failures; the in-memory tab still switches.
    }
  }, []);

  return { activeGroup, setActiveGroup };
};
