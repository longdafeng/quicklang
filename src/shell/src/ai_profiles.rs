//! Native profile commands; plaintext credentials are returned only by explicit resolve.
use crate::storage::StorageService;
use quicklang_domain::AppError;
use quicklang_storage_seekdb::ai_profiles::{
    MasterKeyStore, ProfilesSnapshot, ResolvedProfile, SaveProfileInput,
};

pub struct KeychainMasterKey;
#[cfg(target_os = "macos")]
impl MasterKeyStore for KeychainMasterKey {
    fn load(&self) -> Result<Option<Vec<u8>>, AppError> {
        use security_framework::os::macos::keychain::SecKeychain;
        let keychain = SecKeychain::default().map_err(|_| keychain_error())?;
        match keychain.find_generic_password("com.quicklang.ai-profiles", "master-key-v1") {
            Ok((password, _)) => Ok(Some(password.as_ref().to_vec())),
            Err(error) if error.code() == -25300 => Ok(None), // errSecItemNotFound only
            Err(_) => Err(keychain_error()),
        }
    }
    fn create(&self, key: &[u8]) -> Result<(), AppError> {
        use security_framework::os::macos::keychain::SecKeychain;
        // Add-only API rejects duplicates instead of overwriting another database's key.
        SecKeychain::default()
            .and_then(|keychain| {
                keychain.add_generic_password("com.quicklang.ai-profiles", "master-key-v1", key)
            })
            .map_err(|_| keychain_error())
    }
}
#[cfg(not(target_os = "macos"))]
impl MasterKeyStore for KeychainMasterKey {
    fn load(&self) -> Result<Option<Vec<u8>>, AppError> {
        Err(keychain_error())
    }
    fn create(&self, _: &[u8]) -> Result<(), AppError> {
        Err(keychain_error())
    }
}
fn keychain_error() -> AppError {
    AppError::new(
        "AI_KEYCHAIN_UNAVAILABLE",
        "Cannot access the macOS Keychain master key",
        false,
    )
}

pub enum ProfileOperation {
    List,
    Save(SaveProfileInput),
    Delete(String),
    Activate(String),
    ResetCredentials(bool),
}
#[tauri::command]
pub async fn ai_profiles_list(
    storage: tauri::State<'_, StorageService>,
) -> Result<ProfilesSnapshot, AppError> {
    storage.ai_profiles(ProfileOperation::List).await
}
#[tauri::command]
pub async fn ai_profiles_reset_credentials(
    storage: tauri::State<'_, StorageService>,
    confirmed: bool,
) -> Result<ProfilesSnapshot, AppError> {
    storage
        .ai_profiles(ProfileOperation::ResetCredentials(confirmed))
        .await
}
#[tauri::command]
pub async fn ai_profile_save(
    storage: tauri::State<'_, StorageService>,
    input: SaveProfileInput,
) -> Result<ProfilesSnapshot, AppError> {
    storage.ai_profiles(ProfileOperation::Save(input)).await
}
#[tauri::command]
pub async fn ai_profile_delete(
    storage: tauri::State<'_, StorageService>,
    id: String,
) -> Result<ProfilesSnapshot, AppError> {
    storage.ai_profiles(ProfileOperation::Delete(id)).await
}
#[tauri::command]
pub async fn ai_profile_activate(
    storage: tauri::State<'_, StorageService>,
    id: String,
) -> Result<ProfilesSnapshot, AppError> {
    storage.ai_profiles(ProfileOperation::Activate(id)).await
}
#[tauri::command]
pub async fn ai_profile_resolve(
    storage: tauri::State<'_, StorageService>,
    id: String,
) -> Result<ResolvedProfile, AppError> {
    storage.ai_profile_resolve(id).await
}
