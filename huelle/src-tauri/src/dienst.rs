//! Sidecar for the local services (docs/06, 4.1: `WeasyPrintSidecar`): `hpro-dienst` is bundled
//! next to the shell binary (tauri.conf.json `externalBin`) and runs one command line call of the
//! hpro service (dienst/, P9) per request. No server, no port, nothing stays running.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub struct Output {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

/// The sidecar next to the running executable (bundle and `target/<profile>` alike).
pub fn sidecar_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("kein Programmverzeichnis")?;
    let name = if cfg!(windows) { "hpro-dienst.exe" } else { "hpro-dienst" };
    let p = dir.join(name);
    if p.is_file() { Ok(p) } else { Err(format!("Sidecar fehlt: {}", p.display())) }
}

/// Runs the sidecar with `args`; kills it after `timeout`.
pub fn run(args: &[&std::ffi::OsStr], timeout: Duration) -> Result<Output, String> {
    let mut child = Command::new(sidecar_path()?)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Sidecar startet nicht: {e}"))?;
    let mut out = child.stdout.take().unwrap();
    let mut err = child.stderr.take().unwrap();
    let t_out = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = out.read_to_end(&mut b);
        b
    });
    let t_err = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = err.read_to_string(&mut s);
        s
    });
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Sidecar nach {} s abgebrochen", timeout.as_secs()));
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    Ok(Output { code: status.code().unwrap_or(-1), stdout: t_out.join().unwrap_or_default(), stderr: t_err.join().unwrap_or_default() })
}

/// Only conformance levels the service knows (docs/11) reach the command line.
pub fn check_conformance(value: &str) -> Result<(), String> {
    const KNOWN: &[&str] = &["PDF/A-2a", "PDF/A-2b", "PDF/A-3a", "PDF/A-3b", "PDF/UA-1", "PDF/UA-2"];
    if value.is_empty() || value.split(',').any(|v| !KNOWN.contains(&v)) {
        return Err(format!("unbekannte Stufe: {value}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn conformance_whitelist() {
        assert!(super::check_conformance("PDF/A-2a,PDF/UA-1").is_ok());
        assert!(super::check_conformance("PDF/A-2a;rm -rf").is_err());
        assert!(super::check_conformance("--html=/etc/passwd").is_err());
        assert!(super::check_conformance("").is_err());
    }
}
