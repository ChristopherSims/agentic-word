use napi_derive::napi;

#[napi]
pub fn ping() -> String {
    "pong from Rust".to_string()
}
