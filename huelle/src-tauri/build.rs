// The app manifest lists every command the shell offers. Tauri then generates one
// `allow-<command>` permission per command and rejects any command that no capability grants
// (capabilities/main.json grants them to the main window only, for the local app origin).
const COMMANDS: &[&str] = &[
    "take_launch_files",
    "open_dialog",
    "read_document",
    "save_as",
    "pdf_export",
    "services_status",
    "system_keys",
    "system_sign",
];
const E2E_COMMANDS: &[&str] = &["e2e_canary", "e2e_report", "e2e_exit"];

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
