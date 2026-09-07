# 开发指南

仓库入口统一为 Makefile；Windows 可直接调用 Node 任务入口。
运行 `make init` 安装固定依赖，然后运行 `make test`、`make docs` 和 `make build`。

## 环境

macOS 15+ ARM64，Node 22.12+，Rust 1.93.1，Command Line Tools。
完整 Xcode 仅 iOS 工作流必需。框架尚未验证 iOS/Windows 打包。

## 输出

- UI：`build/ui/`
- Rust：`build/cargo/`
- 应用：`dist/darwin-arm64/macos/QuickLang.app`
- 文档：`build/docs/site/`，可由任意静态服务器托管。
- 测试：`build/test-results/ui.xml`
- 许可：`build/compliance/dependencies.json`

静态站发布到子路径时设置 `DOCS_BASE=/quicklang/ make docs`。
当前未自动公开发布私有仓库文档。

## 内容

`make content` 默认读取 `repos/ink-learner`；可通过 `INK_SOURCE` 指定参考目录。
输入版本固定在 `src/content/manifests/ink.json`，所有文件先校验 SHA-256。
输出单词清单包含来源、章节、确定性内容键及 CC BY-SA 许可和署名；
当前不导入释义/例句、不修改数据库，不把原始参考源码打入应用。

## 日常审查

`make review` 检查全部 Rust workspace（含桌面壳）、TypeScript 和仓库边界。
`make test` 检查核心行为、失败路径、UI 定时器及导入数据验证。
