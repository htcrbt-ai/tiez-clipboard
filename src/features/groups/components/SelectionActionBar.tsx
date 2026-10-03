import { useEffect, useRef, useState } from "react";
import type { GroupTab } from "./GroupTabBar";

interface SelectionActionBarProps {
  t: (key: string) => string;
  count: number;
  groups: GroupTab[];
  activeGroup: number | null;
  onAddToGroup: (id: number) => void;
  onMoveToGroup: (id: number) => void;
  onCreateAndAdd: (name: string, move: boolean) => void;
  onRemoveFromGroup: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDelete: () => void;
  onClear: () => void;
}

const SelectionActionBar = ({
  t,
  count,
  groups,
  activeGroup,
  onAddToGroup,
  onMoveToGroup,
  onCreateAndAdd,
  onRemoveFromGroup,
  onPin,
  onUnpin,
  onDelete,
  onClear
}: SelectionActionBarProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "move">("add");
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const applyGroup = (id: number) => {
    if (mode === "move" && activeGroup != null) {
      onMoveToGroup(id);
    } else {
      onAddToGroup(id);
    }
    setOpen(false);
  };

  const submitCreate = () => {
    const name = draft.trim();
    if (!name) return;
    onCreateAndAdd(name, mode === "move" && !!activeGroup);
    setDraft("");
    setOpen(false);
  };

  return (
    <div className="selection-action-bar window-no-drag" data-testid="selection-action-bar" ref={panelRef}>
      {open && (
        <div className="group-picker" data-testid="group-picker">
          <div className="group-picker-modes">
            <button
              type="button"
              className={mode === "add" ? "active" : ""}
              onClick={() => setMode("add")}
            >
              {t("group_add_to")}
            </button>
            <button
              type="button"
              className={mode === "move" ? "active" : ""}
              disabled={!activeGroup}
              title={activeGroup ? t("group_move_to_title") : t("group_move_needs_current")}
              onClick={() => setMode("move")}
            >
              {t("group_move_to")}
            </button>
          </div>
          <p className="group-picker-hint">
            {mode === "move" ? t("group_move_hint") : t("group_add_hint")}
          </p>
          <div className="group-picker-list">
            {groups
              .filter((group) => mode !== "move" || group.id !== activeGroup)
              .map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="group-picker-item"
                  onClick={() => applyGroup(group.id)}
                >
                  {group.name}
                </button>
              ))}
          </div>
          <form
            className="group-picker-create"
            onSubmit={(event) => {
              event.preventDefault();
              submitCreate();
            }}
          >
            <input
              className="group-inline-input"
              value={draft}
              placeholder={t("group_name_placeholder")}
              aria-label={t("group_new")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <button type="submit">{t("group_create_and_add")}</button>
          </form>
        </div>
      )}
      <div className="selection-action-row">
        <span className="selection-count">{t("group_selected_count").replace("{count}", String(count))}</span>
        <div className="selection-action-buttons">
          <button type="button" data-testid="selection-add" title={t("group_add_to_title")} onClick={() => setOpen((value) => !value)}>
            {t("group_add_to")}
          </button>
          <button
            type="button"
            data-testid="selection-remove"
            title={t("group_remove_from_title")}
            disabled={!activeGroup}
            onClick={onRemoveFromGroup}
          >
            {t("group_remove_from")}
          </button>
          <button type="button" data-testid="selection-pin" onClick={onPin}>
            {t("group_pin")}
          </button>
          <button type="button" data-testid="selection-unpin" onClick={onUnpin}>
            {t("group_unpin")}
          </button>
          <button type="button" className="danger" data-testid="selection-delete" onClick={onDelete}>
            {t("group_delete_items")}
          </button>
          <button type="button" data-testid="selection-clear" onClick={onClear}>
            {t("group_cancel_selection")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectionActionBar;
