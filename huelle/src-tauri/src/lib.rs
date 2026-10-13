//! hpro desktop shell (P11): Tauri 2 around the same web core as the PWA (app/).
//!
//! The shell adds what a browser cannot do on every system: file association, open and save
//! through native dialogs, the local services as a sidecar and signing with a system key. Every
//! command is listed in build.rs and granted to the main window only (capabilities/main.json);
//! the document frame inside the reader gets no command (tested by huelle/scripts/e2e-ipc.sh,
//! docs/14).

mod dienst;
mod files;
mod pkcs11;
#[cfg(feature = "e2e")]
mod e2e;

use std::time::Duration;

use files::{DocInfo, Registry};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const MAIN: &str = "main";

fn header(request: &Request<'_>, name: &str) -> Option<String> {
    let v = request.headers().get(name)?.to_str().ok()?;
    percent_encoding::percent_decode_str(v).decode_utf8().ok().map(|s| s.into_owned())
}

fn body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(b) => Ok(b.clone()),
        InvokeBody::Json(_) => Err("Inhalt fehlt (Bytes erwartet)".into()),
    }
}

/// Only the file name part of a suggestion from the web side, never a path.
fn safe_file_name(name: &str, fallback: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("").trim().trim_start_matches('.');
    let clean: String = base.chars().filter(|c| !c.is_control()).collect();
    if clean.is_empty() { fallback.to_string() } else { clean }
}

fn set_title(app: &AppHandle, name: &str) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.set_title(&format!("{name} – hpro Reader"));
    }
}

/// Files from the command line or a second instance that the reader has not shown yet.
#[tauri::command]
fn take_launch_files(registry: State<'_, Registry>) -> Vec<DocInfo> {
    registry.take_pending()
}

/// Native open dialog; the chosen file becomes readable through its id.
#[tauri::command]
async fn open_dialog(app: AppHandle, registry: State<'_, Registry>) -> Result<Option<DocInfo>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("hpro-Dokument öffnen")
        .add_filter("hpro-Dokument", &["hpro", "epub"])
        .blocking_pick_file();
    match picked {
        None => Ok(None),
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            registry.register(&path).map(Some)
        }
    }
}

/// Bytes of a file the user opened (launch argument or dialog).
#[tauri::command]
fn read_document(app: AppHandle, registry: State<'_, Registry>, id: String) -> Result<Response, String> {
    let path = registry.path(&id).ok_or("unbekanntes Dokument")?;
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > files::MAX_DOCUMENT_BYTES {
        return Err(format!("Datei zu groß ({size} Bytes)"));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    set_title(&app, &files::file_name(&path));
    Ok(Response::new(bytes))
}

/// Saves bytes under a name the user confirms in the native save dialog. Header `x-hpro-name`:
/// suggested file name; `x-hpro-near`: id of an opened document whose folder is the default.
/// There is no command that writes without the dialog.
#[tauri::command]
async fn save_as(app: AppHandle, registry: State<'_, Registry>, request: Request<'_>) -> Result<Option<DocInfo>, String> {
    let bytes = body(&request)?;
    let name = safe_file_name(&header(&request, "x-hpro-name").unwrap_or_default(), "dokument.hpro");
    let near = header(&request, "x-hpro-near").and_then(|id| registry.path(&id)).and_then(|p| p.parent().map(|d| d.to_path_buf()));
    #[cfg(feature = "e2e")]
    if let Some(dir) = e2e::auto_save_dir() {
        let target = dir.join(&name);
        files::write_atomically(&target, &bytes)?;
        e2e::note("save_as", &target.display().to_string());
        return registry.register(&target).map(Some);
    }
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_string()).unwrap_or_else(|| "hpro".into());
    let mut dialog = app.dialog().file().set_title("Speichern unter").set_file_name(&name).add_filter(ext.to_uppercase(), &[ext.as_str()]);
    if let Some(dir) = near {
        dialog = dialog.set_directory(dir);
    }
    match dialog.blocking_save_file() {
        None => Ok(None),
        Some(fp) => {
            let target = fp.into_path().map_err(|e| e.to_string())?;
            files::write_atomically(&target, &bytes)?;
            registry.register(&target).map(Some)
        }
    }
}

/// Which local services the sidecar finds (`hpro-dienst status`).
#[tauri::command]
async fn services_status() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let out = dienst::run(&["status".as_ref()], Duration::from_secs(120))?;
        if out.code != 0 {
            return Err(format!("hpro-dienst status: Exit {}: {}", out.code, out.stderr.trim()));
        }
        serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// PDF export through the sidecar (WeasyPrint + veraPDF, docs/11). Body: container bytes;
/// header `x-hpro-conformance`. Answer: 4 bytes big-endian length of the JSON report, the
/// report, then the PDF.
#[tauri::command]
async fn pdf_export(request: Request<'_>) -> Result<Response, String> {
    let bytes = body(&request)?;
    let conformance = header(&request, "x-hpro-conformance").unwrap_or_else(|| "PDF/A-2a,PDF/UA-1".into());
    dienst::check_conformance(&conformance)?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = std::env::temp_dir().join(format!("hpro-export-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let (src, pdf, report) = (dir.join("ein.hpro"), dir.join("aus.pdf"), dir.join("bericht.json"));
        let result = (|| {
            std::fs::write(&src, &bytes).map_err(|e| e.to_string())?;
            let out = dienst::run(
                &["export".as_ref(), src.as_os_str(), pdf.as_os_str(), "--conformance".as_ref(), conformance.as_ref(), "--bericht".as_ref(), report.as_os_str()],
                Duration::from_secs(600),
            )?;
            if out.code > 1 {
                return Err(format!("hpro-dienst export: Exit {}: {}", out.code, out.stderr.trim()));
            }
            let report = std::fs::read(&report).unwrap_or_else(|_| b"{}".to_vec());
            let pdf = std::fs::read(&pdf).map_err(|e| e.to_string())?;
            let mut answer = (report.len() as u32).to_be_bytes().to_vec();
            answer.extend_from_slice(&report);
            answer.extend_from_slice(&pdf);
            Ok(answer)
        })();
        let _ = std::fs::remove_dir_all(&dir);
        result.map(Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Certificates of the system's PKCS#11 tokens.
#[tauri::command]
async fn system_keys() -> Result<Vec<pkcs11::KeyInfo>, String> {
    tauri::async_runtime::spawn_blocking(pkcs11::list_keys).await.map_err(|e| e.to_string())?
}

/// Signs `data` (body: canonical `SignedInfo`) with a token key. Headers: `x-hpro-key`,
/// `x-hpro-algorithm`, `x-hpro-pin`, `x-hpro-description`. A native confirmation names key and
/// document before the token is used; the answer is the raw signature value.
#[tauri::command]
async fn system_sign(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let data = body(&request)?;
    let key = header(&request, "x-hpro-key").ok_or("Schlüssel fehlt")?;
    let algorithm = header(&request, "x-hpro-algorithm").ok_or("Algorithmus fehlt")?;
    let pin = header(&request, "x-hpro-pin").unwrap_or_default();
    let description = header(&request, "x-hpro-description").unwrap_or_default();
    let label = pkcs11::list_keys()?.into_iter().find(|k| k.key_id == key).map(|k| format!("{} ({})", k.label, k.token)).ok_or("Schlüssel nicht gefunden")?;
    let text = format!("Mit dem Schlüssel „{label}“ signieren?\n\n{description}");
    #[cfg(feature = "e2e")]
    let confirmed = if e2e::auto_confirm() { e2e::note("system_sign confirm", &text); true } else { false };
    #[cfg(not(feature = "e2e"))]
    let confirmed = false;
    let confirmed = confirmed
        || app
            .dialog()
            .message(text)
            .title("Signieren")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Signieren".into(), "Abbrechen".into()))
            .blocking_show();
    if !confirmed {
        return Err("abgebrochen".into());
    }
    tauri::async_runtime::spawn_blocking(move || pkcs11::sign(&key, &algorithm, &data, &pin))
        .await
        .map_err(|e| e.to_string())?
        .map(Response::new)
}

type Handler = Box<dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync>;

/// The release command set (build.rs, capabilities/main.json).
#[cfg(not(feature = "e2e"))]
fn handler() -> Handler {
    Box::new(tauri::generate_handler![
        take_launch_files,
        open_dialog,
        read_document,
        save_as,
        pdf_export,
        services_status,
        system_keys,
        system_sign,
    ])
}

/// Test build: the same commands plus the three e2e commands.
#[cfg(feature = "e2e")]
fn handler() -> Handler {
    Box::new(tauri::generate_handler![
        take_launch_files,
        open_dialog,
        read_document,
        save_as,
        pdf_export,
        services_status,
        system_keys,
        system_sign,
        e2e::e2e_canary,
        e2e::e2e_report,
        e2e::e2e_exit,
    ])
}

pub fn run() {
    let handler = handler();
    let builder = tauri::Builder::default()
        // Must come first: a second start (file manager, double click) hands its files to the
        // running instance and exits.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let registry = app.state::<Registry>();
            if registry.queue_launch(&argv[1.min(argv.len())..], std::path::Path::new(&cwd)) > 0 {
                if let Some(w) = app.get_webview_window(MAIN) {
                    let _ = w.eval("window.dispatchEvent(new Event('hpro-desktop-open'))");
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        }))
        // Used from Rust only; capabilities/main.json grants none of its JS commands.
        .plugin(tauri_plugin_dialog::init())
        .manage(Registry::default())
        .setup(|app| {
            let args: Vec<String> = std::env::args().skip(1).collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            let n = app.state::<Registry>().queue_launch(&args, &cwd);
            eprintln!("hpro-reader: {n} Datei(en) beim Start übergeben");
            #[cfg(feature = "e2e")]
            e2e::setup(app)?;
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
    use super::safe_file_name;

    #[test]
    fn suggested_names_lose_their_path() {
        assert_eq!(safe_file_name("../../etc/passwd", "x"), "passwd");
        assert_eq!(safe_file_name("C:\\a\\b.hpro", "x"), "b.hpro");
        assert_eq!(safe_file_name(".bashrc", "x"), "bashrc");
        assert_eq!(safe_file_name("", "dokument.hpro"), "dokument.hpro");
        assert_eq!(safe_file_name("Bericht-geändert.hpro", "x"), "Bericht-geändert.hpro");
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
