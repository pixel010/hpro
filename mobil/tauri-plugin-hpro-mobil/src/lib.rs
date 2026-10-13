//! hpro mobile plugin (P12). The Kotlin part (android/src/main/java/HproPlugin.kt) receives
//! documents from other apps, opens and saves through the Storage Access Framework and prints
//! through the Android print framework. The app calls it from its own commands; the plugin has
//! no command of its own for the web side (build.rs).
//!
//! iOS: not implemented. The Swift part could not be built or run on the Linux test host
//! (docs/15, criterion 3).

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod error;
mod models;

pub use error::{Error, Result};
pub use models::*;

#[cfg(target_os = "android")]
mod mobile;
#[cfg(target_os = "android")]
pub use mobile::HproMobil;

#[cfg(not(target_os = "android"))]
mod unsupported;
#[cfg(not(target_os = "android"))]
pub use unsupported::HproMobil;

/// Access from the app: `app.hpro_mobil()`.
pub trait HproMobilExt<R: Runtime> {
    fn hpro_mobil(&self) -> &HproMobil<R>;
}

impl<R: Runtime, T: Manager<R>> HproMobilExt<R> for T {
    fn hpro_mobil(&self) -> &HproMobil<R> {
        self.state::<HproMobil<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("hpro-mobil")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let plugin = mobile::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let plugin = unsupported::init(app, api);
            app.manage(plugin);
            Ok(())
        })
        .build()
}
