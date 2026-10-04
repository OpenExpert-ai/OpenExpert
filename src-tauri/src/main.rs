// SPDX-License-Identifier: MIT
// OpenExpert desktop shell.
//
// This is intentionally tiny: the Node orchestrator (`openexpert desktop`)
// starts the local server and then launches this binary. The window loads
// http://localhost:3000, so all application logic stays in the web app while
// this shell only provides a native window (WebKitGTK on Linux).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running OpenExpert desktop");
}
