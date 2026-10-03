import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardEntry } from "../../../shared/types";
import { isBrowserPreview } from "../../../shared/lib/tauriRuntime";
import { createPreviewHistory, PREVIEW_GROUP_NAMES } from "../previewData";
import type { GroupTab } from "../components/GroupTabBar";

const PROTECTED_GROUP_NAMES = new Set(["sensitive", "密码", "password"]);

interface UseGroupBoardOptions {
  t: (key: string) => string;
  activeGroup: string | null;
  setActiveGroup: (name: string | null) => void;
  history: ClipboardEntry[];
  setHistory: (value: ClipboardEntry[] | ((prev: ClipboardEntry[]) => ClipboardEntry[])) => void;
  filteredHistory: ClipboardEntry[];
  fetchHistory: (reset?: boolean) => void;
  openConfirm: (opts: { title: string; message: string; onConfirm: () => void }) => void;
  closeConfirm: () => void;
  pushToast: (msg: string, duration?: number) => number;
  showGroupHotkeys: boolean;
  editingTagsId: number | null;
}

export type SelectModifierEvent = {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

const withTag = (tags: string[] | undefined, name: string) => {
  const next = [...(tags || [])];
  if (!next.includes(name)) next.push(name);
  return next;
};

const withoutTag = (tags: string[] | undefined, name: string) => (tags || []).filter((tag) => tag !== name);

export const useGroupBoard = ({
  t,
  activeGroup,
  setActiveGroup,
  history,
  setHistory,
  filteredHistory,
  fetchHistory,
  openConfirm,
  closeConfirm,
  pushToast,
  showGroupHotkeys,
  editingTagsId
}: UseGroupBoardOptions) => {
  const preview = isBrowserPreview();
  const [groups, setGroups] = useState<GroupTab[]>(() =>
    preview ? PREVIEW_GROUP_NAMES.map((name) => ({ name, count: 0 })) : []
  );
  const [groupsLoaded, setGroupsLoaded] = useState(preview);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const anchorRef = useRef(-1);
  const filteredRef = useRef(filteredHistory);
  const groupsRef = useRef(groups);
  const activeGroupRef = useRef(activeGroup);
  const showHotkeysRef = useRef(showGroupHotkeys);
  const editingTagsRef = useRef(editingTagsId);
  const selectionModeRef = useRef(selectionMode);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    filteredRef.current = filteredHistory;
  }, [filteredHistory]);
  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);
  useEffect(() => {
    showHotkeysRef.current = showGroupHotkeys;
  }, [showGroupHotkeys]);
  useEffect(() => {
    editingTagsRef.current = editingTagsId;
  }, [editingTagsId]);
  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const refreshGroups = useCallback(async () => {
    if (isBrowserPreview()) {
      setGroupsLoaded(true);
      return;
    }
    try {
      const tagMap = await invoke<Record<string, number>>("get_all_tags_info");
      const next = Object.entries(tagMap || {})
        .map(([name, count]) => ({ name, count: Number(count) || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh"));
      setGroups(next);
      setGroupsLoaded(true);
    } catch (error) {
      console.error("加载分组失败", error);
      setGroupsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (preview) {
      setHistory(createPreviewHistory());
      return;
    }
    void refreshGroups();
  }, [preview, refreshGroups, setHistory]);

  useEffect(() => {
    if (preview) return;
    let unlisten: (() => void) | undefined;
    listen("clipboard-changed", () => {
      void refreshGroups();
    }).then((off) => {
      unlisten = off;
    });
    return () => {
      unlisten?.();
    };
  }, [preview, refreshGroups]);

  useEffect(() => {
    if (!groupsLoaded || preview) return;
    if (activeGroup && !groups.some((group) => group.name === activeGroup)) {
      setActiveGroup(null);
    }
  }, [activeGroup, groups, groupsLoaded, preview, setActiveGroup]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
    anchorRef.current = -1;
  }, [activeGroup]);

  const displayGroups = useMemo(() => {
    if (!preview) return groups;
    const counts = new Map<string, number>();
    for (const group of groups) counts.set(group.name, 0);
    for (const item of history) {
      for (const tag of item.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }, [groups, history, preview]);

  useEffect(() => {
    groupsRef.current = displayGroups;
  }, [displayGroups]);

  const selectedItems = useMemo(
    () => history.filter((item) => selectedIds.has(item.id)),
    [history, selectedIds]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
    anchorRef.current = -1;
  }, []);

  const consumeEscape = useCallback(() => {
    if (selectionModeRef.current || selectedIdsRef.current.size > 0) {
      setSelectedIds(new Set());
      setSelectionMode(false);
      anchorRef.current = -1;
      return true;
    }
    return false;
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
        anchorRef.current = -1;
      }
      return !prev;
    });
  }, []);

  const handleMultiSelect = useCallback((event: SelectModifierEvent, item: ClipboardEntry) => {
    const list = filteredRef.current;
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index < 0) return;
    setSelectionMode(true);
    if (event.shiftKey && anchorRef.current >= 0) {
      const start = Math.min(anchorRef.current, index);
      const end = Math.max(anchorRef.current, index);
      const ids = list.slice(start, end + 1).map((entry) => entry.id);
      setSelectedIds((prev) => {
        const next = event.ctrlKey || event.metaKey ? new Set(prev) : new Set<number>();
        ids.forEach((id) => next.add(id));
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    anchorRef.current = index;
  }, []);

  const selectAllVisible = useCallback(() => {
    const ids = filteredRef.current.map((item) => item.id);
    setSelectionMode(true);
    setSelectedIds(new Set(ids));
    anchorRef.current = ids.length > 0 ? 0 : -1;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!showHotkeysRef.current) return;
      if (editingTagsRef.current !== null) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "Tab" && event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const order: Array<string | null> = [null, ...groupsRef.current.map((group) => group.name)];
        const current = order.indexOf(activeGroupRef.current);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (current + delta + order.length) % order.length;
        setActiveGroup(order[nextIndex] ?? null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !typing && !event.shiftKey) {
        event.preventDefault();
        selectAllVisible();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selectAllVisible, setActiveGroup]);

  const ensureGroup = useCallback((name: string) => {
    setGroups((prev) => (prev.some((group) => group.name === name) ? prev : [...prev, { name, count: 0 }]));
  }, []);

  const applyTags = useCallback(
    async (items: ClipboardEntry[], nextTagsFor: (item: ClipboardEntry) => string[]) => {
      if (items.length === 0) return;
      if (preview) {
        const byId = new Map(items.map((item) => [item.id, nextTagsFor(item)]));
        setHistory((prev) =>
          prev.map((item) => (byId.has(item.id) ? { ...item, tags: byId.get(item.id) || [] } : item))
        );
        for (const tags of byId.values()) {
          tags.forEach((tag) => ensureGroup(tag));
        }
        return;
      }

      try {
        for (const item of items) {
          const nextTags = nextTagsFor(item);
          const unchanged =
            nextTags.length === (item.tags || []).length &&
            nextTags.every((tag, index) => tag === (item.tags || [])[index]);
          if (unchanged) continue;
          const newId = await invoke<number>("update_tags", { id: item.id, tags: nextTags });
          setHistory((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, id: newId, tags: nextTags } : entry))
          );
        }
        await refreshGroups();
        fetchHistory(true);
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
      }
    },
    [ensureGroup, fetchHistory, preview, pushToast, refreshGroups, setHistory, t]
  );

  const createGroup = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return false;
      ensureGroup(name);
      setActiveGroup(name);
      if (preview) return true;
      try {
        await invoke("create_new_tag", { tagName: name });
        await refreshGroups();
        return true;
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
        return false;
      }
    },
    [ensureGroup, preview, pushToast, refreshGroups, setActiveGroup, t]
  );

  const renameGroup = useCallback(
    async (oldName: string, rawName: string) => {
      const name = rawName.trim();
      if (!name || name === oldName) return false;
      if (PROTECTED_GROUP_NAMES.has(oldName)) {
        pushToast(t("group_rename_protected"), 3000);
        return false;
      }
      setGroups((prev) => prev.map((group) => (group.name === oldName ? { ...group, name } : group)));
      if (activeGroupRef.current === oldName) setActiveGroup(name);
      setHistory((prev) =>
        prev.map((item) => ({
          ...item,
          tags: (item.tags || []).map((tag) => (tag === oldName ? name : tag))
        }))
      );
      if (preview) return true;
      try {
        await invoke("rename_tag_globally", { oldName, newName: name });
        await refreshGroups();
        fetchHistory(true);
        return true;
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
        await refreshGroups();
        return false;
      }
    },
    [fetchHistory, preview, pushToast, refreshGroups, setActiveGroup, setHistory, t]
  );

  const notifyProtectedGroup = useCallback(() => {
    pushToast(t("group_rename_protected"), 3000);
  }, [pushToast, t]);

  const deleteGroup = useCallback(
    (name: string) => {
      openConfirm({
        title: t("group_delete_title"),
        message: t("group_delete_confirm").replace("{name}", name),
        onConfirm: () => {
          closeConfirm();
          setGroups((prev) => prev.filter((group) => group.name !== name));
          if (activeGroupRef.current === name) setActiveGroup(null);
          setHistory((prev) =>
            prev.map((item) => ({ ...item, tags: withoutTag(item.tags, name) }))
          );
          if (preview) return;
          invoke("detach_tag", { tagName: name })
            .then(() => {
              void refreshGroups();
              fetchHistory(true);
            })
            .catch((error) => {
              console.error(error);
              pushToast(t("group_action_failed"), 3000);
              void refreshGroups();
            });
        }
      });
    },
    [closeConfirm, fetchHistory, openConfirm, preview, pushToast, refreshGroups, setActiveGroup, setHistory, t]
  );

  const addToGroup = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      ensureGroup(trimmed);
      void applyTags(selectedItems, (item) => withTag(item.tags, trimmed));
      clearSelection();
    },
    [applyTags, clearSelection, ensureGroup, selectedItems]
  );

  const moveToGroup = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !activeGroup) return;
      ensureGroup(trimmed);
      void applyTags(selectedItems, (item) => withTag(withoutTag(item.tags, activeGroup), trimmed));
      clearSelection();
    },
    [activeGroup, applyTags, clearSelection, ensureGroup, selectedItems]
  );

  const createAndAdd = useCallback(
    (name: string, move: boolean) => {
      if (move) moveToGroup(name);
      else addToGroup(name);
    },
    [addToGroup, moveToGroup]
  );

  const removeFromGroup = useCallback(() => {
    if (!activeGroup) return;
    void applyTags(selectedItems, (item) => withoutTag(item.tags, activeGroup));
    clearSelection();
  }, [activeGroup, applyTags, clearSelection, selectedItems]);

  const setPinned = useCallback(
    async (pinned: boolean) => {
      const targets = selectedItems.filter((item) => item.is_pinned !== pinned);
      if (preview) {
        const ids = new Set(targets.map((item) => item.id));
        setHistory((prev) => prev.map((item) => (ids.has(item.id) ? { ...item, is_pinned: pinned } : item)));
        clearSelection();
        return;
      }
      try {
        for (const item of targets) {
          const newId = await invoke<number>("toggle_clipboard_pin", { id: item.id, isPinned: pinned });
          setHistory((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, id: newId, is_pinned: pinned } : entry))
          );
        }
        fetchHistory(true);
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
      }
      clearSelection();
    },
    [clearSelection, fetchHistory, preview, pushToast, selectedItems, setHistory, t]
  );

  const deleteSelected = useCallback(() => {
    if (selectedItems.length === 0) return;
    const ids = selectedItems.map((item) => item.id);
    openConfirm({
      title: t("group_bulk_delete_title"),
      message: t("group_bulk_delete_confirm").replace("{count}", String(ids.length)),
      onConfirm: () => {
        closeConfirm();
        if (preview) {
          const idSet = new Set(ids);
          setHistory((prev) => prev.filter((item) => !idSet.has(item.id)));
          clearSelection();
          return;
        }
        Promise.all(ids.map((id) => invoke("delete_clipboard_entry", { id })))
          .then(() => {
            fetchHistory(true);
            void refreshGroups();
          })
          .catch((error) => {
            console.error(error);
            pushToast(t("group_action_failed"), 3000);
            fetchHistory(true);
          });
        clearSelection();
      }
    });
  }, [
    clearSelection,
    closeConfirm,
    fetchHistory,
    openConfirm,
    preview,
    pushToast,
    refreshGroups,
    selectedItems,
    setHistory,
    t
  ]);

  return {
    groups: displayGroups,
    selectionMode,
    selectedIds,
    selectedCount: selectedItems.length,
    blockPaste: selectionMode || selectedItems.length > 0,
    consumeEscape,
    toggleSelectionMode,
    handleMultiSelect,
    clearSelection,
    createGroup,
    renameGroup,
    notifyProtectedGroup,
    deleteGroup,
    addToGroup,
    moveToGroup,
    createAndAdd,
    removeFromGroup,
    pinSelected: () => {
      void setPinned(true);
    },
    unpinSelected: () => {
      void setPinned(false);
    },
    deleteSelected
  };
};
