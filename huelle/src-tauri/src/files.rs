//! Files the user handed to the shell: launch arguments (file manager, second instance) and the
//! open dialog. The web side only ever sees an opaque id and the file name; it cannot name a
//! path to read or write (docs/14, section 3).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

/// Largest document the shell reads (same order as the service limit of 200 MiB, docs/11).
pub const MAX_DOCUMENT_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Serialize)]
pub struct DocInfo {
    pub id: String,
    pub name: String,
    pub size: u64,
}

#[derive(Default)]
pub struct Registry {
    next: AtomicU64,
    docs: Mutex<HashMap<String, PathBuf>>,
    pending: Mutex<Vec<String>>,
}

impl Registry {
    /// Registers a path the user chose; returns its id and metadata.
    pub fn register(&self, path: &Path) -> Result<DocInfo, String> {
        let meta = std::fs::metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
        if !meta.is_file() {
            return Err(format!("{} ist keine Datei", path.display()));
        }
        let id = format!("d{}", self.next.fetch_add(1, Ordering::Relaxed) + 1);
        self.docs.lock().unwrap().insert(id.clone(), path.to_path_buf());
        Ok(DocInfo { id, name: file_name(path), size: meta.len() })
    }

    /// Registers launch arguments and queues them for `take_launch_files`.
    pub fn queue_launch(&self, args: &[String], cwd: &Path) -> usize {
        let mut n = 0;
        for path in launch_paths(args, cwd) {
            if let Ok(info) = self.register(&path) {
                self.pending.lock().unwrap().push(info.id);
                n += 1;
            }
        }
        n
    }

    pub fn take_pending(&self) -> Vec<DocInfo> {
        let ids: Vec<String> = std::mem::take(&mut *self.pending.lock().unwrap());
        let docs = self.docs.lock().unwrap();
        ids.into_iter()
            .filter_map(|id| {
                let path = docs.get(&id)?;
                let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
                Some(DocInfo { name: file_name(path), id, size })
            })
            .collect()
    }

    pub fn path(&self, id: &str) -> Option<PathBuf> {
        self.docs.lock().unwrap().get(id).cloned()
    }
}

pub fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Paths among launch arguments: plain paths (relative to `cwd`) and `file://` URIs; options
/// and anything that is not an existing file are ignored.
pub fn launch_paths(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| {
            let p = if let Some(rest) = a.strip_prefix("file://") {
                let decoded = percent_encoding::percent_decode_str(rest).decode_utf8().ok()?;
                PathBuf::from(decoded.trim_start_matches("localhost").to_string())
            } else {
                PathBuf::from(a)
            };
            let p = if p.is_absolute() { p } else { cwd.join(p) };
            p.is_file().then_some(p)
        })
        .collect()
}

/// Writes `bytes` next to the target and renames, so a failed write never leaves half a file.
pub fn write_atomically(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = target.parent().ok_or("Zielpfad ohne Verzeichnis")?;
    let tmp = dir.join(format!(".{}.hpro-tmp-{}", file_name(target), std::process::id()));
    std::fs::write(&tmp, bytes).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("{}: {e}", target.display())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_paths_accepts_paths_and_file_uris_only() {
        let dir = std::env::temp_dir().join(format!("hpro-launch-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a b.hpro");
        std::fs::write(&f, b"x").unwrap();
        let args = vec![
            "--flag".to_string(),
            "a b.hpro".to_string(),
            format!("file://{}", dir.join("a%20b.hpro").display()),
            "fehlt.hpro".to_string(),
            dir.display().to_string(),
        ];
        let got = launch_paths(&args, &dir);
        assert_eq!(got, vec![f.clone(), f]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn registry_hands_out_ids_not_paths() {
        let dir = std::env::temp_dir().join(format!("hpro-reg-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("x.hpro"), b"abc").unwrap();
        let r = Registry::default();
        assert_eq!(r.queue_launch(&["x.hpro".into()], &dir), 1);
        let p = r.take_pending();
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].name, "x.hpro");
        assert_eq!(p[0].size, 3);
        assert!(!p[0].id.contains('/'));
        assert!(r.take_pending().is_empty());
        assert!(r.path("unbekannt").is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
