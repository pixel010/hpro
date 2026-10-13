//! Test build only (`--features e2e`, mobil/scripts/e2e-android.sh). Same idea as the desktop
//! shell (huelle/src-tauri/src/e2e.rs): records every accepted command, offers a canary command
//! and runs a driver script in the main frame. On Android there is no environment to pass a
//! driver path, so the driver is compiled in and the record goes to the app's data directory
//! (read with `adb shell run-as`). Release builds contain none of this.

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;

use tauri::ipc::CapabilityBuilder;
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, Webview, Wry};

static CANARY: AtomicU32 = AtomicU32::new(0);
static DRIVER_STARTED: AtomicBool = AtomicBool::new(false);
static RECORD: OnceLock<PathBuf> = OnceLock::new();

const DRIVER: &str = include_str!("../../e2e/android-probe.js");

/// Appends one JSON line to the record (`files/e2e/record.jsonl` of the app).
pub fn note(kind: &str, value: &str) {
    if let Some(path) = RECORD.get() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
            let _ = writeln!(f, "{}", serde_json::json!({ "t": ms, "kind": kind, "value": value }));
        }
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?.join("e2e");
    std::fs::create_dir_all(&dir)?;
    let _ = RECORD.set(dir.join("record.jsonl"));
    app.add_capability(
        CapabilityBuilder::new("e2e")
            .window("main")
            .permission("allow-e2e-canary")
            .permission("allow-e2e-report")
            .permission("allow-e2e-exit")
            .permission("allow-e2e-mode"),
    )?;
    note("start", &dir.display().to_string());
    Ok(())
}

pub fn on_page_load(webview: &Webview<Wry>, payload: &PageLoadPayload<'_>) {
    note("page-load", &format!("{:?} {}", payload.event(), payload.url()));
    if payload.event() != PageLoadEvent::Finished || webview.label() != "main" {
        return;
    }
    if DRIVER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Err(e) = webview.eval(DRIVER) {
        note("driver-error", &e.to_string());
    }
}

/// Counts its calls; the command with a visible side effect the attack page aims at.
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

/// Scenario of this run: `files/…/e2e/mode`, written by the test script before the start and
/// changed while it runs (`ipc`, `launch`, `read`, `print`, `exit`).
#[tauri::command]
pub fn e2e_mode() -> String {
    RECORD
        .get()
        .and_then(|r| std::fs::read_to_string(r.with_file_name("mode")).ok())
        .map(|m| m.trim().to_string())
        .unwrap_or_else(|| "ipc".into())
}

#[tauri::command]
pub fn e2e_exit(app: AppHandle, code: i32) {
    note("exit", &code.to_string());
    app.exit(code);
}
