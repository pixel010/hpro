//! hpro mobile shell (P12 spike): Tauri 2 around the same web core as the PWA and the desktop
//! shell (huelle/dist-web, built from app/). Android only so far; iOS could not be built on the
//! Linux test host (docs/15).
//!
//! The commands carry the names of the desktop shell where they mean the same, so the reader's
//! bridge (app/src/desktop.ts) needs no mobile branch for opening and saving. Files never become
//! paths or URIs on the web side: the Kotlin plugin (tauri-plugin-hpro-mobil) keeps the content
//! URIs and hands out ids. Every command is async: the plugin answers on the Android main thread,
//! a sync command waiting for it there would block it.

#[cfg(feature = "e2e")]
mod e2e;

use base64::Engine;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::AppHandle;
use tauri_plugin_hpro_mobil::{DocInfo, HproMobilExt, PrintJob};

fn header(request: &Request<'_>, name: &str) -> Option<String> {
    let v = request.headers().get(name)?.to_str().ok()?;
    percent_encoding::percent_decode_str(v).decode_utf8().ok().map(|s| s.into_owned())
}

/// Only the file name part of a suggestion from the web side, never a path.
fn safe_file_name(name: &str, fallback: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("").trim().trim_start_matches('.');
    let clean: String = base.chars().filter(|c| !c.is_control()).collect();
    if clean.is_empty() { fallback.to_string() } else { clean }
}

fn mime_type(name: &str) -> &'static str {
    match name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).as_deref() {
        Some("hpro") => "application/vnd.hpro+zip",
        Some("epub") => "application/epub+zip",
        Some("pdf") => "application/pdf",
        Some("csv") => "text/csv",
        Some("json") => "application/json",
        Some("html") | Some("htm") => "text/html",
        _ => "application/octet-stream",
    }
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Documents another app handed over (file manager, mail, share sheet) that the reader has not
/// shown yet.
#[tauri::command]
async fn take_launch_files(app: AppHandle) -> Result<Vec<DocInfo>, String> {
    app.hpro_mobil().take_launch_documents().await.map_err(err)
}

/// The system document picker (Storage Access Framework).
#[tauri::command]
async fn open_dialog(app: AppHandle) -> Result<Option<DocInfo>, String> {
    app.hpro_mobil().pick_document().await.map_err(err)
}

/// Bytes of a document the user handed over or picked.
#[tauri::command]
async fn read_document(app: AppHandle, id: String) -> Result<Response, String> {
    let b64 = app.hpro_mobil().read_document(&id).await.map_err(err)?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(err)?;
    Ok(Response::new(bytes))
}

/// Save as: the system's create-document dialog decides place and name. Header `x-hpro-name`:
/// suggested file name.
#[tauri::command]
async fn save_as(app: AppHandle, request: Request<'_>) -> Result<Option<DocInfo>, String> {
    let bytes = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        InvokeBody::Json(_) => return Err("Inhalt fehlt (Bytes erwartet)".into()),
    };
    let name = safe_file_name(&header(&request, "x-hpro-name").unwrap_or_default(), "dokument.hpro");
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    app.hpro_mobil().save_document(&name, mime_type(&name), data).await.map_err(err)
}

/// Prints the reader's finished print document through the Android print framework
/// (`window.print()` does nothing in an Android WebView, docs/06 A10).
#[tauri::command]
async fn print_html(app: AppHandle, html: String, title: String) -> Result<PrintJob, String> {
    let job = safe_file_name(&title, "hpro");
    app.hpro_mobil().print_html(&html, &job).await.map_err(err)
}

type Handler = Box<dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync>;

#[cfg(not(feature = "e2e"))]
fn handler() -> Handler {
    Box::new(tauri::generate_handler![take_launch_files, open_dialog, read_document, save_as, print_html])
}

#[cfg(feature = "e2e")]
fn handler() -> Handler {
    Box::new(tauri::generate_handler![
        take_launch_files,
        open_dialog,
        read_document,
        save_as,
        print_html,
        e2e::e2e_canary,
        e2e::e2e_report,
        e2e::e2e_exit,
        e2e::e2e_mode,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let handler = handler();
    let builder = tauri::Builder::default().plugin(tauri_plugin_hpro_mobil::init()).setup(|_app| {
        #[cfg(feature = "e2e")]
        e2e::setup(_app)?;
        Ok(())
    });
    #[cfg(feature = "e2e")]
    let builder = builder.on_page_load(e2e::on_page_load);
    builder
        .invoke_handler(move |invoke| {
            #[cfg(feature = "e2e")]
            e2e::note("accepted", invoke.message.command());
            handler(invoke)
        })
        .run(tauri::generate_context!())
        .expect("hpro-reader: Start fehlgeschlagen");
}

#[cfg(test)]
mod tests {
    use super::{mime_type, safe_file_name};

    #[test]
    fn suggested_names_lose_their_path() {
        assert_eq!(safe_file_name("../../etc/passwd", "x"), "passwd");
        assert_eq!(safe_file_name("", "dokument.hpro"), "dokument.hpro");
        assert_eq!(safe_file_name("Bericht-geändert.hpro", "x"), "Bericht-geändert.hpro");
    }

    #[test]
    fn mime_types_of_saved_files() {
        assert_eq!(mime_type("a-signiert.hpro"), "application/vnd.hpro+zip");
        assert_eq!(mime_type("tabelle.CSV"), "text/csv");
        assert_eq!(mime_type("ohne"), "application/octet-stream");
    }

    /// The capability grants exactly the commands of build.rs, nothing from core or plugins.
    #[test]
    fn capability_grants_only_the_shell_commands() {
        let cap: serde_json::Value = serde_json::from_str(include_str!("../capabilities/main.json")).unwrap();
        assert_eq!(cap["windows"], serde_json::json!(["main"]));
        assert!(cap.get("remote").is_none(), "no remote origin may use the IPC");
        let granted: Vec<&str> = cap["permissions"].as_array().unwrap().iter().map(|p| p.as_str().unwrap()).collect();
        let build_rs = include_str!("../build.rs");
        let start = build_rs.find("const COMMANDS").unwrap();
        let list = &build_rs[start..start + build_rs[start..].find("];").unwrap()];
        let commands: Vec<String> = list.split('"').skip(1).step_by(2).map(|c| format!("allow-{}", c.replace('_', "-"))).collect();
        assert_eq!(granted, commands.iter().map(String::as_str).collect::<Vec<_>>());
        assert!(granted.iter().all(|p| !p.contains(':')), "no plugin or core permission: {granted:?}");
    }
}
