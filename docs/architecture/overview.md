# 框架架构

React 通过窄 Tauri command 调用 Rust；浏览器开发预览使用显式标记的临时逻辑。
当前真实 IPC：`get_runtime_status`、`evaluate_spelling`。

Rust 层次：domain → scheduler / typing-engine / storage-port → application。
application 使用注入的时钟、事件 ID 与 repository，原子写入复习日志与调度状态。
只有 tests 中存在内存 repository；生产存储入口当前返回 DB_NOT_CONFIGURED。

服务监听 127.0.0.1:4318。`/health/live` 是活性检查；
`/health/ready` 与未实现 API 返回 503，避免被误用为可工作的同步服务。

iOS 预留 Tauri 移动入口与配置。数据库端口支持后续接通桌面 seekdb、
服务端 OceanBase；不自动使用 SQLite。
