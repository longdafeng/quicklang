# Issue #5：iPhone seekdb 动态驱动验收

日期：2026-10-07。QuickLang 分支：`codex/issue-5-ios-seekdb`。

## 实现与来源

引擎源码仅使用本机 `/Users/longda/work/repo/db/ob/github/seekdb.longda`。
引擎与 iOS framework 的适配由该 project 的独立任务完成，未在 QuickLang
下载或编译 seekdb。被测实现提交为 `6f902fdab24ccefdde97c991b50faf551928b604`，
seekdb 验收证据提交为 `0c48f12f9326`。

默认真机产物：`build_ios_arm64/framework-6f902fdab24c/SeekDB.framework`；
模拟器产物：`build_ios_sim_arm64/framework-6f902fdab24c/SeekDB.framework`。
QuickLang 预检要求 arm64、对应 iOS 平台、MH_DYLIB、正确 install name、
全部 25 个桌面 C ABI 符号、disabled hook 与源码身份标记，以及系统动态依赖。
导入后的真机 framework 摘要：
`ae4dad6019976b557ba350157b7e78230c5f4b29efa61979c99a0cd396eca586`。

iOS 与 macOS 复用 `native.rs` 的连接、结果、事务及错误映射，并使用相同
schema 和 seekdb SQL 方言。iOS 从已签名的 App `Frameworks/SeekDB.framework/SeekDB`
加载库。SQLite 只保留显式测试 feature，iOS 默认不再启用它。
数据库目录为 App 沙箱的 `seekdb-1.4.0`，已有 SQLite 数据未被修改或迁移。

## 已运行验证

- 脚本测试：26 项通过，覆盖 framework 校验、摘要、目标隔离、签名嵌入配置、
  Xcode runner 修复和网络环境恢复。
- macOS ARM64 Debug：存储 crate 单元测试 56 项通过；50 项现有真实数据库测试忽略。
  App 启动路径测试 6 项通过。因本机宿主签名限制，测试程序签名后经项目 runner 执行。
- iOS ARM64：存储 crate 的离线 `cargo check` 通过。
- canonical `make build_ios` 与 `make release_ios` 完成 App 编译、签名及 IPA 导出；
  `make install_ios` 成功安装并启动 Release App，设备为 iPhone 17 Pro。
- seekdb 项目另有双平台各两轮、每轮 77 项探针检查，覆盖 SQL、结果值、事务、
  加载线程退出与跨进程持久化；它们与 QuickLang App 验收分别记录。

## QuickLang App 的实际结果

通过 LLDB 连接真机 Release App，调用已加载 WKWebView 的 `callAsyncJavaScript`，
执行现有 Tauri IPC `get_runtime_status`。结果保存在沙箱 tmp 后由 `devicectl` 复制到
本地 `build/ios/`，未增设生产接口或绕过存储层。

```json
{
  "phase": "ready",
  "storage": "seekdb",
  "persistence_ready": true,
  "error": null,
  "library_phase": "ready",
  "library_ready": true,
  "library_error": null
}
```

App 事务测试经 `app_state_write` / `app_state_list` 执行：先保存原始状态，在同一事务中
写入测试值后提交无效键，使业务校验拒绝整批写入；读取确认第一条写入已回滚。
再提交测试值并读取确认成功。终止并启动新 App 进程后再次读取，确认测试值持久化，
最后恢复原始状态。本轮原始 `quicklang:last-user` 不存在，恢复操作删除测试值。

事务报告为 `committed=true`、`readBack=true`、`rollback=true`；
重启报告为 `persisted=true`、`restored=true`，数据库及词库再次 ready。
本地证据：`build/ios/issue-5-runtime-status.json`、`issue-5-app-transaction.json`、
`issue-5-app-restart.json`、构建/安装日志和脚本测试日志。

## 验收边界

公开 C ABI 与桌面一致；iOS 的引擎生命周期每进程只允许一次启动，最后一个 handle
关闭会停止引擎，重新启动须创建新进程。QuickLang 的永久存储线程符合该约束。
不支持 iOS 外部进程启动或 TCP 服务，SQL 使用 App 沙箱内 Unix socket。

早期日志采集和调试器连接过程中曾出现一轮 signal 9 终止，未找到对应新的 QuickLang
崩溃或 Jetsam 报告，原因未确认。随后完成上述事务及新进程持久化验证。
后台挂起恢复、长期运行、内存峰值和完整人工 UI 操作尚未验收；本次没有运行
全套 `make test-apple` 或所有真实数据库测试，也没有构建 QuickLang 模拟器 App。
