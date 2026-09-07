//! Integration boundary. No implicit memory or SQLite fallback.
use quicklang_domain::AppError;
use std::path::Path;

pub struct SeekDbEmbeddedAdapter;
impl SeekDbEmbeddedAdapter {
    pub fn open(_data_dir: &Path) -> Result<Self, AppError> {
        Err(AppError::new(
            "DB_NOT_CONFIGURED",
            "seekdb embedded binding and packaged runtime are not integrated yet",
            false,
        ))
    }
}
