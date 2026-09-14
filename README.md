# QuickLang

个人背单词应用框架：Tauri 2 + React/TypeScript + Rust。首发 macOS 15+ Apple Silicon，
预留 iPhone/iPad 与 Windows 扩展。QuickLang 自有代码采用 Apache-2.0；Ink 词库单独遵循 CC BY-SA 4.0。

## 当前交付范围

可运行的桌面框架、拼写/卡片/自动默念预览、独立实现的调度与输入核心、
事务仓库接口、同步消息校验、失败关闭的 API 服务入口、Ink 单词清单导入器、
测试和 VitePress 文档站。

**当前不是完整学习产品。** macOS ARM64 已接入 seekdb 1.4.0 原生驱动和桌面复习持久化命令；
界面学习流程需接入这些命令才会写入 seekdb。OceanBase 服务、认证、同步和备份尚待实现。没有 SQLite 或生产数据库回退。
内存仓库只出现在测试中。

## 快速开始

需要 Node.js 22.12+、GNU Make、CMake、Perl、Rust 1.93.1，以及 macOS Command Line Tools。
iOS 构建另需完整 Xcode、iOS SDK 与开发签名。Windows 桌面构建还需 MSVC/WebView2，
当前没有 Windows/iOS 真机验收结论。

```sh
make init
make test
make test-db
make docs
make build
make install
make dev
```

- `make init` 安装锁定依赖，下载核验 seekdb 1.4.0 并构建原生驱动/OpenSSL；首次需要联网和数分钟编译。随后生成两表词库数据、执行 V0003 建表并导入 11 本词书；重复执行仅补缺，不覆盖已有内容。
- `make test` 使用离线 Cargo 与本地前端测试，不需要数据库或公网。
- `make test-db` 运行真实数据库持久化/并发/回滚测试，保留隔离测试数据便于排查。
- `make build` 构建 UI、同步服务与未公证桌面应用；输出 `dist/<platform>-<arch>/`。
- `make install` 在 macOS 首次安装到用户 Applications；目标存在时拒绝覆盖。
- `make dev` 启动 Tauri；浏览器开发预览可用 `npm run dev`。
- `make content` 从固定版本 Ink 源目录生成 11 本单词清单，并生成数据库种子到 `build/content/word-library/`。
- `make review` 执行全 workspace clippy、类型检查及代码边界检查。
- Windows 可用 Node 任务入口做框架检查；嵌入式运行包当前仅支持 macOS ARM64，Windows/iOS 不应视为可发行。

若没有全局 Rust，可把 rustup 的 CARGO_HOME/RUSTUP_HOME 安装在
`deps/cache/cargo` / `deps/cache/rustup`，任务入口会自动使用它们。
初始化不会自动安装系统工具或更改 shell 配置。

macOS 默认数据库目录为 `~/Library/Application Support/io.github.longdafeng.quicklang/seekdb-1.4.0/`，
与桌面应用一致。可通过 `QUICKLANG_DATA_DIR=/absolute/path make init` 指定独立数据库；
启动 `make dev` 时使用相同变量。数据库被应用占用时初始化会报 `DB_LOCKED`，请先退出应用。
生成数据包含 `words.jsonl`、`wordbooks.jsonl`、旧 ID/章节映射、许可文件及 SHA-256 清单。
本次接入仅负责建表和导入；学习界面的词库读取仍使用现有本地资源。详见
[词库数据库说明](docs/development/word-library-schema.md)。

## 目录

- `src/`：产品源码、壳、领域 crates、服务、迁移和内容契约。
- `tests/`：Rust/React/脚本测试、仓库契约与 HTTP 集成测试。
- `scripts/`：跨平台 Node 任务、内容导入、许可检查。
- `deps/`：第三方材料、锁定声明、许可证；cache 不提交。
- `docs/`：Markdown 和 VitePress 静态站；设计原文保留。
- `repos/`：只读参考，不提交、不参与构建。
- `build/`、`dist/`：生成物，不保存用户数据。

详细范围与验证结果见 `docs/development/implementation.md`。
原生版本锁定、资源预算、IPC 和许可重建说明见 `deps/seekdb/README.md`。

## 听力训练

侧栏新增「听力训练」：导入本地音频和 SRT/VTT 字幕，完成精听、跟读、盲听、复述与七轮间隔复习；支持难句/语境闪卡和可选 AI 字幕、解析、转写反馈。桌面版的音频和进度通过 Rust 存储线程保存到 seekdb，按用户隔离；浏览器只提供临时预览。详见[听力训练架构与使用说明](docs/development/listening.md)。

测试覆盖率、运行命令、CI 门槛及本轮修复见 [测试覆盖率与代码审查记录](docs/development/coverage-and-review.md)。
