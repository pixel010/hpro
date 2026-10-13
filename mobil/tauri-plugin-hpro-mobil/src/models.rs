use serde::{Deserialize, Serialize};

/// A document the user handed to the app; `id` is all the web side gets, never a path or URI.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocInfo {
    pub id: String,
    pub name: String,
    pub size: i64,
}

#[derive(Debug, Deserialize)]
pub struct Documents {
    pub documents: Vec<DocInfo>,
}

#[derive(Debug, Deserialize)]
pub struct MaybeDocument {
    pub document: Option<DocInfo>,
}

#[derive(Debug, Deserialize)]
pub struct Data {
    pub data: String,
}

#[derive(Debug, Serialize)]
pub struct IdArgs<'a> {
    pub id: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveArgs<'a> {
    pub name: &'a str,
    pub mime_type: &'a str,
    pub data: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintArgs<'a> {
    pub html: &'a str,
    pub job_name: &'a str,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJob {
    pub job_name: String,
    pub state: i32,
}
