//! Owned wrapper over the pinned official C ABI (deps/seekdb/include/seekdb.h).
use libloading::Library;
use quicklang_domain::AppError;
use std::{
    ffi::{c_char, c_int, c_void, CStr, CString},
    marker::PhantomData,
    path::Path,
    ptr,
    rc::Rc,
};
type Handle = *mut c_void;
pub struct Native {
    handle: Handle,
    connection: Handle,
    close: unsafe extern "C" fn(Handle) -> c_int,
    disconnect: unsafe extern "C" fn(Handle) -> c_int,
    query: unsafe extern "C" fn(Handle, *const c_char, i64, *mut Handle) -> c_int,
    last_error: unsafe extern "C" fn(Handle, *mut c_int, *mut *const c_char) -> c_int,
    free: unsafe extern "C" fn(Handle) -> c_int,
    next: unsafe extern "C" fn(Handle) -> c_int,
    columns: unsafe extern "C" fn(Handle, *mut i64) -> c_int,
    get_str: unsafe extern "C" fn(Handle, i64, *mut *const c_char, *mut usize, *mut c_int) -> c_int,
    begin: unsafe extern "C" fn(Handle) -> c_int,
    commit: unsafe extern "C" fn(Handle) -> c_int,
    rollback: unsafe extern "C" fn(Handle) -> c_int,
    _library: Library,
    // Connection remains on its owner thread. No unsafe Send/Sync implementation.
    _not_send_sync: PhantomData<Rc<()>>,
}
impl Native {
    pub fn open(data: &Path, runtime: &Path) -> Result<Self, AppError> {
        if std::env::var_os("SEEKDB_BIN").is_some() {
            return Err(error(
                "DB_RUNTIME_OVERRIDE",
                "Unset SEEKDB_BIN: QuickLang uses its pinned bundled engine",
            ));
        }
        if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            return Err(error(
                "UNSUPPORTED_PLATFORM",
                "Embedded runtime supports macOS ARM64 only",
            ));
        }
        let path = CString::new(
            data.to_str()
                .ok_or_else(|| error("INVALID_PATH", "Path must be UTF-8"))?,
        )
        .map_err(|_| error("INVALID_PATH", "Path contains NUL"))?;
        // SAFETY: packaged library uses the pinned seekdb.h ABI. Handles remain owned below.
        unsafe {
            let library = Library::new(runtime.join("libseekdb.dylib"))
                .map_err(|e| error("DB_RUNTIME_MISSING", &format!("Cannot load seekdb: {e}")))?;
            macro_rules! sym {
                ($name:literal, $ty:ty) => {
                    *library
                        .get::<$ty>(concat!($name, "\0").as_bytes())
                        .map_err(|_| error("DB_ABI_MISMATCH", concat!("Missing ", $name)))?
                };
            }
            let open = sym!(
                "seekdb_open",
                unsafe extern "C" fn(*const c_char, *const *const c_char, *mut Handle) -> c_int
            );
            let connect = sym!(
                "seekdb_connect",
                unsafe extern "C" fn(Handle, *const c_char, bool, *mut Handle) -> c_int
            );
            let mut db = Self {
                handle: ptr::null_mut(),
                connection: ptr::null_mut(),
                close: sym!("seekdb_close", unsafe extern "C" fn(Handle) -> c_int),
                disconnect: sym!("seekdb_disconnect", unsafe extern "C" fn(Handle) -> c_int),
                query: sym!(
                    "seekdb_query",
                    unsafe extern "C" fn(Handle, *const c_char, i64, *mut Handle) -> c_int
                ),
                last_error: sym!(
                    "seekdb_last_error",
                    unsafe extern "C" fn(Handle, *mut c_int, *mut *const c_char) -> c_int
                ),
                free: sym!("seekdb_result_free", unsafe extern "C" fn(Handle) -> c_int),
                next: sym!("seekdb_result_next", unsafe extern "C" fn(Handle) -> c_int),
                columns: sym!(
                    "seekdb_result_column_count",
                    unsafe extern "C" fn(Handle, *mut i64) -> c_int
                ),
                get_str: sym!(
                    "seekdb_result_get_str",
                    unsafe extern "C" fn(
                        Handle,
                        i64,
                        *mut *const c_char,
                        *mut usize,
                        *mut c_int,
                    ) -> c_int
                ),
                begin: sym!("seekdb_trx_begin", unsafe extern "C" fn(Handle) -> c_int),
                commit: sym!("seekdb_trx_commit", unsafe extern "C" fn(Handle) -> c_int),
                rollback: sym!("seekdb_trx_rollback", unsafe extern "C" fn(Handle) -> c_int),
                _library: library,
                _not_send_sync: PhantomData,
            };
            // No port parameter: local Unix socket, no TCP listener requested.
            if open(path.as_ptr(), ptr::null(), &mut db.handle) != 0 {
                return Err(error(
                    "DB_OPEN_FAILED",
                    "seekdb could not start; inspect the database run/log directory",
                ));
            }
            if connect(db.handle, ptr::null(), true, &mut db.connection) != 0 {
                return Err(db.failure());
            }
            db.execute("CREATE DATABASE IF NOT EXISTS quicklang")?;
            db.execute("USE quicklang")?;
            Ok(db)
        }
    }
    fn failure(&self) -> AppError {
        let mut number = 0;
        let mut message = ptr::null();
        // SAFETY: copy the connection-owned error message before any further C call.
        unsafe {
            if !self.connection.is_null() {
                (self.last_error)(self.connection, &mut number, &mut message);
            }
            let text = if message.is_null() {
                "Native seekdb operation failed".into()
            } else {
                CStr::from_ptr(message).to_string_lossy().into_owned()
            };
            error(
                if number == 1062 {
                    "EVENT_CONFLICT"
                } else {
                    "DB_QUERY_FAILED"
                },
                &text,
            )
        }
    }
    pub fn execute(&self, sql: &str) -> Result<Vec<Vec<Option<String>>>, AppError> {
        let sql = CString::new(sql).map_err(|_| error("INVALID_INPUT", "SQL contains NUL"))?;
        let mut raw = ptr::null_mut();
        // SAFETY: synchronous query owns its result until the RAII guard frees it.
        unsafe {
            if (self.query)(
                self.connection,
                sql.as_ptr(),
                sql.as_bytes().len() as i64,
                &mut raw,
            ) != 0
            {
                if !raw.is_null() {
                    (self.free)(raw);
                }
                return Err(self.failure());
            }
            if raw.is_null() {
                return Ok(Vec::new());
            }
            let result = ResultGuard {
                raw,
                free: self.free,
            };
            let mut count = 0;
            if (self.columns)(raw, &mut count) != 0 || !(0..=64).contains(&count) {
                return Err(self.failure());
            }
            if count == 0 {
                return Ok(Vec::new());
            }
            let mut rows = Vec::new();
            loop {
                match (self.next)(result.raw) {
                    -3 => break,
                    0 => {}
                    _ => return Err(self.failure()),
                }
                let mut row = Vec::new();
                for col in 0..count {
                    let mut data = ptr::null();
                    let mut len = 0;
                    let mut null = 0;
                    if (self.get_str)(raw, col, &mut data, &mut len, &mut null) != 0 {
                        return Err(self.failure());
                    }
                    if null != 0 {
                        row.push(None);
                    } else if len == 0 {
                        row.push(Some(String::new()));
                    } else {
                        if data.is_null() {
                            return Err(error("DB_INVALID_RESULT", "Null result buffer"));
                        }
                        let value =
                            std::str::from_utf8(std::slice::from_raw_parts(data.cast::<u8>(), len))
                                .map_err(|_| error("DB_INVALID_RESULT", "Invalid UTF-8"))?;
                        row.push(Some(value.into()));
                    }
                }
                rows.push(row);
            }
            Ok(rows)
        }
    }
    pub fn transaction<T>(&self, f: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError> {
        // SAFETY: owner-thread connection; errors and unwinds trigger rollback.
        unsafe {
            if (self.begin)(self.connection) != 0 {
                return Err(self.failure());
            }
        }
        let mut guard = TransactionGuard {
            db: self,
            committed: false,
        };
        let value = f()?;
        unsafe {
            if (self.commit)(self.connection) != 0 {
                return Err(self.failure());
            }
        }
        guard.committed = true;
        Ok(value)
    }
}
struct ResultGuard {
    raw: Handle,
    free: unsafe extern "C" fn(Handle) -> c_int,
}
impl Drop for ResultGuard {
    fn drop(&mut self) {
        unsafe {
            (self.free)(self.raw);
        }
    }
}
struct TransactionGuard<'a> {
    db: &'a Native,
    committed: bool,
}
impl Drop for TransactionGuard<'_> {
    fn drop(&mut self) {
        if !self.committed {
            unsafe {
                (self.db.rollback)(self.db.connection);
            }
        }
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        // Disconnect before releasing the driver client lock; unload the library last.
        unsafe {
            if !self.connection.is_null() {
                (self.disconnect)(self.connection);
            }
            if !self.handle.is_null() {
                (self.close)(self.handle);
            }
        }
    }
}
pub(crate) fn error(code: &str, message: &str) -> AppError {
    AppError::new(code, message, false)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[derive(Default)]
    struct Calls {
        log: Vec<&'static str>,
        fail: Option<&'static str>,
        row: usize,
    }
    thread_local! { static CALLS: RefCell<Calls> = RefCell::new(Calls::default()); }
    fn call(name: &'static str) -> c_int {
        CALLS.with(|cell| {
            let mut state = cell.borrow_mut();
            state.log.push(name);
            if state.fail == Some(name) {
                -1
            } else {
                0
            }
        })
    }
    unsafe extern "C" fn close(_: Handle) -> c_int {
        call("close")
    }
    unsafe extern "C" fn disconnect(_: Handle) -> c_int {
        call("disconnect")
    }
    unsafe extern "C" fn free(_: Handle) -> c_int {
        call("free")
    }
    unsafe extern "C" fn begin(_: Handle) -> c_int {
        call("begin")
    }
    unsafe extern "C" fn commit(_: Handle) -> c_int {
        call("commit")
    }
    unsafe extern "C" fn rollback(_: Handle) -> c_int {
        call("rollback")
    }
    unsafe extern "C" fn query(_: Handle, _: *const c_char, _: i64, result: *mut Handle) -> c_int {
        *result = ptr::dangling_mut::<u8>().cast();
        call("query")
    }
    unsafe extern "C" fn last_error(
        _: Handle,
        number: *mut c_int,
        message: *mut *const c_char,
    ) -> c_int {
        *number = 1062;
        *message = c"duplicate".as_ptr();
        0
    }
    unsafe extern "C" fn columns(_: Handle, count: *mut i64) -> c_int {
        *count = 3;
        call("columns")
    }
    unsafe extern "C" fn next(_: Handle) -> c_int {
        let result = call("next");
        if result != 0 {
            return result;
        }
        CALLS.with(|cell| {
            let mut state = cell.borrow_mut();
            state.row += 1;
            if state.row == 1 {
                0
            } else {
                -3
            }
        })
    }
    unsafe extern "C" fn get_str(
        _: Handle,
        col: i64,
        data: *mut *const c_char,
        len: *mut usize,
        null: *mut c_int,
    ) -> c_int {
        *null = i32::from(col == 0);
        *len = if col == 2 { 3 } else { 0 };
        *data = c"中".as_ptr();
        call("get_str")
    }
    fn db(fail: Option<&'static str>) -> Native {
        CALLS.with(|cell| {
            *cell.borrow_mut() = Calls {
                fail,
                ..Calls::default()
            }
        });
        Native {
            handle: ptr::dangling_mut::<u8>().cast(),
            connection: ptr::dangling_mut::<u8>().cast(),
            close,
            disconnect,
            query,
            last_error,
            free,
            next,
            columns,
            get_str,
            begin,
            commit,
            rollback,
            _library: libloading::os::unix::Library::this().into(),
            _not_send_sync: PhantomData,
        }
    }
    fn log() -> Vec<&'static str> {
        CALLS.with(|cell| cell.borrow().log.clone())
    }
    #[test]
    fn copies_null_empty_and_utf8_results_and_frees_them() {
        let db = db(None);
        assert_eq!(
            db.execute("SELECT values").unwrap(),
            vec![vec![None, Some(String::new()), Some("中".into())]]
        );
        assert_eq!(log().iter().filter(|&&c| c == "free").count(), 1);
        drop(db);
        assert!(log().ends_with(&["disconnect", "close"]));
    }
    #[test]
    fn frees_results_on_every_query_failure() {
        for failed in ["query", "columns", "next", "get_str"] {
            let db = db(Some(failed));
            assert_eq!(
                db.execute("SELECT values").unwrap_err().code,
                "EVENT_CONFLICT"
            );
            assert_eq!(
                log().iter().filter(|&&c| c == "free").count(),
                1,
                "{failed}"
            );
        }
    }
    #[test]
    fn rejects_nul_before_calling_native_query() {
        let db = db(None);
        assert_eq!(db.execute("SELECT\0").unwrap_err().code, "INVALID_INPUT");
        assert!(log().is_empty());
    }
    #[test]
    fn transaction_commits_once_and_rolls_back_errors_and_panics() {
        let connection = db(None);
        assert_eq!(connection.transaction(|| Ok(42)).unwrap(), 42);
        assert_eq!(log(), vec!["begin", "commit"]);
        drop(connection);
        let connection = db(None);
        assert!(connection
            .transaction::<()>(|| Err(error("TEST", "failure")))
            .is_err());
        assert_eq!(log(), vec!["begin", "rollback"]);
        drop(connection);
        let connection = db(None);
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = connection.transaction::<()>(|| panic!("test unwind"));
        }))
        .is_err());
        assert_eq!(log(), vec!["begin", "rollback"]);
    }
    #[test]
    fn failed_begin_skips_body_and_failed_commit_rolls_back() {
        let connection = db(Some("begin"));
        assert!(connection
            .transaction::<()>(|| panic!("must not execute"))
            .is_err());
        assert_eq!(log(), vec!["begin"]);
        drop(connection);
        let connection = db(Some("commit"));
        assert!(connection.transaction(|| Ok(())).is_err());
        assert_eq!(log(), vec!["begin", "commit", "rollback"]);
    }
}
