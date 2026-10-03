import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardEntry } from "../../../shared/types";
import { isBrowserPreview } from "../../../shared/lib/tauriRuntime";
import { createPreviewHistory } from "../previewData";
import type { GroupTab } from "../components/GroupTabBar";

interface UseGroupBoardOptions {
  t: (key: string) => string;
  activeGroup: number | null;
  setActiveGroup: (id: number | null) => void;
  history: ClipboardEntry[];
  setHistory: (value: ClipboardEntry[] | ((prev: ClipboardEntry[]) => ClipboardEntry[])) => void;
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

interface IdRemap {
  from: number;
  to: number;
}

interface GroupRow {
  id: number;
  name: string;
  count: number;
  sort_order?: number;
}

const emptyMembership = () => new Map<number, Set<number>>();

export const useGroupBoard = ({
  t,
  activeGroup,
  setActiveGroup,
  history,
  setHistory,
  fetchHistory,
  openConfirm,
  closeConfirm,
  pushToast,
  showGroupHotkeys,
  editingTagsId
}: UseGroupBoardOptions) => {
  const preview = isBrowserPreview();
  const [groups, setGroups] = useState<GroupTab[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(preview);
  const [membership, setMembership] = useState<Map<number, Set<number>>>(emptyMembership);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const anchorRef = useRef(-1);
  const filteredRef = useRef<ClipboardEntry[]>([]);
  const groupsRef = useRef(groups);
  const activeGroupRef = useRef(activeGroup);
  const showHotkeysRef = useRef(showGroupHotkeys);
  const editingTagsRef = useRef(editingTagsId);
  const selectionModeRef = useRef(selectionMode);
  const selectedIdsRef = useRef(selectedIds);
  const nextPreviewId = useRef(1);

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
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const refreshGroups = useCallback(async () => {
    if (isBrowserPreview()) {
      setGroupsLoaded(true);
      return;
    }
    try {
      const rows = await invoke<GroupRow[]>("list_custom_groups");
      setGroups(
        (rows || []).map((row) => ({
          id: row.id,
          name: row.name,
          count: Number(row.count) || 0
        }))
      );
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
    if (activeGroup != null && !groups.some((group) => group.id === activeGroup)) {
      setActiveGroup(null);
    }
  }, [activeGroup, groups, groupsLoaded, preview, setActiveGroup]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
    anchorRef.current = -1;
  }, [activeGroup]);

  const previewMemberIds = useMemo(() => {
    if (!preview || activeGroup == null) return null;
    return membership.get(activeGroup) ?? new Set<number>();
  }, [activeGroup, membership, preview]);

  const displayGroups = useMemo(() => {
    if (!preview) return groups;
    return groups.map((group) => ({
      ...group,
      count: membership.get(group.id)?.size ?? 0
    }));
  }, [groups, membership, preview]);

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
        const order: Array<number | null> = [null, ...groupsRef.current.map((group) => group.id)];
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

  const applyRemaps = useCallback(
    (remaps: IdRemap[]) => {
      if (remaps.length === 0) return;
      const map = new Map(remaps.map((row) => [row.from, row.to]));
      setHistory((prev) => prev.map((item) => (map.has(item.id) ? { ...item, id: map.get(item.id) || item.id } : item)));
    },
    [setHistory]
  );

  const rememberPreview = useCallback((groupId: number, ids: number[], removeFrom?: number | null) => {
    setMembership((prev) => {
      const next = new Map(prev);
      if (removeFrom != null) {
        const source = new Set(next.get(removeFrom) || []);
        ids.forEach((id) => source.delete(id));
        next.set(removeFrom, source);
      }
      const target = new Set(next.get(groupId) || []);
      ids.forEach((id) => target.add(id));
      next.set(groupId, target);
      return next;
    });
  }, []);

  const createGroup = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return null;
      if (preview) {
        const id = nextPreviewId.current++;
        setGroups((prev) => [...prev, { id, name, count: 0 }]);
        setActiveGroup(id);
        return id;
      }
      try {
        const created = await invoke<GroupRow>("create_custom_group", { name });
        await refreshGroups();
        setActiveGroup(created.id);
        return created.id;
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
        return null;
      }
    },
    [preview, pushToast, refreshGroups, setActiveGroup, t]
  );

  const renameGroup = useCallback(
    async (id: number, rawName: string) => {
      const name = rawName.trim();
      const current = groupsRef.current.find((group) => group.id === id);
      if (!name || !current || name === current.name) return false;
      setGroups((prev) => prev.map((group) => (group.id === id ? { ...group, name } : group)));
      if (preview) return true;
      try {
        await invoke("rename_custom_group", { id, name });
        await refreshGroups();
        return true;
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
        await refreshGroups();
        return false;
      }
    },
    [preview, pushToast, refreshGroups, t]
  );

  const reorderGroup = useCallback(
    async (id: number, direction: -1 | 1) => {
      const list = groupsRef.current;
      const index = list.findIndex((group) => group.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
      const reordered = [...list];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, moved);
      setGroups(reordered);
      if (preview) return;
      try {
        await invoke("reorder_custom_groups", { ids: reordered.map((group) => group.id) });
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
        await refreshGroups();
      }
    },
    [preview, pushToast, refreshGroups, t]
  );

  const deleteGroup = useCallback(
    (id: number) => {
      const group = groupsRef.current.find((item) => item.id === id);
      openConfirm({
        title: t("group_delete_title"),
        message: t("group_delete_confirm").replace("{name}", group?.name || ""),
        onConfirm: () => {
          closeConfirm();
          setGroups((prev) => prev.filter((item) => item.id !== id));
          setMembership((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          if (activeGroupRef.current === id) setActiveGroup(null);
          if (preview) return;
          invoke("delete_custom_group", { id })
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
    [closeConfirm, fetchHistory, openConfirm, preview, pushToast, refreshGroups, setActiveGroup, t]
  );

  const mutateMembership = useCallback(
    async (items: ClipboardEntry[], run: (ids: number[]) => Promise<IdRemap[] | void>) => {
      if (items.length === 0) return;
      const ids = items.map((item) => item.id);
      try {
        const remaps = (await run(ids)) || [];
        applyRemaps(remaps);
        await refreshGroups();
        fetchHistory(true);
      } catch (error) {
        console.error(error);
        pushToast(t("group_action_failed"), 3000);
      }
    },
    [applyRemaps, fetchHistory, pushToast, refreshGroups, t]
  );

  const addToGroup = useCallback(
    (groupId: number, items = selectedItems) => {
      if (preview) {
        rememberPreview(groupId, items.map((item) => item.id));
        clearSelection();
        return;
      }
      void mutateMembership(items, (ids) =>
        invoke<IdRemap[]>("add_items_to_group", { groupId, entryIds: ids })
      );
      clearSelection();
    },
    [clearSelection, mutateMembership, preview, rememberPreview, selectedItems]
  );

  const moveToGroup = useCallback(
    (groupId: number) => {
      if (activeGroup == null || groupId === activeGroup) return;
      if (preview) {
        rememberPreview(
          groupId,
          selectedItems.map((item) => item.id),
          activeGroup
        );
        clearSelection();
        return;
      }
      void mutateMembership(selectedItems, (ids) =>
        invoke<IdRemap[]>("move_items_to_group", {
          fromGroupId: activeGroup,
          toGroupId: groupId,
          entryIds: ids
        })
      );
      clearSelection();
    },
    [activeGroup, clearSelection, mutateMembership, preview, rememberPreview, selectedItems]
  );

  const createAndAdd = useCallback(
    async (name: string, move: boolean, items = selectedItems) => {
      const id = await createGroup(name);
      if (id == null) return;
      if (move) {
        if (preview) {
          rememberPreview(
            id,
            items.map((item) => item.id),
            activeGroupRef.current
          );
        } else if (activeGroupRef.current != null) {
          await mutateMembership(items, (entryIds) =>
            invoke<IdRemap[]>("move_items_to_group", {
              fromGroupId: activeGroupRef.current,
              toGroupId: id,
              entryIds
            })
          );
        } else {
          await mutateMembership(items, (entryIds) =>
            invoke<IdRemap[]>("add_items_to_group", { groupId: id, entryIds })
          );
        }
      } else if (preview) {
        rememberPreview(id, items.map((item) => item.id));
      } else {
        await mutateMembership(items, (entryIds) =>
          invoke<IdRemap[]>("add_items_to_group", { groupId: id, entryIds })
        );
      }
      clearSelection();
    },
    [clearSelection, createGroup, mutateMembership, preview, rememberPreview, selectedItems]
  );

  const removeFromGroup = useCallback(() => {
    if (activeGroup == null) return;
    if (preview) {
      const ids = selectedItems.map((item) => item.id);
      setMembership((prev) => {
        const next = new Map(prev);
        const source = new Set(next.get(activeGroup) || []);
        ids.forEach((id) => source.delete(id));
        next.set(activeGroup, source);
        return next;
      });
      clearSelection();
      return;
    }
    void mutateMembership(selectedItems, (ids) =>
      invoke("remove_items_from_group", { groupId: activeGroup, entryIds: ids })
    );
    clearSelection();
  }, [activeGroup, clearSelection, mutateMembership, preview, selectedItems]);

  const addItemToGroup = useCallback(
    (item: ClipboardEntry, groupId: number) => {
      addToGroup(groupId, [item]);
    },
    [addToGroup]
  );

  const createGroupForItem = useCallback(
    (item: ClipboardEntry, name: string) => {
      void createAndAdd(name, false, [item]);
    },
    [createAndAdd]
  );

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
          setMembership((prev) => {
            const next = new Map(prev);
            for (const [groupId, members] of next) {
              const kept = new Set([...members].filter((id) => !idSet.has(id)));
              next.set(groupId, kept);
            }
            return next;
          });
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
    previewMemberIds,
    filteredRef,
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
    reorderGroup,
    deleteGroup,
    addToGroup: (groupId: number) => addToGroup(groupId),
    moveToGroup,
    createAndAdd: (name: string, move: boolean) => {
      void createAndAdd(name, move);
    },
    removeFromGroup,
    addItemToGroup,
    createGroupForItem,
    pinSelected: () => {
      void setPinned(true);
    },
    unpinSelected: () => {
      void setPinned(false);
    },
    deleteSelected
  };
};
