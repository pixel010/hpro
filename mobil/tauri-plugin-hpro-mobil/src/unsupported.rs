//! Every other target: the commands exist so that the app compiles (and its unit tests run on
//! the build host), but they only report that the platform is not supported.
use std::marker::PhantomData;

use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;
use crate::Error;

const NOT_HERE: Error = Error::Unsupported("nur unter Android umgesetzt");

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(_app: &AppHandle<R>, _api: PluginApi<R, C>) -> HproMobil<R> {
    HproMobil(PhantomData)
}

pub struct HproMobil<R: Runtime>(PhantomData<fn() -> R>);

impl<R: Runtime> HproMobil<R> {
    pub async fn take_launch_documents(&self) -> crate::Result<Vec<DocInfo>> {
        Err(NOT_HERE)
    }
    pub async fn pick_document(&self) -> crate::Result<Option<DocInfo>> {
        Err(NOT_HERE)
    }
    pub async fn read_document(&self, _id: &str) -> crate::Result<String> {
        Err(NOT_HERE)
    }
    pub async fn save_document(&self, _name: &str, _mime_type: &str, _data_base64: String) -> crate::Result<Option<DocInfo>> {
        Err(NOT_HERE)
    }
    pub async fn print_html(&self, _html: &str, _job_name: &str) -> crate::Result<PrintJob> {
        Err(NOT_HERE)
    }
}
