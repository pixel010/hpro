// The app manifest lists every command the mobile shell offers; capabilities/main.json grants
// them to the main window only. Same names as the desktop shell (huelle/src-tauri/build.rs) where
// the meaning is the same, so the reader's bridge (app/src/desktop.ts) works unchanged.
const COMMANDS: &[&str] = &["take_launch_files", "open_dialog", "read_document", "save_as", "print_html"];
const E2E_COMMANDS: &[&str] = &["e2e_canary", "e2e_report", "e2e_exit", "e2e_mode"];

fn main() {
    let mut commands: Vec<&'static str> = COMMANDS.to_vec();
    if std::env::var_os("CARGO_FEATURE_E2E").is_some() {
        commands.extend_from_slice(E2E_COMMANDS);
    }
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(Box::leak(commands.into_boxed_slice()))),
    )
    .expect("tauri build script failed");
}
