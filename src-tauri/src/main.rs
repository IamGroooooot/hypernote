#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod contracts;

use contracts::{NoteDocument, NoteMeta, PeerInfo};

#[tauri::command]
fn create_note() -> NoteMeta {
    let now = chrono_like_now();
    NoteMeta {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        created_at: now,
        updated_at: now,
        deleted_at: None,
    }
}

#[tauri::command]
fn open_note(note_id: String) -> Result<NoteDocument, String> {
    let now = chrono_like_now();
    Ok(NoteDocument {
        meta: NoteMeta {
            id: note_id,
            title: "Untitled".to_string(),
            created_at: now,
            updated_at: now,
            deleted_at: None,
        },
        yjs_state: Vec::new(),
        markdown: String::new(),
    })
}

#[tauri::command]
fn apply_local_edit(_note_id: String, _update: Vec<u8>) {}

#[tauri::command]
fn apply_peer_update(_note_id: String, _update: Vec<u8>) {}

#[tauri::command]
fn list_notes() -> Vec<NoteMeta> {
    Vec::new()
}

#[tauri::command]
fn delete_note_to_trash(_note_id: String) {}

#[tauri::command]
fn list_peers() -> Vec<PeerInfo> {
    Vec::new()
}

fn chrono_like_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn main() {
    tauri::Builder::default()
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
