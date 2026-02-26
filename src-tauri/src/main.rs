#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod contracts;

use std::collections::HashMap;
use std::sync::Mutex;

use contracts::{CommandAck, NoteDocument, NoteMeta, PeerInfo, PeerUpdateEvent};
use tauri::Emitter;

#[derive(Default)]
struct AppState {
    notes: Mutex<HashMap<String, NoteDocument>>,
    peers: Mutex<HashMap<String, PeerInfo>>,
}

#[tauri::command]
fn create_note(state: tauri::State<'_, AppState>) -> NoteMeta {
    let now = unix_now_ms();
    let meta = NoteMeta {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        created_at: now,
        updated_at: now,
        deleted_at: None,
    };

    let mut notes = state.notes.lock().expect("note store poisoned");
    notes.insert(
        meta.id.clone(),
        NoteDocument {
            meta: meta.clone(),
            yjs_state: Vec::new(),
            markdown: String::new(),
        },
    );

    meta
}

#[tauri::command]
fn open_note(note_id: String, state: tauri::State<'_, AppState>) -> Result<NoteDocument, String> {
    let notes = state.notes.lock().map_err(|_| "note store poisoned")?;

    notes
        .get(&note_id)
        .cloned()
        .ok_or_else(|| format!("note not found: {note_id}"))
}

#[tauri::command]
fn apply_local_edit(
    note_id: String,
    update: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> CommandAck {
    let mut notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("note store poisoned".to_string()),
            }
        }
    };

    if let Some(note) = notes.get_mut(&note_id) {
        note.yjs_state = update;
        note.meta.updated_at = unix_now_ms();
        return CommandAck {
            accepted: true,
            reason: None,
        };
    }

    CommandAck {
        accepted: false,
        reason: Some(format!("note not found: {note_id}")),
    }
}

#[tauri::command]
fn apply_peer_update(
    note_id: String,
    update: Vec<u8>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CommandAck {
    let mut notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("note store poisoned".to_string()),
            }
        }
    };

    if let Some(note) = notes.get_mut(&note_id) {
        note.yjs_state = update.clone();
        note.meta.updated_at = unix_now_ms();

        let payload = PeerUpdateEvent {
            note_id,
            update,
        };

        if let Err(error) = app.emit("hypernote://peer-update", payload) {
            return CommandAck {
                accepted: false,
                reason: Some(format!("emit failed: {error}")),
            };
        }

        return CommandAck {
            accepted: true,
            reason: None,
        };
    }

    CommandAck {
        accepted: false,
        reason: Some("note not found".to_string()),
    }
}

#[tauri::command]
fn list_notes(state: tauri::State<'_, AppState>) -> Vec<NoteMeta> {
    let notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let mut metas: Vec<NoteMeta> = notes.values().map(|note| note.meta.clone()).collect();
    metas.sort_by_key(|note| std::cmp::Reverse(note.updated_at));
    metas
}

#[tauri::command]
fn delete_note_to_trash(note_id: String, state: tauri::State<'_, AppState>) -> CommandAck {
    let mut notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("note store poisoned".to_string()),
            }
        }
    };

    if notes.remove(&note_id).is_some() {
        return CommandAck {
            accepted: true,
            reason: None,
        };
    }

    CommandAck {
        accepted: false,
        reason: Some("note not found".to_string()),
    }
}

#[tauri::command]
fn list_peers(state: tauri::State<'_, AppState>) -> Vec<PeerInfo> {
    let peers = match state.peers.lock() {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    peers.values().cloned().collect()
}

fn unix_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            create_note,
            open_note,
            apply_local_edit,
            apply_peer_update,
            list_notes,
            delete_note_to_trash,
            list_peers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
