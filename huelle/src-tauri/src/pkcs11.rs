//! Signing with a key the system holds (docs/06, 4.1: `Pkcs11Signer`). The private key never
//! leaves the token; the web side receives the certificate and the raw signature value. Works with
//! any PKCS#11 module: p11-kit-proxy (system trust module list), OpenSC for smart cards, vendor
//! middleware, SoftHSM for tests.

use cryptoki::context::{CInitializeArgs, CInitializeFlags, Pkcs11};
use cryptoki::mechanism::Mechanism;
use cryptoki::object::{Attribute, AttributeType, ObjectClass};
use cryptoki::session::UserType;
use cryptoki::slot::Slot;
use cryptoki::types::AuthPin;
use serde::Serialize;
use sha2::{Digest, Sha256, Sha384};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    /// `<slot>:<hex CKA_ID>`
    pub key_id: String,
    pub label: String,
    pub token: String,
    /// DER certificate, Base64.
    pub certificate: String,
}

/// Module from `HPRO_PKCS11_MODULE`, otherwise the first one found among the usual system paths.
pub fn module_path() -> Result<String, String> {
    if let Ok(p) = std::env::var("HPRO_PKCS11_MODULE") {
        return Ok(p);
    }
    const CANDIDATES: &[&str] = &[
        "/usr/lib/x86_64-linux-gnu/p11-kit-proxy.so",
        "/usr/lib64/p11-kit-proxy.so",
        "/usr/lib/p11-kit-proxy.so",
        "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
        "/usr/lib64/opensc-pkcs11.so",
        "/Library/OpenSC/lib/opensc-pkcs11.so",
        "C:\\Windows\\System32\\opensc-pkcs11.dll",
    ];
    CANDIDATES
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|p| p.to_string())
        .ok_or_else(|| "kein PKCS#11-Modul gefunden (HPRO_PKCS11_MODULE setzen)".to_string())
}

fn open() -> Result<Pkcs11, String> {
    let ctx = Pkcs11::new(module_path()?).map_err(|e| format!("PKCS#11-Modul: {e}"))?;
    ctx.initialize(CInitializeArgs::new(CInitializeFlags::OS_LOCKING_OK)).map_err(|e| format!("C_Initialize: {e}"))?;
    Ok(ctx)
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("Schlüsselkennung ungültig".into());
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "Schlüsselkennung ungültig".to_string())).collect()
}

/// Certificates on all tokens (public objects, no login needed).
pub fn list_keys() -> Result<Vec<KeyInfo>, String> {
    use base64::Engine;
    let ctx = open()?;
    let mut out = Vec::new();
    for slot in ctx.get_slots_with_token().map_err(|e| e.to_string())? {
        // Readers without a card and uninitialised tokens (SoftHSM always offers a free one)
        // have nothing to list.
        let Ok(info) = ctx.get_token_info(slot) else { continue };
        if !info.token_initialized() {
            continue;
        }
        let token = info.label().trim().to_string();
        let Ok(session) = ctx.open_ro_session(slot) else { continue };
        for obj in session.find_objects(&[Attribute::Class(ObjectClass::CERTIFICATE)]).map_err(|e| e.to_string())? {
            let attrs = session.get_attributes(obj, &[AttributeType::Value, AttributeType::Id, AttributeType::Label]).map_err(|e| e.to_string())?;
            let (mut der, mut id, mut label) = (Vec::new(), Vec::new(), String::new());
            for a in attrs {
                match a {
                    Attribute::Value(v) => der = v,
                    Attribute::Id(v) => id = v,
                    Attribute::Label(v) => label = String::from_utf8_lossy(&v).into_owned(),
                    _ => {}
                }
            }
            if der.is_empty() || id.is_empty() {
                continue;
            }
            out.push(KeyInfo {
                key_id: format!("{}:{}", slot.id(), hex(&id)),
                label,
                token: token.clone(),
                certificate: base64::engine::general_purpose::STANDARD.encode(der),
            });
        }
    }
    Ok(out)
}

/// Signature value in XML-DSig encoding over `data` (the canonical `SignedInfo`): PKCS#1 v1.5
/// for RSA, raw `r || s` for ECDSA (what PKCS#11 returns for CKM_ECDSA).
pub fn sign(key_id: &str, algorithm: &str, data: &[u8], pin: &str) -> Result<Vec<u8>, String> {
    let (slot_id, id_hex) = key_id.split_once(':').ok_or("Schlüsselkennung ungültig")?;
    let slot_id: u64 = slot_id.parse().map_err(|_| "Schlüsselkennung ungültig")?;
    let id = unhex(id_hex)?;
    let (mechanism, input): (Mechanism, Vec<u8>) = match algorithm {
        "RSASSA-PKCS1-v1_5-SHA256" => (Mechanism::Sha256RsaPkcs, data.to_vec()),
        "ECDSA-P256-SHA256" => (Mechanism::Ecdsa, Sha256::digest(data).to_vec()),
        "ECDSA-P384-SHA384" => (Mechanism::Ecdsa, Sha384::digest(data).to_vec()),
        other => return Err(format!("Algorithmus nicht unterstützt: {other}")),
    };
    let ctx = open()?;
    let slot: Slot = ctx
        .get_slots_with_token()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|s| s.id() == slot_id)
        .ok_or("Token nicht gefunden")?;
    let session = ctx.open_ro_session(slot).map_err(|e| e.to_string())?;
    session.login(UserType::User, Some(&AuthPin::from(pin.to_string()))).map_err(|e| format!("Anmeldung am Token: {e}"))?;
    let keys = session
        .find_objects(&[Attribute::Class(ObjectClass::PRIVATE_KEY), Attribute::Id(id)])
        .map_err(|e| e.to_string())?;
    let key = *keys.first().ok_or("privater Schlüssel nicht gefunden")?;
    let sig = session.sign(&mechanism, key, &input).map_err(|e| format!("C_Sign: {e}"));
    let _ = session.logout();
    sig
}

#[cfg(test)]
mod tests {
    #[test]
    fn key_ids_round_trip() {
        assert_eq!(super::unhex(&super::hex(&[0, 1, 0xab])).unwrap(), vec![0, 1, 0xab]);
        assert!(super::unhex("abc").is_err());
        assert!(super::sign("x", "RSASSA-PKCS1-v1_5-SHA256", b"", "").is_err());
        assert!(super::sign("1:00", "RSASSA-PSS-SHA256", b"", "").unwrap_err().contains("nicht unterstützt"));
    }
}
