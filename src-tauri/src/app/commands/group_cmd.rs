use crate::app_state::{AppDataDir, SessionHistory};
use crate::database::DbState;
use crate::domain::models::ClipboardEntry;
use crate::error::{AppError, AppResult};
use crate::infrastructure::repository::clipboard_repo::ClipboardRepository;
use crate::infrastructure::repository::group_repo::CustomGroup;
use crate::services::clipboard::{build_entry_preview, derive_rich_text_content};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct GroupInfo {
    pub id: i64,
    pub name: String,
    pub count: i32,
    pub sort_order: i64,
}

#[derive(Serialize)]
pub struct IdRemap {
    pub from: i64,
    pub to: i64,
}

fn to_info(group: CustomGroup) -> GroupInfo {
    GroupInfo {
        id: group.id,
        name: group.name,
        count: group.count,
        sort_order: group.sort_order,
    }
}

fn prune_missing_members(state: &DbState) {
    let members = state.groups.member_ids();
    if members.is_empty() {
        return;
    }
    let Ok(conn) = state.conn.lock() else {
        return;
    };
    let missing: Vec<i64> = members
        .into_iter()
        .filter(|id| {
            conn.query_row(
                "SELECT 1 FROM clipboard_history WHERE id = ? LIMIT 1",
                [*id],
                |_| Ok(()),
            )
            .is_err()
        })
        .collect();
    drop(conn);
    let _ = state.groups.forget_entries(&missing);
}

fn persist_session_item(
    state: &DbState,
    session: &SessionHistory,
    app_data: &AppDataDir,
    id: i64,
) -> Result<i64, String> {
    if id > 0 {
        return Ok(id);
    }
    let mut session_items = session.0.lock().unwrap();
    let Some(index) = session_items.iter().position(|item| item.id == id) else {
        return Err("Item not found".to_string());
    };
    let item = session_items[index].clone();
    let data_dir = app_data.0.lock().unwrap().clone();
    let new_id = state.repo.save(&item, Some(&data_dir))?;
    session_items[index].id = new_id;
    Ok(new_id)
}

fn resolve_ids(
    state: &DbState,
    session: &SessionHistory,
    app_data: &AppDataDir,
    entry_ids: &[i64],
) -> Result<(Vec<i64>, Vec<IdRemap>), String> {
    let mut stored = Vec::with_capacity(entry_ids.len());
    let mut remaps = Vec::new();
    for id in entry_ids {
        let next = persist_session_item(state, session, app_data, *id)?;
        if next != *id {
            remaps.push(IdRemap {
                from: *id,
                to: next,
            });
        }
        if next > 0 {
            stored.push(next);
        }
    }
    Ok((stored, remaps))
}

fn normalize_item(item: &mut ClipboardEntry) {
    if item.content_type == "rich_text" {
        let normalized = derive_rich_text_content(&item.content, item.html_content.as_deref());
        if !normalized.trim().is_empty() {
            item.content = normalized;
        }
    }
    if matches!(
        item.content_type.as_str(),
        "text" | "code" | "url" | "rich_text"
    ) && item.content.chars().count() > 50000
    {
        item.content = format!(
            "{}... [Content Truncated]",
            item.content.chars().take(50000).collect::<String>()
        );
    }
    if matches!(
        item.content_type.as_str(),
        "text" | "code" | "url" | "rich_text"
    ) {
        item.preview = build_entry_preview(
            &item.content_type,
            &item.content,
            item.html_content.as_deref(),
        );
    }
}

#[tauri::command]
pub fn list_custom_groups(state: State<'_, DbState>) -> AppResult<Vec<GroupInfo>> {
    prune_missing_members(&state);
    state
        .groups
        .list()
        .map(|groups| groups.into_iter().map(to_info).collect())
        .map_err(AppError::from)
}

#[tauri::command]
pub fn create_custom_group(state: State<'_, DbState>, name: String) -> AppResult<GroupInfo> {
    state.groups.create(&name).map(to_info).map_err(AppError::from)
}

#[tauri::command]
pub fn rename_custom_group(state: State<'_, DbState>, id: i64, name: String) -> AppResult<()> {
    state.groups.rename(id, &name).map_err(AppError::from)
}

#[tauri::command]
pub fn reorder_custom_groups(state: State<'_, DbState>, ids: Vec<i64>) -> AppResult<()> {
    state.groups.reorder(&ids).map_err(AppError::from)
}

#[tauri::command]
pub fn delete_custom_group(state: State<'_, DbState>, id: i64) -> AppResult<()> {
    state.groups.delete_group(id).map_err(AppError::from)
}

#[tauri::command]
pub fn add_items_to_group(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    app_data: State<'_, AppDataDir>,
    group_id: i64,
    entry_ids: Vec<i64>,
) -> AppResult<Vec<IdRemap>> {
    let (stored, remaps) = resolve_ids(&state, &session, &app_data, &entry_ids).map_err(AppError::from)?;
    state
        .groups
        .add_items(group_id, &stored)
        .map_err(AppError::from)?;
    let data_dir = app_data.0.lock().unwrap().clone();
    if let Ok(conn) = state.conn.lock() {
        let _ = state.repo.enforce_limit_with_conn(&conn, Some(&data_dir));
    }
    if !remaps.is_empty() {
        crate::services::cloud_sync::request_cloud_sync(app_handle.clone());
    }
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(remaps)
}

#[tauri::command]
pub fn move_items_to_group(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    session: State<'_, SessionHistory>,
    app_data: State<'_, AppDataDir>,
    from_group_id: i64,
    to_group_id: i64,
    entry_ids: Vec<i64>,
) -> AppResult<Vec<IdRemap>> {
    let (stored, remaps) = resolve_ids(&state, &session, &app_data, &entry_ids).map_err(AppError::from)?;
    state
        .groups
        .move_items(from_group_id, to_group_id, &stored)
        .map_err(AppError::from)?;
    let data_dir = app_data.0.lock().unwrap().clone();
    if let Ok(conn) = state.conn.lock() {
        let _ = state.repo.enforce_limit_with_conn(&conn, Some(&data_dir));
    }
    if !remaps.is_empty() {
        crate::services::cloud_sync::request_cloud_sync(app_handle.clone());
    }
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(remaps)
}

#[tauri::command]
pub fn remove_items_from_group(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    group_id: i64,
    entry_ids: Vec<i64>,
) -> AppResult<()> {
    state
        .groups
        .remove_items(group_id, &entry_ids)
        .map_err(AppError::from)?;
    let _ = app_handle.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
pub fn get_custom_group_items(
    state: State<'_, DbState>,
    group_id: i64,
) -> AppResult<Vec<ClipboardEntry>> {
    let ids = state.groups.entry_ids(group_id).map_err(AppError::from)?;
    let mut history = Vec::new();
    for id in ids {
        if let Some(mut item) = state.repo.get_entry_by_id(id).map_err(AppError::from)? {
            normalize_item(&mut item);
            history.push(item);
        }
    }
    history.sort_by(|a, b| {
        b.is_pinned
            .cmp(&a.is_pinned)
            .then_with(|| b.pinned_order.cmp(&a.pinned_order))
            .then_with(|| b.timestamp.cmp(&a.timestamp))
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(history)
}
