use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
pub struct CustomGroup {
    pub id: i64,
    pub name: String,
    pub count: i32,
    pub sort_order: i64,
}

/// Groups live in their own SQLite file so clipboard.db keeps the upstream schema.
pub struct GroupStore {
    conn: Mutex<Connection>,
}

impl GroupStore {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS tiez_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tiez_group_items (
                group_id INTEGER NOT NULL,
                entry_id INTEGER NOT NULL,
                PRIMARY KEY (group_id, entry_id),
                FOREIGN KEY (group_id) REFERENCES tiez_groups(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_tiez_group_items_entry
                ON tiez_group_items(entry_id);
            ",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn list(&self) -> Result<Vec<CustomGroup>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT g.id, g.name, g.sort_order, COUNT(i.entry_id)
                 FROM tiez_groups g
                 LEFT JOIN tiez_group_items i ON i.group_id = g.id
                 GROUP BY g.id
                 ORDER BY g.sort_order ASC, g.id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(CustomGroup {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    sort_order: row.get(2)?,
                    count: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn create(&self, name: &str) -> Result<CustomGroup, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Empty group name".to_string());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let next_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tiez_groups",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO tiez_groups (name, sort_order, created_at) VALUES (?1, ?2, ?3)",
            params![name, next_order, now_ms()],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        Ok(CustomGroup {
            id,
            name: name.to_string(),
            count: 0,
            sort_order: next_order,
        })
    }

    pub fn rename(&self, id: i64, name: &str) -> Result<(), String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("Empty group name".to_string());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let changed = conn
            .execute(
                "UPDATE tiez_groups SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("Group not found".to_string());
        }
        Ok(())
    }

    pub fn reorder(&self, ids: &[i64]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for (index, id) in ids.iter().enumerate() {
            conn.execute(
                "UPDATE tiez_groups SET sort_order = ?1 WHERE id = ?2",
                params![index as i64, id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Removes the group and its memberships. Clipboard rows are not touched.
    pub fn delete_group(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM tiez_group_items WHERE group_id = ?", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM tiez_groups WHERE id = ?", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_items(&self, group_id: i64, entry_ids: &[i64]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for entry_id in entry_ids {
            if *entry_id <= 0 {
                continue;
            }
            conn.execute(
                "INSERT OR IGNORE INTO tiez_group_items (group_id, entry_id) VALUES (?1, ?2)",
                params![group_id, entry_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn remove_items(&self, group_id: i64, entry_ids: &[i64]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for entry_id in entry_ids {
            conn.execute(
                "DELETE FROM tiez_group_items WHERE group_id = ?1 AND entry_id = ?2",
                params![group_id, entry_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn move_items(&self, from_group_id: i64, to_group_id: i64, entry_ids: &[i64]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for entry_id in entry_ids {
            if *entry_id <= 0 {
                continue;
            }
            conn.execute(
                "DELETE FROM tiez_group_items WHERE group_id = ?1 AND entry_id = ?2",
                params![from_group_id, entry_id],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR IGNORE INTO tiez_group_items (group_id, entry_id) VALUES (?1, ?2)",
                params![to_group_id, entry_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn entry_ids(&self, group_id: i64) -> Result<Vec<i64>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT entry_id FROM tiez_group_items WHERE group_id = ?")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![group_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn protected_ids(&self) -> Vec<i64> {
        let Ok(conn) = self.conn.lock() else {
            return Vec::new();
        };
        let Ok(mut stmt) = conn.prepare("SELECT DISTINCT entry_id FROM tiez_group_items") else {
            return Vec::new();
        };
        stmt.query_map([], |row| row.get(0))
            .ok()
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }

    pub fn contains_entry(&self, entry_id: i64) -> bool {
        let Ok(conn) = self.conn.lock() else {
            return false;
        };
        conn.query_row(
            "SELECT 1 FROM tiez_group_items WHERE entry_id = ? LIMIT 1",
            params![entry_id],
            |_| Ok(()),
        )
        .is_ok()
    }

    pub fn forget_entry(&self, entry_id: i64) {
        let _ = self.forget_entries(&[entry_id]);
    }

    pub fn forget_entries(&self, entry_ids: &[i64]) -> Result<(), String> {
        if entry_ids.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for entry_id in entry_ids {
            conn.execute(
                "DELETE FROM tiez_group_items WHERE entry_id = ?",
                params![entry_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn member_ids(&self) -> HashSet<i64> {
        self.protected_ids().into_iter().collect()
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
