# P6c physical-device Rust check: read-only diagnosis

- Start: 2026-10-05 19:41 CST; initial report: 19:43 CST.
- Scope: existing logs, build fingerprints, source configuration and read-only signature inspection. No Cargo, make, signing changes, cache deletion, process termination or source changes.

## Confirmed failure cause

Both physical-device cargo checks stopped while executing a **macOS host** swift-rs build script, before completing the iOS device check:

| Log | Binary suffix | Failure |
| --- | --- | --- |
| `p6c-rebased-device-check.log` | `swift-rs-0b8edd241e2e3e75/build-script-test-build` | signal 9 SIGKILL |
| `p6c-rebased-device-check-retry.log` | `swift-rs-379d4c54a322bbf1/build-script-test-build` | signal 9 SIGKILL |

Targeted macOS unified log evidence in `p6c-device-amfi.log` identifies the same absolute binaries and timestamps:

- 19:39:38.706 and 19:39:54.004: first binary.
- 19:40:03.245: retry binary.
- Kernel AppleMobileFileIntegrity: `has no CMS blob?` followed by `Unrecoverable CT signature issue, bailing out.`

This directly supports an AMFI execution/signature rejection rather than a Rust diagnostic. It does not identify why this machine rejected an otherwise structurally valid linker signature, nor prove that no other problem can occur after this blocker is resolved.

Read-only `codesign --verify --verbose=4` says both files are `valid on disk` and satisfy their designated requirements. `codesign -dv --verbose=4` shows Mach-O arm64, macOS VersionPlatform=1, `adhoc,linker-signed`, no TeamIdentifier. No xattrs were listed on either binary. A valid on-disk code directory is demonstrably insufficient for execution approval here. No security policy was changed.

## Toolchain and profile findings

- Repository `rust-toolchain.toml` pins Rust 1.93.1, minimal profile, rustfmt/clippy/llvm-tools.
- Task runner and `scripts/ios.mjs` select project-local `deps/cache/cargo` and `deps/cache/rustup`; iOS uses `build/ios/cargo`. Full Xcode is selected through DEVELOPER_DIR, without changing global xcode-select.
- `tests/native/apple-regression.sh` exports those same project-local homes. Its simulator canonical build explicitly uses `CARGO_PROFILE_DEV_DEBUG=1`; the next physical-device cargo check does **not** set that variable in the script. A variable assignment on the preceding single command does not export it to the following command. Unless the caller already exported it, the device check uses Cargo's default dev debug value instead.
- `scripts/ios.mjs` sets release debuginfo=1 and preserves caller environment; it does not independently force dev debuginfo=1.
- The two failed swift-rs **host build-script** fingerprints have identical rustc ID `13850170861107434965`, profile `5347358027863023418`, config `2069994364910194474`, empty rustflags and compile_kind=0. Their feature sets differ: `[build, default, serde, serde_json]` versus `[default]`. This explains a meaningful hash difference without evidence of a profile mismatch between these two failed host scripts.
- Existing non-verbose cargo logs cannot independently prove the precise compiler flags or caller environment of each invocation. The executing build agent was asked to confirm them.

## Smallest justified next validation

1. Let the current canonical simulator build finish; retain its outputs and logs.
2. If another device check is justified, serialize it with native output writers and explicitly keep the project-local homes, Xcode, target directory and `CARGO_PROFILE_DEV_DEBUG=1` consistent with the simulator Debug build. This eliminates the documented target-profile ambiguity; it is **not** a demonstrated AMFI fix.
3. Preserve targeted unified logs for that invocation. If the same AMFI error recurs, report the host execution blocker and investigate machine code-signing/trust behavior explicitly; do not infer a Rust source failure or repeatedly warm caches.
4. A successful `cargo check --target aarch64-apple-ios` validates the device compilation path only. It does not replace `make build_ios`/`make release_ios`, app installation or physical-device acceptance.

The current device compilation check remains blocked/unpassed. No production application or user database was accessed.

## Authorized same-profile diagnostic validation

Root subsequently authorized one serialized device check after the canonical simulator build passed and released the iOS output lock. No other iOS writer was observed before launching it.

- Start 2026-10-05 19:43:45 CST; end 19:43:54 CST; duration 9.27 seconds; exit 101.
- Exact command/environment/compiler version: `p6c-device-debuginfo1-metadata.json`.
- Compiler: Rust 1.93.1 (01f6ddf75 2026-02-11).
- Explicit dev debuginfo=1; same project-local homes, full Xcode, iOS target directory; no RUSTFLAGS override.
- Cargo output: `p6c-device-debuginfo1.log`.
- Failed host script: `build/ios/cargo/debug/build/swift-rs-0ddccd98a2205d40/build-script-test-build`.
- Targeted kernel log: `p6c-device-debuginfo1-amfi.log`, timestamp 19:43:51.394: the same `has no CMS blob?` / `Unrecoverable CT signature issue, bailing out.`
- Its host fingerprint profile is `8919035219001801963`, distinct from the earlier two scripts' profile `5347358027863023418`, confirming the explicit configuration change selected another profile. The two *earlier* hashes differ by features, not profile.

Thus matching dev debuginfo is useful for consistency but **does not resolve AMFI rejection**. No further cargo retry was started. The physical-device check remains unpassed even though the canonical simulator app build passed.

### Smallest artifact-only signing experiment, not performed

After preserving the affected generated executable's original bytes and signature metadata, explicitly re-sign **only** the identified host build-script executable with a local ad-hoc signature (`codesign --force --sign - <exact-host-build-script>`), verify its structure, and rerun the same serialized check with targeted AMFI logs. This is an artifact-level signing correction, not a system-security setting change, developer certificate change, source change or production-app signing change. It may eliminate stale/linker-signature metadata but is **not proven to fix the machine's CT policy failure**; if a subsequently generated Swift manifest is rejected, it needs separate exact-path evidence. Do not blanket-sign cache contents or disable AMFI/Gatekeeper/SIP.

This suggestion requires an explicit next-step decision; this task did not modify any executable signature. Final diagnosis completed 2026-10-05 19:45 CST.

## Authorized precise local certificate correction: device check passed

Root authorized use of the already configured project local-signing identity, restricted to the single AMFI-rejected generated host helper. No identity setup or trust/security modification was authorized or performed.

1. Preserved the exact failed executable with `ditto` at `build/p6c-device-diagnostic-backup/swift-rs-0ddccd98a2205d40/build-script-test-build`, with signature-before metadata.
2. Ran `node scripts/signing/local.mjs sign <exact-original-helper-path>` once. The existing **QuickLang Local Development** certificate replaced the linker ad-hoc signature. The tool's strict code-signature verification passed; signature-after metadata and sign output are stored next to the backup.
3. Ran the same serialized device check with explicit dev debuginfo=1 and the same project-local toolchain/Xcode/target directory. It passed without another helper rejection.

Result:

- Start 2026-10-05 19:48:33 CST; end 19:49:08 CST; 34.95 seconds wall time (Cargo reports 34.81s); exit 0.
- Command and precise environment: `p6c-device-signed-check-metadata.json`.
- Full output: `p6c-device-signed-check.log`.
- Cargo reported `quicklang-app (lib) generated 34 warnings`, primarily device-only unused/dead-code paths. Passing compilation is **not** a warning-free result. No automatic cargo fix was run.
- This is a successful physical-device **compilation check**, not a signed device bundle, installation or hardware acceptance. The canonical simulator app build remains the separate build evidence.
- Exactly **one** generated helper was signed. No source, user data, global security/trust settings or compiler caches were deleted; the simulator application was not modified.
- Device output lock released after completion. The earlier AMFI blocker is resolved for this precise cached artifact; future regenerated host tools may need separate evidence and signing.
