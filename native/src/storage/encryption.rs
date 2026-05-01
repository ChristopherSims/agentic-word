//! AES-256-GCM encryption/decryption for document content.
//! Uses aes-gcm crate with SHA-256 key derivation.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};

/// Encrypt plaintext with a password-derived key.
/// Returns (nonce_base64, ciphertext_base64, salt_base64).
pub fn encrypt(plaintext: &[u8], password: &str) -> Result<(String, String, String), String> {
    // Generate a random salt and nonce
    let mut salt = [0u8; 16];
    let mut nonce_bytes = [0u8; 12];
    use rand::Rng as _;
    rand::thread_rng().fill(&mut salt);
    rand::thread_rng().fill(&mut nonce_bytes);

    // Derive key from password + salt using SHA-256
    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption error: {}", e))?;

    Ok((
        base64_encode(&nonce_bytes),
        base64_encode(&ciphertext),
        base64_encode(&salt),
    ))
}

/// Decrypt ciphertext using password, nonce, and salt.
pub fn decrypt(
    ciphertext_b64: &str,
    nonce_b64: &str,
    salt_b64: &str,
    password: &str,
) -> Result<Vec<u8>, String> {
    let ciphertext = base64_decode(ciphertext_b64)?;
    let nonce_bytes = base64_decode(nonce_b64)?;
    let salt = base64_decode(salt_b64)?;

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("Decryption error: {}", e))
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(salt);
    let result = hasher.finalize();

    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    Ok(key)
}

fn base64_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("Base64 decode error: {}", e))
}
