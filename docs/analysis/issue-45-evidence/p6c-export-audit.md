# P6c native export audit

- Agent: p6c_export_audit (fifth P6c subagent)
- Start: 2026-10-05 19:21:22 +08:00
- End: 2026-10-05 19:21:49 +08:00
- Duration: 27 seconds
- Immutable baseline: b08c3a7a9b2ebd78a8004db8e674ef7b926384d1. Source was read with git show during the parent rebase; no source changes or Cargo execution.

## Findings

No confirmed functional defect found in this focused static review. The UIKit export implementation lives in src/app/native/longterm_export.m, not native/ios/platform.m. Native picker callbacks are main-queue confined and fenced by QLPendingExport identity. finish clears the pending identity before callback transfer; repeated finish/cancel cannot consume the Rust boxed sender twice. Native security scope survives coordinated publication; Rust Destination drop releases the lease and wakes the coordinator after temporary-file cleanup. The Rust owner/operation/epoch registry cancels streaming, checks cancellation again under the publication gate, and preserves the existing destination on failure or cancellation. Native completion and Rust publication are separate, explicitly owned phases.

## Concrete uncovered paths

1. Both tests/integration/native-export-harness.m and native-export-picker-harness.m import AppKit and compile TARGET_OS_IPHONE=false. They exercise the shared coordinator/lease/callback machinery and actual macOS NSSavePanel, but cannot validate UIKit filename alert, folder selection, overwrite confirmation, or presenter dismissal.
2. The iOS folder selection starts and stops scope during collision detection, then acquires a fresh scope for writing. Neither macOS harness checks an actual iOS document-provider folder capability or NSFileCoordinator coordinating a directory while publishing its child. This requires the simulator/native iOS smoke or a real provider acceptance check; compilation alone cannot establish runtime permission correctness.
3. The filename-alert action presents UIDocumentPickerViewController immediately from the prior presenter. Unlike the folder-to-overwrite transition, it has no dismissal-completion sequencing. This is a specific runtime acceptance target for UIKit presentation warnings or a missing folder picker, not a confirmed bug from static inspection.
4. macOS harness uses NSData atomic write rather than the full UI -> Tauri -> Rust export_to_writer path. Rust tests separately cover temporary publication, cancellation, replacement, and symlink rejection; there is no complete end-to-end iOS export evidence in these harnesses.

## Existing regression evidence

- build/p6c-regressions-recording-batches.log: PASS shared 15s limit, 5s/pause segmentation, short-pause rejection, arbitrary buffer boundaries. Does not validate export or microphone hardware.
- build/p6c-regressions-file-delivery.log: file delivery regression tests passed. Script compiles an AppKit test, so this is macOS delivery evidence, not UIDocumentPicker acceptance.
- build/p6c-regressions-ios-pcm-capture.log: PASS conversion/mixed timeline/raw PCM/bounds/cancelled generation. Script compiles actual PCM code for iphoneos and iphonesimulator, but runs the conversion harness on macOS; no physical microphone capture evidence.
- build/p6c-regressions-ios-live-captions.log: seven hardware-free lifecycle PASS lines covering backend policy, background authorization callback, cancellation, admission bounds and persistence-before-stop. Does not establish actual on-device speech authorization or live microphone transcription.

These four logs contain positive result markers and no FAIL marker in the inspected output. Their scopes should be reported as focused native regressions, not full iOS UI acceptance or full make test-apple completion.
