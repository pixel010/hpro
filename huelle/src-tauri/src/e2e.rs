//! Test build only (`--features e2e`, huelle/scripts/e2e-ipc.sh). Records every command the
//! IPC accepted, offers a canary command and runs a driver script in the main frame. Release
//! builds contain none of this (build.rs registers these commands only with the feature).

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use tauri::ipc::CapabilityBuilder;
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, Webview, Wry};

static CANARY: AtomicU32 = AtomicU32::new(0);
static DRIVER_STARTED: AtomicBool = AtomicBool::new(false);

/// Appends one JSON line to `HPRO_E2E_OUT`.
pub fn note(kind: &str, value: &str) {
    if let Ok(path) = std::env::var("HPRO_E2E_OUT") {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{}", serde_json::json!({ "kind": kind, "value": value }));
        }
    }
}

pub fn auto_save_dir() -> Option<PathBuf> {
    std::env::var_os("HPRO_E2E_SAVE_DIR").map(PathBuf::from)
}

pub fn auto_confirm() -> bool {
    std::env::var("HPRO_E2E_CONFIRM").as_deref() == Ok("1")
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.add_capability(
        CapabilityBuilder::new("e2e")
            .window("main")
            .permission("allow-e2e-canary")
            .permission("allow-e2e-report")
            .permission("allow-e2e-exit"),
    )?;
    note("start", env!("CARGO_PKG_VERSION"));
    Ok(())
}

pub fn on_page_load(webview: &Webview<Wry>, payload: &PageLoadPayload<'_>) {
    if payload.event() != PageLoadEvent::Finished || webview.label() != "main" {
        return;
    }
    note("page-load", payload.url().as_str());
    if DRIVER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Ok(path) = std::env::var("HPRO_E2E_JS") {
        match std::fs::read_to_string(&path) {
            Ok(js) => {
                let _ = webview.eval(&js);
            }
            Err(e) => note("driver-error", &e.to_string()),
        }
    }
}

/// Counts its calls; the only command with a visible side effect the attack page aims at.
#[tauri::command]
pub fn e2e_canary(origin: String) -> u32 {
    let n = CANARY.fetch_add(1, Ordering::SeqCst) + 1;
    note("canary", &format!("{n} {origin}"));
    n
}

#[tauri::command]
pub fn e2e_report(value: serde_json::Value) {
    note("report", &value.to_string());
}

#[tauri::command]
pub fn e2e_exit(app: AppHandle, code: i32) {
    note("exit", &code.to_string());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    app.exit(code);
}
