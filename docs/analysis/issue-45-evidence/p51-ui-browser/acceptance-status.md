# Import layout acceptance preparation

Prepared an isolated, nonpersistent WKWebView harness reusing the prior approved P6b harness, with a new localhost Vite fixture under `build/p51-ui-browser`. It renders the real LongtermWorkspace/LongtermImport components and current CSS at 1100px desktop or a real 380px iframe viewport. The fixture provides explicit fake profiles and native IPC responses; it never reads a real application database. A 100-word TXT fixture includes a 192-character spelling for wrapping inspection.

Actual layout acceptance is pending: CUA `getApp` attempts with both the harness bundle identifier and absolute application path returned native server `-10005 timeoutReached` and did not launch a harness process. CUA app inventory remained available, but the documented optional `cua.computer.launch_app` is not provided by this runtime (`not a function`). No screenshots or clicks were obtained. No browser was downloaded and no alternate UI automation was used.

Even once rendered, this fixture proves only WKWebView component layout and mocked IPC behavior, not the production Tauri/Rust/native file-provider end-to-end path. The fixture's import result is mocked; do not report it as native import storage validation.
