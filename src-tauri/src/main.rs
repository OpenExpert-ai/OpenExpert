// SPDX-License-Identifier: MIT
// OpenExpert desktop shell.
//
// This is intentionally tiny: the Node orchestrator (`openexpert desktop`)
// starts the local server and then launches this binary. The window loads the
// server over HTTP, so all application logic stays in the web app while this
// shell only provides a native window (WebKitGTK on Linux).
//
// The address is not baked into the binary: `openexpert desktop` exports the URL
// it is actually serving in OPENEXPERT_DESKTOP_URL, so `PORT=3100 openexpert`
// opens the window on 3100. Without that variable — a binary launched straight
// from a package, or `tauri dev` — the window keeps the address in
// `tauri.conf.json`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("window `main` is declared in tauri.conf.json");

            // The window is configured hidden so its first paint is already the
            // right page: loading the compiled-in 3000 and then navigating would
            // show whatever is listening there before switching.
            if let Ok(raw) = std::env::var("OPENEXPERT_DESKTOP_URL") {
                match raw.parse::<tauri::Url>() {
                    Ok(url) => {
                        if let Err(error) = window.navigate(url) {
                            eprintln!("OpenExpert: no se pudo cargar {raw}: {error}");
                        }
                    }
                    Err(error) => {
                        eprintln!("OpenExpert: OPENEXPERT_DESKTOP_URL no es una URL válida ({raw}): {error}");
                    }
                }
            }

            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenExpert desktop");
}
