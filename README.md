# QuickLang

个人背单词应用框架：Tauri 2 + React/TypeScript + Rust。首发 macOS 15+ Apple Silicon，
预留 iPhone/iPad 与 Windows 扩展。QuickLang 自有代码采用 Apache-2.0；Ink 词库单独遵循 CC BY-SA 4.0。

## 当前交付范围

可运行的桌面框架、拼写/卡片/自动默念预览、独立实现的调度与输入核心、
事务仓库接口、同步消息校验、失败关闭的 API 服务入口、Ink 单词清单导入器、
测试和 VitePress 文档站。

**当前不是完整学习产品。** seekdb/OceanBase 适配器尚未接通，学习进度不会保存；
设备认证、同步、备份和完整词库 UI 接入尚待实现。没有 SQLite 或生产数据库回退。
内存仓库只出现在测试中。

## 快速开始

需要 Node.js 22.12+、GNU Make、Rust 1.93.1，以及 macOS Command Line Tools。
iOS 构建另需完整 Xcode、iOS SDK 与开发签名。Windows 桌面构建还需 MSVC/WebView2，
当前没有 Windows/iOS 真机验收结论。

```sh
make init
make test
make docs
make build
make install
make dev
```

- `make init` 根据 npm/Cargo lockfile 安装依赖；允许联网。
- `make test` 使用离线 Cargo 与本地前端测试，不需要数据库或公网。
- `make build` 构建 UI、同步服务与未公证桌面应用；输出 `dist/<platform>-<arch>/`。
- `make install` 在 macOS 首次安装到用户 Applications；目标存在时拒绝覆盖。
- `make dev` 启动 Tauri；浏览器开发预览可用 `npm run dev`。
- `make content` 从固定版本 Ink 源目录生成 11 本单词清单到 `build/content/ink/`。
- `make review` 执行全 workspace clippy、类型检查及代码边界检查。
- Windows 无 Make 时使用 `node scripts/tasks.mjs <target>`；安装请运行生成的安装器。

若没有全局 Rust，可把 rustup 的 CARGO_HOME/RUSTUP_HOME 安装在
`deps/cache/cargo` / `deps/cache/rustup`，任务入口会自动使用它们。
初始化不会自动安装系统工具或更改 shell 配置。

## 目录

- `src/`：产品源码、壳、领域 crates、服务、迁移和内容契约。
- `tests/`：Rust/React/脚本测试、仓库契约与 HTTP 集成测试。
- `scripts/`：跨平台 Node 任务、内容导入、许可检查。
- `deps/`：第三方材料、锁定声明、许可证；cache 不提交。
- `docs/`：Markdown 和 VitePress 静态站；设计原文保留。
- `repos/`：只读参考，不提交、不参与构建。
- `build/`、`dist/`：生成物，不保存用户数据。

详细范围与验证结果见 `docs/development/implementation.md`。
