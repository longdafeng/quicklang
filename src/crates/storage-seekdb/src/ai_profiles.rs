//! Device-local AI profiles. Public snapshots deliberately exclude encrypted secrets.

use crate::{decode_row, error, json_literal, validate_id, SeekDbEmbeddedAdapter};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use quicklang_domain::AppError;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMetadata {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub transcription_model: String,
    pub has_api_key: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesSnapshot {
    pub profiles: Vec<ProfileMetadata>,
    pub active_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyAction {
    Preserve,
    Replace,
    Clear,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub transcription_model: String,
    pub key_action: KeyAction,
    pub api_key: Option<String>,
}
impl Drop for SaveProfileInput {
    fn drop(&mut self) {
        if let Some(key) = &mut self.api_key {
            key.zeroize();
        }
    }
}
impl SaveProfileInput {
    fn validate(&mut self) -> Result<(), AppError> {
        if let Some(id) = &self.id {
            validate_id(id)?;
        }
        self.name = self.name.trim().into();
        self.base_url = self.base_url.trim().into();
        self.model = self.model.trim().into();
        self.transcription_model = self.transcription_model.trim().into();
        for (value, max, required) in [
            (&self.name, 128, true),
            (&self.model, 256, true),
            (&self.transcription_model, 256, false),
            (&self.base_url, 2048, true),
        ] {
            if (required && value.is_empty())
                || value.len() > max
                || value.chars().any(char::is_control)
            {
                return Err(error("INVALID_INPUT", "Invalid AI profile field"));
            }
        }
        let url = url::Url::parse(&self.base_url)
            .map_err(|_| error("INVALID_INPUT", "Invalid service URL"))?;
        let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some_and(|q| !q.is_empty())
            || url.fragment().is_some_and(|f| !f.is_empty())
            || !(url.scheme() == "https" || (url.scheme() == "http" && local))
        {
            return Err(error(
                "INVALID_INPUT",
                "Use HTTPS or local HTTP without credentials, query or fragment",
            ));
        }
        match self.key_action {
            KeyAction::Replace => {
                let key = self.api_key.as_deref().unwrap_or("").trim();
                if key.is_empty() || key.len() > 8192 || key.chars().any(char::is_control) {
                    return Err(error("INVALID_INPUT", "Replacement API key is invalid"));
                }
            }
            _ if self.api_key.is_some() => {
                return Err(error("INVALID_INPUT", "API key requires replace action"))
            }
            _ => {}
        }
        Ok(())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSettings {
    pub base_url: String,
    pub model: String,
    pub transcription_model: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedProfile {
    pub settings: ResolvedSettings,
    pub api_key: String,
}
impl Drop for ResolvedProfile {
    fn drop(&mut self) {
        self.api_key.zeroize();
    }
}

/// Owned, non-serializable point-in-time snapshot for off-thread resolution.
/// Contains only the selected profile's settings and ciphertext, never a native
/// connection or master key. Concurrent edits/deletion do not mutate this request.
pub struct CredentialSnapshot {
    id: String,
    settings: ResolvedSettings,
    encrypted_key: Option<EncryptedKey>,
}
impl CredentialSnapshot {
    pub fn resolve(self, keys: &impl MasterKeyStore) -> Result<ResolvedProfile, AppError> {
        let api_key = match &self.encrypted_key {
            Some(encrypted) => decrypt(&*master_key(keys, true)?, &self.id, encrypted)?,
            None => String::new(),
        };
        Ok(ResolvedProfile {
            settings: self.settings,
            api_key,
        })
    }
}

/// Implementations must distinguish a missing item from inaccessible/corrupt storage.
pub trait MasterKeyStore {
    fn load(&self) -> Result<Option<Vec<u8>>, AppError>;
    /// Create only: never overwrite an existing master key.
    fn create(&self, key: &[u8]) -> Result<(), AppError>;
}
#[derive(Clone, Deserialize, Serialize)]
struct EncryptedKey {
    version: u8,
    nonce: [u8; 12],
    ciphertext: Vec<u8>,
}
fn crypto_error() -> AppError {
    error(
        "AI_KEY_DECRYPT_FAILED",
        "Unable to authenticate stored API key",
    )
}
fn encrypt(key: &[u8; 32], id: &str, plaintext: &str) -> Result<EncryptedKey, AppError> {
    let mut nonce = [0; 12];
    OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|_| error("AI_RANDOM_FAILED", "Secure randomness unavailable"))?;
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| crypto_error())?;
    let ciphertext = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext.as_bytes(),
                aad: id.as_bytes(),
            },
        )
        .map_err(|_| error("AI_KEY_ENCRYPT_FAILED", "Unable to encrypt API key"))?;
    Ok(EncryptedKey {
        version: 1,
        nonce,
        ciphertext,
    })
}
fn decrypt(key: &[u8; 32], id: &str, encrypted: &EncryptedKey) -> Result<String, AppError> {
    if encrypted.version != 1 {
        return Err(crypto_error());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| crypto_error())?;
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(
                Nonce::from_slice(&encrypted.nonce),
                Payload {
                    msg: &encrypted.ciphertext,
                    aad: id.as_bytes(),
                },
            )
            .map_err(|_| crypto_error())?,
    );
    std::str::from_utf8(&plaintext)
        .map(str::to_owned)
        .map_err(|_| crypto_error())
}
fn master_key(
    store: &impl MasterKeyStore,
    required: bool,
) -> Result<Zeroizing<[u8; 32]>, AppError> {
    match store.load()?.map(Zeroizing::new) {
        Some(bytes) => {
            let mut key = Zeroizing::new([0; 32]);
            if bytes.len() != 32 {
                return Err(error(
                    "AI_MASTER_KEY_INVALID",
                    "Stored master key is invalid",
                ));
            }
            key.copy_from_slice(&bytes);
            Ok(key)
        }
        None if required => Err(error(
            "AI_MASTER_KEY_MISSING",
            "Master key is missing; restore the original Keychain item",
        )),
        None => {
            let mut key = Zeroizing::new([0; 32]);
            OsRng
                .try_fill_bytes(key.as_mut())
                .map_err(|_| error("AI_RANDOM_FAILED", "Secure randomness unavailable"))?;
            store.create(key.as_ref())?;
            Ok(key)
        }
    }
}
#[derive(Default, Deserialize, Serialize)]
struct StoredProfiles {
    profiles: Vec<StoredProfile>,
    active_id: Option<String>,
    // Sticky even after clearing/deleting secrets: losing a key never silently resets it.
    master_key_initialized: bool,
}
#[derive(Deserialize, Serialize)]
struct StoredProfile {
    metadata: ProfileMetadata,
    encrypted_key: Option<EncryptedKey>,
}
impl StoredProfiles {
    fn snapshot(&self) -> ProfilesSnapshot {
        ProfilesSnapshot {
            profiles: self
                .profiles
                .iter()
                .map(|p| {
                    let mut metadata = p.metadata.clone();
                    metadata.has_api_key = p.encrypted_key.is_some();
                    metadata
                })
                .collect(),
            active_id: self.active_id.clone(),
        }
    }
    fn position(&self, id: &str) -> Result<usize, AppError> {
        validate_id(id)?;
        self.profiles
            .iter()
            .position(|p| p.metadata.id == id)
            .ok_or_else(|| error("NOT_FOUND", "AI profile does not exist"))
    }
    fn save(
        &mut self,
        mut input: SaveProfileInput,
        keys: &impl MasterKeyStore,
    ) -> Result<(), AppError> {
        input.validate()?;
        let index = input
            .id
            .as_deref()
            .map(|id| self.position(id))
            .transpose()?;
        if index.is_none() && self.profiles.len() >= 100 {
            return Err(error("INVALID_INPUT", "AI profile limit reached"));
        }
        let id = match &input.id {
            Some(id) => id.clone(),
            None => {
                let mut bytes = [0; 16];
                OsRng
                    .try_fill_bytes(&mut bytes)
                    .map_err(|_| error("AI_RANDOM_FAILED", "Secure randomness unavailable"))?;
                bytes.iter().map(|b| format!("{b:02x}")).collect()
            }
        };
        let encrypted_key = match input.key_action {
            KeyAction::Preserve => index.and_then(|i| self.profiles[i].encrypted_key.clone()),
            KeyAction::Clear => None,
            KeyAction::Replace => {
                let required = self.master_key_initialized
                    || self.profiles.iter().any(|p| p.encrypted_key.is_some());
                let key = master_key(keys, required)?;
                let encrypted = encrypt(&key, &id, input.api_key.as_deref().unwrap_or("").trim())?;
                self.master_key_initialized = true;
                Some(encrypted)
            }
        };
        let profile = StoredProfile {
            metadata: ProfileMetadata {
                id: id.clone(),
                name: input.name.clone(),
                base_url: input.base_url.clone(),
                model: input.model.clone(),
                transcription_model: input.transcription_model.clone(),
                has_api_key: encrypted_key.is_some(),
            },
            encrypted_key,
        };
        if let Some(i) = index {
            self.profiles[i] = profile;
        } else {
            if self.profiles.is_empty() {
                self.active_id = Some(id);
            }
            self.profiles.push(profile);
        }
        Ok(())
    }
    /// Destructive recovery is explicit and never alters any Keychain item.
    fn reset_credentials(
        &mut self,
        confirmed: bool,
        keys: &impl MasterKeyStore,
    ) -> Result<(), AppError> {
        if !confirmed {
            return Err(error(
                "AI_RECOVERY_CONFIRMATION_REQUIRED",
                "Confirm clearing all stored AI credentials before recovery",
            ));
        }
        // Zeroize even malformed key bytes. Any present item or access error blocks recovery.
        if keys.load()?.map(Zeroizing::new).is_some() {
            return Err(error("AI_RECOVERY_KEY_PRESENT", "Recovery requires a missing master key; existing Keychain items will not be replaced"));
        }
        for profile in &mut self.profiles {
            profile.encrypted_key = None;
            profile.metadata.has_api_key = false;
        }
        self.master_key_initialized = false;
        Ok(())
    }
    fn delete(&mut self, id: &str) -> Result<(), AppError> {
        let index = self.position(id)?;
        self.profiles.remove(index);
        if self.active_id.as_deref() == Some(id) {
            self.active_id = None;
        }
        Ok(())
    }
    fn activate(&mut self, id: &str) -> Result<(), AppError> {
        self.position(id)?;
        self.active_id = Some(id.into());
        Ok(())
    }
    fn credential_snapshot(&self, id: &str) -> Result<CredentialSnapshot, AppError> {
        let profile = &self.profiles[self.position(id)?];
        Ok(CredentialSnapshot {
            id: id.into(),
            encrypted_key: profile.encrypted_key.clone(),
            settings: ResolvedSettings {
                base_url: profile.metadata.base_url.clone(),
                model: profile.metadata.model.clone(),
                transcription_model: profile.metadata.transcription_model.clone(),
            },
        })
    }
    #[cfg(test)]
    fn resolve(&self, id: &str, keys: &impl MasterKeyStore) -> Result<ResolvedProfile, AppError> {
        self.credential_snapshot(id)?.resolve(keys)
    }
}
impl SeekDbEmbeddedAdapter {
    fn read_ai_profiles(&self) -> Result<StoredProfiles, AppError> {
        decode_row(
            &self
                .native
                .execute("SELECT payload FROM ql_ai_profiles WHERE singleton_id=1")?,
        )?
        .ok_or_else(|| error("DB_INVALID_RESULT", "AI profile state is missing"))
    }
    pub fn ai_profiles_list(&self) -> Result<ProfilesSnapshot, AppError> {
        Ok(self.read_ai_profiles()?.snapshot())
    }
    fn update_ai_profiles(
        &self,
        change: impl FnOnce(&mut StoredProfiles) -> Result<(), AppError>,
    ) -> Result<ProfilesSnapshot, AppError> {
        self.native.transaction(|| {
            let mut state = self.read_ai_profiles()?;
            change(&mut state)?;
            self.native.execute(&format!(
                "UPDATE ql_ai_profiles SET payload={} WHERE singleton_id=1",
                json_literal(&state)?
            ))?;
            Ok(state.snapshot())
        })
    }
    pub fn ai_profile_save(
        &self,
        input: SaveProfileInput,
        keys: &impl MasterKeyStore,
    ) -> Result<ProfilesSnapshot, AppError> {
        self.update_ai_profiles(|state| state.save(input, keys))
    }
    pub fn ai_profiles_reset_credentials(
        &self,
        confirmed: bool,
        keys: &impl MasterKeyStore,
    ) -> Result<ProfilesSnapshot, AppError> {
        self.update_ai_profiles(|state| state.reset_credentials(confirmed, keys))
    }
    pub fn ai_profile_delete(&self, id: &str) -> Result<ProfilesSnapshot, AppError> {
        self.update_ai_profiles(|state| state.delete(id))
    }
    pub fn ai_profile_activate(&self, id: &str) -> Result<ProfilesSnapshot, AppError> {
        self.update_ai_profiles(|state| state.activate(id))
    }
    pub fn ai_profile_resolve(
        &self,
        id: &str,
        keys: &impl MasterKeyStore,
    ) -> Result<ResolvedProfile, AppError> {
        self.ai_profile_credential_snapshot(id)?.resolve(keys)
    }
    pub fn ai_profile_credential_snapshot(&self, id: &str) -> Result<CredentialSnapshot, AppError> {
        self.read_ai_profiles()?.credential_snapshot(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_snapshot_is_owned_and_preserves_authenticated_resolution() {
        fn assert_send<T: Send>() {}
        assert_send::<CredentialSnapshot>();
        let keys = MemoryKeys::default();
        let mut state = StoredProfiles::default();
        let mut draft = input();
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("secret".into());
        state.save(draft, &keys).unwrap();
        let id = state.profiles[0].metadata.id.clone();
        let snapshot = state.credential_snapshot(&id).unwrap();
        state.delete(&id).unwrap();
        drop(state);
        let resolved = snapshot.resolve(&keys).unwrap();
        assert_eq!(resolved.api_key, "secret");
    }

    fn input() -> SaveProfileInput {
        SaveProfileInput {
            id: None,
            name: " Work ".into(),
            base_url: "https://example.com/v1".into(),
            model: "chat".into(),
            transcription_model: "".into(),
            key_action: KeyAction::Preserve,
            api_key: None,
        }
    }

    #[derive(Default)]
    struct MemoryKeys(std::cell::RefCell<Option<Vec<u8>>>);
    impl MasterKeyStore for MemoryKeys {
        fn load(&self) -> Result<Option<Vec<u8>>, AppError> {
            Ok(self.0.borrow().clone())
        }
        fn create(&self, key: &[u8]) -> Result<(), AppError> {
            assert!(self.0.borrow().is_none());
            *self.0.borrow_mut() = Some(key.to_vec());
            Ok(())
        }
    }
    #[test]
    fn metadata_management_never_accesses_keychain() {
        struct InaccessibleKeys;
        impl MasterKeyStore for InaccessibleKeys {
            fn load(&self) -> Result<Option<Vec<u8>>, AppError> {
                panic!("Metadata management must not read the Keychain");
            }
            fn create(&self, _: &[u8]) -> Result<(), AppError> {
                panic!("Metadata management must not create a master key");
            }
        }

        let mut state = StoredProfiles::default();
        let mut draft = input();
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("test-secret".into());
        state.save(draft, &MemoryKeys::default()).unwrap();
        let id = state.active_id.clone().unwrap();

        let mut draft = input();
        draft.id = Some(id.clone());
        draft.name = "Updated without credentials".into();
        state.save(draft, &InaccessibleKeys).unwrap();
        assert!(state.snapshot().profiles[0].has_api_key);
        state.activate(&id).unwrap();

        let mut draft = input();
        draft.id = Some(id.clone());
        draft.key_action = KeyAction::Clear;
        state.save(draft, &InaccessibleKeys).unwrap();
        assert!(!state.snapshot().profiles[0].has_api_key);
        assert_eq!(state.resolve(&id, &InaccessibleKeys).unwrap().api_key, "");
        state.delete(&id).unwrap();
        assert!(state.snapshot().profiles.is_empty());
        state.save(input(), &InaccessibleKeys).unwrap();
    }

    #[test]
    fn crud_selection_secret_actions_and_serialization() {
        let keys = MemoryKeys::default();
        let mut state = StoredProfiles::default();
        let mut draft = input();
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("secret-token".into());
        state.save(draft, &keys).unwrap();
        let first = state.active_id.clone().unwrap();
        let snapshot = serde_json::to_value(state.snapshot()).unwrap();
        assert_eq!(snapshot["activeId"], first);
        assert_eq!(snapshot["profiles"][0]["hasApiKey"], true);
        assert!(snapshot["profiles"][0].get("apiKey").is_none());
        assert!(!serde_json::to_string(&state)
            .unwrap()
            .contains("secret-token"));
        let mut draft = input();
        draft.id = Some(first.clone());
        draft.name = "Renamed".into();
        state.save(draft, &keys).unwrap();
        assert_eq!(
            state.resolve(&first, &keys).unwrap().api_key,
            "secret-token"
        );
        state.save(input(), &keys).unwrap();
        let second = state.profiles[1].metadata.id.clone();
        assert_eq!(state.active_id.as_deref(), Some(first.as_str()));
        state.activate(&second).unwrap();
        state = serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
        assert_eq!(state.active_id.as_deref(), Some(second.as_str()));
        state.delete(&second).unwrap();
        assert!(state.active_id.is_none());
        let mut draft = input();
        draft.id = Some(first.clone());
        draft.key_action = KeyAction::Clear;
        state.save(draft, &keys).unwrap();
        assert!(!state.snapshot().profiles[0].has_api_key);
        assert_eq!(state.resolve(&first, &keys).unwrap().api_key, "");
        assert!(state.activate("missing").is_err());
        assert!(state.delete("missing").is_err());
        assert!(state.resolve("missing", &keys).is_err());
        let mut draft = input();
        draft.id = Some("missing".into());
        assert!(state.save(draft, &keys).is_err());
    }
    #[test]
    fn lost_or_corrupt_master_key_fails_closed_even_after_clear() {
        let keys = MemoryKeys::default();
        let mut state = StoredProfiles::default();
        let mut draft = input();
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("secret".into());
        state.save(draft, &keys).unwrap();
        let id = state.active_id.clone().unwrap();
        *keys.0.borrow_mut() = None;
        assert_eq!(
            state.resolve(&id, &keys).err().unwrap().code,
            "AI_MASTER_KEY_MISSING"
        );
        let mut draft = input();
        draft.id = Some(id.clone());
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("replacement".into());
        assert_eq!(
            state.save(draft, &keys).err().unwrap().code,
            "AI_MASTER_KEY_MISSING"
        );
        assert!(keys.0.borrow().is_none());
        let mut draft = input();
        draft.id = Some(id.clone());
        draft.key_action = KeyAction::Clear;
        state.save(draft, &keys).unwrap();
        let mut draft = input();
        draft.id = Some(id);
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("replacement".into());
        assert_eq!(
            state.save(draft, &keys).err().unwrap().code,
            "AI_MASTER_KEY_MISSING"
        );
        *keys.0.borrow_mut() = Some(vec![1; 3]);
        assert!(master_key(&keys, false).is_err());
    }
    #[test]
    fn confirmed_missing_key_recovery_clears_all_secrets_and_allows_reentry() {
        let keys = MemoryKeys::default();
        let mut state = StoredProfiles::default();
        for name in ["First", "Second"] {
            let mut draft = input();
            draft.name = name.into();
            draft.key_action = KeyAction::Replace;
            draft.api_key = Some("old-secret".into());
            state.save(draft, &keys).unwrap();
        }
        let id = state.profiles[1].metadata.id.clone();
        state.activate(&id).unwrap();
        let mut expected = serde_json::to_value(state.snapshot()).unwrap();
        for profile in expected["profiles"].as_array_mut().unwrap() {
            profile["hasApiKey"] = false.into();
        }
        *keys.0.borrow_mut() = None;
        let before = serde_json::to_string(&state).unwrap();
        assert_eq!(
            state.reset_credentials(false, &keys).unwrap_err().code,
            "AI_RECOVERY_CONFIRMATION_REQUIRED"
        );
        assert_eq!(serde_json::to_string(&state).unwrap(), before);
        let mut draft = input();
        draft.id = Some(id.clone());
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("new-secret".into());
        assert_eq!(
            state.save(draft, &keys).unwrap_err().code,
            "AI_MASTER_KEY_MISSING"
        );
        state.reset_credentials(true, &keys).unwrap();
        assert_eq!(serde_json::to_value(state.snapshot()).unwrap(), expected);
        assert!(state.profiles.iter().all(|p| p.encrypted_key.is_none()));
        assert!(!state.master_key_initialized);
        assert!(keys.0.borrow().is_none());
        let mut draft = input();
        draft.id = Some(id.clone());
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("new-secret".into());
        state.save(draft, &keys).unwrap();
        assert_eq!(state.resolve(&id, &keys).unwrap().api_key, "new-secret");
        assert!(state.master_key_initialized);
    }

    #[test]
    fn recovery_denies_present_malformed_and_inaccessible_keys_without_mutation() {
        struct Inaccessible;
        impl MasterKeyStore for Inaccessible {
            fn load(&self) -> Result<Option<Vec<u8>>, AppError> {
                Err(error("AI_KEYCHAIN_UNAVAILABLE", "Unavailable"))
            }
            fn create(&self, _: &[u8]) -> Result<(), AppError> {
                panic!("recovery must never create a key")
            }
        }
        let keys = MemoryKeys::default();
        let mut state = StoredProfiles::default();
        let mut draft = input();
        draft.key_action = KeyAction::Replace;
        draft.api_key = Some("secret".into());
        state.save(draft, &keys).unwrap();
        let before = serde_json::to_string(&state).unwrap();
        for bytes in [vec![1; 32], vec![1; 3]] {
            *keys.0.borrow_mut() = Some(bytes.clone());
            assert_eq!(
                state.reset_credentials(true, &keys).unwrap_err().code,
                "AI_RECOVERY_KEY_PRESENT"
            );
            assert_eq!(serde_json::to_string(&state).unwrap(), before);
            assert_eq!(*keys.0.borrow(), Some(bytes));
        }
        assert_eq!(
            state
                .reset_credentials(true, &Inaccessible)
                .unwrap_err()
                .code,
            "AI_KEYCHAIN_UNAVAILABLE"
        );
        assert_eq!(serde_json::to_string(&state).unwrap(), before);
    }

    #[test]
    #[ignore = "requires pinned native seekdb runtime"]
    fn native_profiles_persist_across_reopen() {
        let directory = std::env::temp_dir().join(format!(
            "quicklang-ai-profiles-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        let keys = MemoryKeys::default();
        let id;
        {
            let db = SeekDbEmbeddedAdapter::open(&directory).unwrap();
            assert!(db.ai_profiles_list().unwrap().profiles.is_empty());
            let mut draft = input();
            draft.key_action = KeyAction::Replace;
            draft.api_key = Some("native-secret".into());
            let snapshot = db.ai_profile_save(draft, &keys).unwrap();
            id = snapshot.active_id.unwrap();
        }
        {
            let db = SeekDbEmbeddedAdapter::open(&directory).unwrap();
            assert_eq!(
                db.ai_profiles_list().unwrap().active_id.as_deref(),
                Some(id.as_str())
            );
            assert_eq!(
                db.ai_profile_resolve(&id, &keys).unwrap().api_key,
                "native-secret"
            );
            *keys.0.borrow_mut() = None;
            assert!(db.ai_profiles_reset_credentials(false, &keys).is_err());
            assert!(db.ai_profiles_list().unwrap().profiles[0].has_api_key);
            let snapshot = db.ai_profiles_reset_credentials(true, &keys).unwrap();
            assert_eq!(snapshot.active_id.as_deref(), Some(id.as_str()));
            assert!(!snapshot.profiles[0].has_api_key);
        }
        {
            let db = SeekDbEmbeddedAdapter::open(&directory).unwrap();
            assert!(!db.ai_profiles_list().unwrap().profiles[0].has_api_key);
            let mut draft = input();
            draft.id = Some(id.clone());
            draft.key_action = KeyAction::Replace;
            draft.api_key = Some("recovered-secret".into());
            db.ai_profile_save(draft, &keys).unwrap();
            assert_eq!(
                db.ai_profile_resolve(&id, &keys).unwrap().api_key,
                "recovered-secret"
            );
            let snapshot = db.ai_profile_delete(&id).unwrap();
            assert!(snapshot.active_id.is_none());
            assert!(snapshot.profiles.is_empty());
        }
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn validates_frontend_url_policy_and_explicit_key_actions() {
        for url in [
            "https://example.com/v1",
            "http://localhost:4000/v1",
            "http://127.0.0.1/v1",
            "http://[::1]/v1",
        ] {
            let mut draft = input();
            draft.base_url = url.into();
            assert!(draft.validate().is_ok(), "{url}");
        }
        for url in [
            "http://example.com",
            "https://u:p@example.com",
            "https://example.com?key=x",
            "https://example.com/#secret",
            "file:///tmp/key",
            "not a url",
        ] {
            let mut draft = input();
            draft.base_url = url.into();
            assert!(draft.validate().is_err(), "{url}");
        }
        let mut draft = input();
        draft.name = " ".into();
        assert!(draft.validate().is_err());
        draft = input();
        draft.api_key = Some("secret".into());
        assert!(draft.validate().is_err());
        draft.key_action = KeyAction::Replace;
        assert!(draft.validate().is_ok());
        draft.api_key = Some(" ".into());
        assert!(draft.validate().is_err());
    }

    #[test]
    fn encryption_is_random_authenticated_versioned_and_profile_bound() {
        let key = [7; 32];
        let first = encrypt(&key, "profile-a", "secret").unwrap();
        let second = encrypt(&key, "profile-a", "secret").unwrap();
        assert_ne!(first.nonce, second.nonce);
        assert_ne!(first.ciphertext, second.ciphertext);
        assert_eq!(decrypt(&key, "profile-a", &first).unwrap(), "secret");
        assert!(decrypt(&[8; 32], "profile-a", &first).is_err());
        assert!(decrypt(&key, "profile-b", &first).is_err());
        let mut tampered = first.clone();
        tampered.ciphertext[0] ^= 1;
        assert!(decrypt(&key, "profile-a", &tampered).is_err());
        tampered = first.clone();
        tampered.nonce[0] ^= 1;
        assert!(decrypt(&key, "profile-a", &tampered).is_err());
        tampered = first;
        tampered.version = 2;
        assert!(decrypt(&key, "profile-a", &tampered).is_err());
    }
}
