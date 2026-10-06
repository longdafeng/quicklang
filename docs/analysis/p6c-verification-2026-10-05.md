# P6c Apple / iOS 与最新 main 整合验证

日期：2026-10-05（北京时间）。工作树：`/Users/longda/.codex/worktrees/longterm-integration/quicklang`；分支：`codex/issue-45-review-notebook`。

## 代码基线与必要适配

GitHub `origin/main` 从 `7e347898` 更新至 `a6b73d06`。46 条整合提交完成 rebase，当前功能修复提交为 `e27c91de`，最新 main 是该提交的祖先。回退分支 `codex/issue-45-review-notebook-pre-rebase-20261005-2` 保留 rebase 前 `b08c3a7a`。

整合保留上游中文背诵、学习进度、签到与累计鼓励，以及长期复习和长期错题本。普通错词事务改为更新同一用户文档中的 `learning-activity.spell`，保留其他模式、独立的 `legacyDays` 和累计 `earned`；反馈、词库与长期卡片在同一数据库事务提交。答题操作冻结本地时区偏移，重试沿用同一值；活动日期按服务时间加偏移计算，事件和复习排期仍用 UTC。非法偏移与写入失败均不留下部分更新。

## 本轮验证结果

| 检查 | 结果 / 目标 | 证据 |
| --- | --- | --- |
| canonical `make test` | 通过：格式、严格 Clippy、Rust workspace、TypeScript、UI 932 项、脚本 174 通过 / 1 跳过 | `build/rebase-latest-make-test.log` |
| SQLite 长期存储聚焦回归 | 19 / 19 通过，包含模式/历史/earned/时区/原子回滚 | `build/rebase-latest-storage-focused.log` |
| 真实 seekdb 长期存储 | 17 / 17 通过；非 SQLite，无跳过 | `build/rebase-latest-native-storage.log` |
| 真实 seekdb 七类长期合同 | 25 / 25 通过 | `build/rebase-latest-native-contracts.log` |
| SQLite 七类长期合同 | 25 / 25 通过 | `build/rebase-latest-sqlite-contracts.log` |
| canonical `make build` | macOS / arm64 / Debug 通过，Cargo 49.91 秒，本地证书签名验证通过 | `build/rebase-latest-desktop-build.log` |
| canonical `make build_ios` | iOS / arm64 simulator / Debug，`IOS_TARGET=simulator CARGO_PROFILE_DEV_DEBUG=1`；最新源代码构建通过，总 82 秒（含 bundle 校验） | `build/p6c-rebased-simulator-build.log` |
| Apple bundle 检查 | 3 / 3 通过 | `build/p6c-rebased-apple-bundles.log` |
| 设备架构编译检查 | `cargo check -p quicklang-app --lib --target aarch64-apple-ios --locked --offline` 通过，dev debuginfo=1，34.95 秒 | `build/p6c-device-signed-check.log` |
| 原生 speech / recording / ABI | 通过，38.23 秒 | `build/p6c-audio-speech.log` |
| 原生 word overlay | 通过，2.59 秒 | `build/p6c-audio-word-overlay.log` |
| recording batches / file delivery / iOS PCM / live captions | 四项通过，独立输出目录并行执行 | `build/p6c-regressions-*.log` |
| 隔离 iOS NativeSmoke | 6 个 PASS、脚本 exit 0、29 个 WAV，4 分 43 秒含首次模拟器启动 | `build/ios-native-smoke/{task.log,run.log,task-metadata.json}` |
| 隔离 iOS 导出 smoke | 真实文件名弹窗与公开取消接口回调一次通过；严格 native 编译与最终运行 exit 0 | `build/p6c-ios-export-smoke/final-run.log` |
| 独立代码审查 | 未发现已确认 P0/P1/P2 故障；60 秒，只读审查 | `build/rebase-latest-review.md` |

Apple 原生 smoke 在 rebase 前基线执行；其直接编译的原生平台代码未因本次统计与时区修复改变。最新代码另有 simulator canonical build、设备架构 check 和完整 UI 回归。原生 speech/overlay、四个脚本不是手机端完整长期学习端到端测试。

live chat 与 transcription 测试因没有配置 `.env.test` 跳过；未用跳过结果声称远端模型通过。未重复 100 万事件基准，本轮未修改列表、详情、dashboard 查询或导出分页实现；此前基准的 counting-sink、五次样本和未测峰值内存限制见 P6b 报告。

## AMFI 失败与定向修复

设备 check 起初及一次重试均因 `swift-rs` 的本机 host build-script 被 SIGKILL 失败；同 simulator 的 debuginfo=1 配置诊断后仍失败。系统日志明确记录 AMFI `Unrecoverable CT signature issue`，对应同一生成可执行文件，不能把失败称作源码编译错误或测试通过。

只备份该失败生成文件，然后使用项目已经配置的 `QuickLang Local Development` 身份重新签名并严格验证，随后同环境设备 check 通过。没有创建新证书、改动信任或系统安全设置、清理缓存或批量签名。备份、前后签名和命令元数据在 `build/p6c-device-diagnostic-backup/` 与 `build/p6c-device-*-metadata.json`；定位过程见 `build/p6c-device-diagnosis.md`。

设备 check 的 `quicklang-app` 仍有 34 条警告；警告涉及的 7 个应用源文件与 `origin/main` 完全一致。依赖 `tao` 另有 12 条警告。macOS 的严格 Clippy 通过不等于 iOS 分支没有警告。设备 check 只证明库能按设备架构检查，不证明已完成设备打包、签名、安装或实机运行。

## 实际平台验收边界

隔离 NativeSmoke 覆盖原生语音、26 字母拼读、鼓励音效、后台语音/取消、自动朗读推进和分享本地录音文件；它不访问用户数据库或生产应用。此前 WKWebView 验收覆盖桌面/移动 viewport 与长期页面，但使用模拟读模型。

新增 `tests/native/ios-longterm-export-smoke.{m,sh}`，真实 UIKit 文件名弹窗和公开取消接口已通过；headless 模式有 20 秒失败边界，最终原生严格编译与运行通过，最后格式检查覆盖 390 个非 Rust 文件、0 个未格式化。文件名按钮到目录选择器的实际点击流程、外部 document provider security scope、文件替换和真机端到端仍未获得通过证据。当前环境具备 SDK、simctl 和模拟器运行时，但没有 `/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app`，CUA 无法选择 Simulator；不得把 CLI 能运行模拟器称作可操作的完整 Simulator UI。

未执行完整聚合 `make test-apple`；分别运行相关原生脚本、规范 Debug 构建、bundle 检查、设备 check 和隔离 smoke，避免再次串行重复已经通过的 UI/Rust 及平台检查。没有 Release 构建、生产应用安装、Git push 或 main 合并。
