# 框架实现与验证

## 2026-09-13：seekdb 1.4.0 接入更新

以下历史框架记录中的“真实存储未接通”由本节更新：macOS ARM64 已新增官方 C driver FFI、
专用数据库线程、目录互斥锁、版本标记与 checksum 迁移执行器。复习事件/调度状态原子保存，
支持幂等重试、过期版本拒绝、错误回滚及关闭重开持久化测试。没有 SQLite 回退。

桌面提供 get_runtime_status、load_review_state 和 rate_card；ready 来自真实数据库启动结果。
界面学习流程有并行修改，本次不覆盖这些改动；仅有命令接口并不代表 UI 已调用并保存。
词库实体、整场会话、远程 OceanBase、备份和设备同步仍不在本次范围。

1.4 embedded 是应用管理的本地数据库子进程，经 Unix socket 连接，不是进程内数据库。
默认 memory_budget=1G、log_disk_size=2G。iOS 不能直接使用本方案，Windows 未适配。
旧版 1.0–1.3 必须逻辑迁移，禁止原地升级。

make init 构建固定引擎/C driver/OpenSSL；make build 离线检查哈希并携带运行库、许可和对应源码。
make test-db 单独运行真实数据库测试，默认 make test 中明确标为 ignored，不把未执行算通过。
详细版本、IPC 和第三方库替换步骤参见仓库 deps/seekdb/README.md。

本次实测：make test（14 个 Rust、15 个 UI/状态机、3 个脚本用例）、make review、make docs、make build 通过。
真实 seekdb 综合测试分别使用开发运行库与 QuickLang.app 中的运行库通过，包含独立进程读取/提交、
幂等、冲突、目录锁、回滚、迁移 checksum 及版本拒绝。原生 GUI 点击和 UI→数据库完整流程未验收。
桌面工作线程的“启动失败不得报告 ready”回归测试也通过，已加入 make test-db。

以下为 2026-09-07 历史记录，日期早于本次接入。

## 已实现

- 根目录契约、npm/Cargo workspaces、锁文件、跨平台 Node 脚本与薄 Makefile。
- Tauri 2 桌面壳、运行状态和拼写检查 IPC、React 三种学习模式预览。
- WordFact/Card、ReviewState/Event、独立 SM-2 变体、Unicode 规范化输入引擎。
- ReviewRepository 原子提交契约、乐观并发和事件幂等用例；内存实现仅用于测试。
- seekdb/OceanBase 接口边界；未集成时明确失败，无 SQLite 或生产内存回退。
- Axum 活性/就绪入口、同步批次校验，未接通的 API 返回 503。
- 固定提交与 SHA-256 的 11 本 Ink 单词清单导入，保留许可/署名。
- VitePress 静态文档站、macOS GitHub Actions。

## 尚未实现

真实 seekdb/OceanBase 持久化、库迁移执行器、完整词条释义/例句导入、
学习会话持久化、复习队列、备份、认证、TLS、设备同步、TTS、iOS/Windows 实机验收。
UI 评分和拼写结果不写数据库；浏览器预览不是生产客户端。

## 与设计的工程细化

脚本采用跨平台 Node 实现，避免重复维护 bash/PowerShell。
仅实现已有用途的 crates；backup、observability、content-model 等在实际接入时增加，
不以空目录伪装完成。Rust/UI DTO 当前手工映射，后续引入自动生成并保留契约测试。
迁移 SQL 作为待验证契约提交，不自动执行。

## 验证记录

验证日期：2026-09-07；环境 macOS 26.6.2 / ARM64，Node 24.14.0，Rust 1.93.1。

- `make init`：成功安装锁定 npm/Cargo 依赖。
- `make test`：14 个 Rust 测试、7 个 React/状态机测试、2 个 Node 导入器测试通过；包含 rustfmt、clippy 和 TypeScript 检查。
- `make review`：全 workspace（含桌面壳）clippy 和类型检查通过。
- `make build`：成功生成 ARM64 `QuickLang.app`，最低系统声明 15.0；未签名、公证。
- `make install`：在隔离的临时 Applications 目录验证首次安装，没有改动用户已有应用。
- `make content`：固定版本 11 本词库校验后导入 49,436 个词库条目。
- `make docs`：生成静态网站并执行内部链接检查。
- npm audit：修复依赖后报告 0 个已知漏洞；这不等同于 Rust 依赖安全审计。

数据库和移动平台测试不计入本轮通过项。原生 GUI 自动点击验证因系统辅助功能权限未就绪而未完成；当前界面行为证据来自 React 组件测试，桌面证据来自实际编译、打包和安装结构检查。

## Code review 记录

1. 修复重复学习失败被错误计为多次遗忘：仅从 Review 转入 Relearning 时增加 lapses；补充连续失败回归测试。
2. 修复 npm workspace 的 Vite 类型冲突，统一 UI/测试使用 Vite 7.3.6。
3. 升级 Vitest 至 4.1.11；文档使用 VitePress 1.6.4 + Vite 6.4.3 / esbuild 0.25.12 的显式覆盖，UI 使用 esbuild 0.28.2。覆盖解决已知开发服务器漏洞，静态站构建单独验证；后续升级 VitePress 时应移除已无必要的覆盖。
4. Windows Tauri CLI 通过 Node 调用 tauri.js，避免直接 spawn .cmd 失败；Windows 实际打包仍需后续验证。
5. 桌面 Cargo 构建强制 --locked --offline；确认发布依赖启用了 Tauri custom-protocol，前端使用嵌入资源。
6. 检查数据库错误路径、重复事件 ID、乐观并发、事务失败不写入、隐藏/失焦暂停、定时器卸载、内容路径和哈希校验。

仍明确保留的范围限制：真实存储、原生端到端测试、iOS/Windows、完整依赖许可归档和正式签名发布。当前框架不能作为可保存学习进度的成品发布。
