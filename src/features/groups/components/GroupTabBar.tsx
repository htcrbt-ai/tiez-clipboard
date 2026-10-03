import { useEffect, useRef, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";

export interface GroupTab {
  id: number;
  name: string;
  count: number;
}

interface GroupTabBarProps {
  t: (key: string) => string;
  groups: GroupTab[];
  activeGroup: number | null;
  selectionMode: boolean;
  onSelectGroup: (id: number | null) => void;
  onCreateGroup: (name: string) => Promise<number | null>;
  onRenameGroup: (id: number, name: string) => Promise<boolean>;
  onDeleteGroup: (id: number) => void;
  onReorderGroup: (id: number, direction: -1 | 1) => void;
  onToggleSelectionMode: () => void;
}

const GroupTabBar = ({
  t,
  groups,
  activeGroup,
  selectionMode,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroup,
  onToggleSelectionMode
}: GroupTabBarProps) => {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);
  const commitRef = useRef(false);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingId != null) renameInputRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const submitCreate = async () => {
    if (commitRef.current) return;
    commitRef.current = true;
    const name = draft.trim();
    if (!name) {
      setCreating(false);
      setDraft("");
      commitRef.current = false;
      return;
    }
    const id = await onCreateGroup(name);
    if (id != null) {
      setCreating(false);
      setDraft("");
    }
    commitRef.current = false;
  };

  const submitRename = async (id: number) => {
    if (commitRef.current) return;
    commitRef.current = true;
    const name = draft.trim();
    setEditingId(null);
    setDraft("");
    if (name) {
      await onRenameGroup(id, name);
    }
    commitRef.current = false;
  };

  const startRename = (id: number, name: string) => {
    setMenu(null);
    setCreating(false);
    setEditingId(id);
    setDraft(name);
  };

  const menuIndex = menu ? groups.findIndex((group) => group.id === menu.id) : -1;

  return (
    <div className="group-tab-bar window-no-drag" data-testid="group-tab-bar">
      <div className="group-tab-scroll">
        <button
          type="button"
          className={`group-tab ${activeGroup === null ? "active" : ""}`}
          data-testid="group-tab-all"
          title={t("group_switch_hint")}
          onClick={() => onSelectGroup(null)}
        >
          {t("group_all")}
        </button>
        {groups.map((group) =>
          editingId === group.id ? (
            <input
              key={group.id}
              ref={renameInputRef}
              className="group-inline-input"
              value={draft}
              aria-label={t("group_rename")}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (skipBlurRef.current) {
                  skipBlurRef.current = false;
                  return;
                }
                void submitRename(group.id);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  skipBlurRef.current = true;
                  setEditingId(null);
                  setDraft("");
                }
              }}
            />
          ) : (
            <button
              key={group.id}
              type="button"
              className={`group-tab ${activeGroup === group.id ? "active" : ""}`}
              data-testid={`group-tab-${group.name}`}
              title={group.name}
              onClick={() => onSelectGroup(group.id)}
              onDoubleClick={(event) => {
                event.preventDefault();
                startRename(group.id, group.name);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectGroup(group.id);
                const menuWidth = 180;
                const menuHeight = 150;
                setMenu({
                  id: group.id,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
                });
              }}
            >
              <span className="group-tab-label">{group.name}</span>
              <span className="group-tab-count">{group.count}</span>
            </button>
          )
        )}
        {creating ? (
          <input
            ref={createInputRef}
            className="group-inline-input"
            value={draft}
            placeholder={t("group_name_placeholder")}
            aria-label={t("group_new")}
            data-testid="group-create-input"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (skipBlurRef.current) {
                skipBlurRef.current = false;
                return;
              }
              void submitCreate();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                skipBlurRef.current = true;
                setCreating(false);
                setDraft("");
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="group-tab group-tab-add"
            data-testid="group-tab-add"
            title={t("group_new")}
            onClick={() => {
              setEditingId(null);
              setDraft("");
              setCreating(true);
            }}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <button
        type="button"
        className={`group-tab group-select-toggle ${selectionMode ? "active" : ""}`}
        data-testid="group-select-toggle"
        aria-pressed={selectionMode}
        title={t("group_select_mode_hint")}
        onClick={onToggleSelectionMode}
      >
        <CheckSquare size={13} />
        <span>{selectionMode ? t("group_select_done") : t("group_select_mode")}</span>
      </button>
      {menu && (
        <div
          className="group-context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const group = groups.find((item) => item.id === menu.id);
              if (group) startRename(group.id, group.name);
            }}
          >
            {t("group_rename")}
          </button>
          <button
            type="button"
            disabled={menuIndex <= 0}
            onClick={() => {
              onReorderGroup(menu.id, -1);
              setMenu(null);
            }}
          >
            {t("group_move_earlier")}
          </button>
          <button
            type="button"
            disabled={menuIndex < 0 || menuIndex >= groups.length - 1}
            onClick={() => {
              onReorderGroup(menu.id, 1);
              setMenu(null);
            }}
          >
            {t("group_move_later")}
          </button>
          <button
            type="button"
            onClick={() => {
              const id = menu.id;
              setMenu(null);
              onDeleteGroup(id);
            }}
          >
            {t("group_delete_keep_items")}
          </button>
        </div>
      )}
    </div>
  );
};

export default GroupTabBar;
