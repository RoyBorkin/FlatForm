//! Sheetform desktop shell. All geometry runs in the web front end (WASM and
//! Web Workers); the native side only provides file dialogs and file access.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Sheetform");
}
