use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(_app: &AppHandle<R>, api: PluginApi<R, C>) -> crate::Result<HproMobil<R>> {
    Ok(HproMobil(api.register_android_plugin("org.hpro.mobil", "HproPlugin")?))
}

/// Each call is answered by the Kotlin side; file access there runs off the UI thread. Call
/// these only from async commands: Tauri dispatches the Kotlin command on the main thread and
/// a sync command waiting for it would block that very thread.
pub struct HproMobil<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> HproMobil<R> {
    pub async fn take_launch_documents(&self) -> crate::Result<Vec<DocInfo>> {
        let d: Documents = self.0.run_mobile_plugin_async("takeLaunchDocuments", ()).await?;
        Ok(d.documents)
    }

    pub async fn pick_document(&self) -> crate::Result<Option<DocInfo>> {
        let d: MaybeDocument = self.0.run_mobile_plugin_async("pickDocument", ()).await?;
        Ok(d.document)
    }

    /// Base64 as the Kotlin side sent it; the app decodes it.
    pub async fn read_document(&self, id: &str) -> crate::Result<String> {
        let d: Data = self.0.run_mobile_plugin_async("readDocument", IdArgs { id }).await?;
        Ok(d.data)
    }

    pub async fn save_document(&self, name: &str, mime_type: &str, data_base64: String) -> crate::Result<Option<DocInfo>> {
        let d: MaybeDocument = self.0.run_mobile_plugin_async("saveDocument", SaveArgs { name, mime_type, data: data_base64 }).await?;
        Ok(d.document)
    }

    pub async fn print_html(&self, html: &str, job_name: &str) -> crate::Result<PrintJob> {
        Ok(self.0.run_mobile_plugin_async("printHtml", PrintArgs { html, job_name }).await?)
    }
}
