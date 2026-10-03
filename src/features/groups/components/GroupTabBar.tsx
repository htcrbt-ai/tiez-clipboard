import { useEffect, useRef, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";

export interface GroupTab {
  name: string;
  count: number;
}

interface GroupTabBarProps {
  t: (key: string) => string;
  groups: GroupTab[];
  activeGroup: string | null;
  selectionMode: boolean;
  onSelectGroup: (name: string | null) => void;
  onCreateGroup: (name: string) => Promise<boolean>;
  onRenameGroup: (oldName: string, newName: string) => Promise<boolean>;
  onProtectedGroup: () => void;
  onDeleteGroup: (name: string) => void;
  onToggleSelectionMode: () => void;
}

const PROTECTED_GROUP_NAMES = new Set(["sensitive", "密码", "password"]);

const GroupTabBar = ({
  t,
  groups,
  activeGroup,
  selectionMode,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onProtectedGroup,
  onDeleteGroup,
  onToggleSelectionMode
}: GroupTabBarProps) => {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);
  const commitRef = useRef(false);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingName) renameInputRef.current?.focus();
  }, [editingName]);

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
    const ok = await onCreateGroup(name);
    if (ok) {
      setCreating(false);
      setDraft("");
    }
    commitRef.current = false;
  };

  const submitRename = async (oldName: string) => {
    if (commitRef.current) return;
    commitRef.current = true;
    const name = draft.trim();
    setEditingName(null);
    setDraft("");
    if (!name || name === oldName) {
      commitRef.current = false;
      return;
    }
    await onRenameGroup(oldName, name);
    commitRef.current = false;
  };

  const startRename = (name: string) => {
    setMenu(null);
    if (PROTECTED_GROUP_NAMES.has(name)) {
      onProtectedGroup();
      return;
    }
    setCreating(false);
    setEditingName(name);
    setDraft(name);
  };

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
          editingName === group.name ? (
            <input
              key={group.name}
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
                void submitRename(group.name);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  skipBlurRef.current = true;
                  setEditingName(null);
                  setDraft("");
                }
              }}
            />
          ) : (
            <button
              key={group.name}
              type="button"
              className={`group-tab ${activeGroup === group.name ? "active" : ""}`}
              data-testid={`group-tab-${group.name}`}
              title={group.name}
              onClick={() => onSelectGroup(group.name)}
              onDoubleClick={(event) => {
                event.preventDefault();
                startRename(group.name);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectGroup(group.name);
                const menuWidth = 180;
                const menuHeight = 84;
                setMenu({
                  name: group.name,
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
              setEditingName(null);
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
          {!PROTECTED_GROUP_NAMES.has(menu.name) && (
            <button type="button" onClick={() => startRename(menu.name)}>
              {t("group_rename")}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const name = menu.name;
              setMenu(null);
              onDeleteGroup(name);
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
