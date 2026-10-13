// The plugin offers no command to the web side: the app's own commands (mobil/src-tauri) call
// it from Rust, so the capability of the app stays the only list of what the reader may do.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
