# Issue #5：关系化存储移植与 iPhone 17 验收

日期：2026-10-07。目标分支：`codex/issue-5-ios-seekdb`。

## 移植与修复

等待 `codex/user-storage-schema` 对应任务完成后，将其完整暂存修改提交为
`3a3edc76`，随后把目标分支 rebase 到该提交。关系化用户数据、按学习会话
维护的版本、答题事实与幂等回执、提交后富化、计时及行式备份均已纳入目标分支。
保留 iOS 动态 SeekDB framework 和 20G datafile 上限。

目标原始现场保存在 `codex/issue-5-ios-seekdb-before-schema-20261007`。
Rebase 后的 iOS 提交为 `ab5ea131`、`7e771ee5`；验收补充为 `d180b8c8`。
Apple 回归发现 Xcode runner 的工具链环境赋值被重复插入内层网络包装命令，
导致 spawnSync ENOENT。`2e824f13` 修复生成与已有畸形命令，并新增实际 shell
执行回归测试。全部测试在修复后通过。

iOS/macOS 当前默认数据库目录统一为 `seekdb-1.4.0-relational-v3`。
引擎源码与 framework 使用本机 seekdb `6f902fdab24c`，未改动引擎源码。

## 完成的验证

所有命令均在目标分支执行；日志位于 `build/schema-transplant/`。

| 命令 | 验证结果 | 日志 |
| --- | --- | --- |
| `make test` | 1082 项前端测试、206 项脚本测试零跳过；Rust workspace、clippy、格式、license、配置的在线对话和转写测试通过 | `full-test.log` |
| `make test-db` | 64 项 storage 测试及实际数据库集成、App 存储、AI profile、跨进程语音持久化通过 | `database-test.log` |
| `make test-apple` | macOS ARM64 Debug canonical build、真实 roundtrip、125 项 SQLite 测试、原生语音/录音/字幕、iOS 模拟器 ARM64 Debug canonical build、设备 cargo check、3 项实际 bundle 检查通过 | `apple-test.log` |
| `make test-ios-smoke` | 已启动模拟器上的提示音、后台音频、PCM、26 字母、原生跟读与文件分享冒烟通过 | `ios-smoke.log` |
| `IOS_DEVICE=00008150-001805911EF0401C IOS_TARGET=device make release_ios` | iPhone ARM64 Release 编译、签名、archive 与 IPA 导出通过 | `device-release.log` |
| 同一设备配置 `make install_ios` | 复用 Release 产物、deep/strict 签名检查、安装及启动通过 | `device-install.log` |

`make test` 与 `make test-apple` 使用本地文档服务
`DOCS_TEST_URL=http://127.0.0.1:5178`。验收结束后已停止该服务。
模拟器为 iPhone 18 Pro；真实设备明确选择 longda17：iPhone 17 Pro
（iPhone18,1、iOS 27.0.1），未使用同时存在的 iPhone 13。
现有 iOS 平台与 Tao 编译警告仍存在，构建成功不代表零警告。

## 真机生产 IPC 验收

通过 LLDB 在真实 Release App 的 WKWebView 调用现有 Tauri IPC，结果写入
App tmp 并由 devicectl 读回。未增加生产测试接口。正常启动的数据库及词库
均 ready，证据为 `device-normal-runtime.json`。

功能验收使用独立 `tmp/schema-acceptance-20261007` 数据目录及合成用户数据，
没有删除或修改用户日常数据库。所有报告 `ok=true`：

- `device-study.json`：11 项检查，覆盖错答、正确答、无关设置不使题目过期、
  重试不重复计数、反馈和 30 秒计时落库、无效批次完整回滚、过期题目拒绝、
  复习完成及重试、每日答题统计精确。
- `device-backup.json`：6 项检查，覆盖过期备份预览拒绝、0.9.2 备份进度和设置
  恢复、当前行式备份导入、重复 JSON 字段拒绝且无写入、目标用户身份保持。
- `device-export.json`：实际原生导出文件，formatVersion=2，包含 2 条答题事实、
  2 条幂等回执与完成的复习会话。仅打开分享面板并读取沙箱暂存文件，未向外分享。
- `device-reopen.json`：10 项检查，终止并启动新进程后，数据库/词库 ready，
  答题进度、计时、统计与回执保持；实际导出文件重新导入后恢复设置，回执仍
  幂等，统计仍精确。

早期验收脚本曾错误地读取顶层 alreadyApplied 和重试 card；当前设计的回执
位于 event.alreadyApplied，card 有意为 null。修正脚本并改用独立操作 ID 后
上述完整流程通过，无需修改存储实现。

验收后退出 LLDB，重新启动 App 且不传测试环境变量，恢复日常运行。
最后启动证据为 `device-final-normal-launch.json`。

## 产物、空间与边界

Release IPA：`src/app/gen/apple/build/arm64/QuickLang.ipa`。
磁盘空间不足时，将已经结束的测试数据库逐目录压缩，并逐文件比较解压字节与
原始数据一致后才删除原目录；可恢复归档分别位于源与目标 worktree 的
`build/test-database-archives/`。日志为 `archive-test-databases.log` 与
`archive-target-test-databases.log`。Cargo/Xcode 输出和构建标记保留，未再次 clean。

本轮覆盖项目完整自动化流程与真机业务 IPC。完整人工逐屏点击、VoiceOver、
长时间后台运行及内存峰值未进行专项验收。旧验收报告描述先前阶段，本记录
反映关系化 schema 移植后的实际结果。未推送、合并远端 PR 或清理源 worktree。
