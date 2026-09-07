//! Remote adapter boundary. Credentials belong to the server, never the UI.
use quicklang_domain::AppError;
pub struct OceanBaseAdapter;
impl OceanBaseAdapter {
    pub fn connect() -> Result<Self, AppError> {
        Err(AppError::new(
            "DB_NOT_CONFIGURED",
            "OceanBase adapter is not integrated yet",
            false,
        ))
    }
}
