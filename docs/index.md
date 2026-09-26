# QuickLang 文档

QuickLang 是本地优先的个人英语学习应用，提供单词背诵、听说训练、AI 陪练、词库维护和分段同声翻译。

本文档按 **2026-09-20 当前工作区代码**维护；源码中已存在的能力不等于已发布或已完成设备验收。当前完整桌面目标为 macOS 15+ Apple Silicon，浏览器只提供有限预览，移动端、Windows 和跨设备同步仍需后续实现与验证。

## 了解当前架构

- [产品与技术架构](./quicklang-product-technical-design-v1)：产品范围、代码组织、存储分层、主要数据流及后续边界。
- [整体架构](./architecture/overview)：React UI、Tauri 桌面、共享 Rust crates 与独立服务骨架。
- [模块与关键流程](./architecture/modules)：学习、词库、AI、听力、同声翻译和数据库的详细实现。
- [架构图与维护](./architecture/diagrams)：图源、现有图覆盖范围和导出方法。

## 开发与运行

- [开发指南](./development/0.1/getting-started)：环境、初始化、开发、构建、发布及文档站命令。
- [实现与验证记录](./development/0.1/implementation)：当前实现说明及历史记录。
- [词库数据库说明](./development/0.1/word-library-schema)：唯一最终词库、数据库 schema 与 UI 历史兼容。
- [听说练习与 AI](./development/0.1/listening-speaking-ai) · [听力训练](./development/0.1/listening) · [大模型统一接入](./development/0.1/llm-gateway)。
- [质量保障](./development/0.1/quality-assurance) · [覆盖率与审查记录](./development/0.1/coverage-and-review)。

## 阅读前需要知道

- 应用持久化数据统一使用 **seekdb**：学习档案、设置与进度进入应用状态表，同声翻译会话和音频进入专用表，规范词库、听力原材料及 AI 配置仍由数据库保存。不使用或迁移旧 localStorage/IndexedDB 数据；**Keychain** 仅保存凭据主密钥。备份数据库仍不包含主密钥和未保存的临时录音。
- Rust 复习事务链路已经实现，但当前学习页面尚未提交到该链路；听力七轮安排也使用独立的 TypeScript 逻辑。
- 桌面直接请求配置的外部 AI 服务，不经过 QuickLang server。同声翻译启动后自动上传音频分段，基础单词学习无需 AI。
- `development/0.1/` 保留原有开发文档路径；`design/0.2/` 为研究与后续方案，不能据此判断功能已经实现。

## 设计研究与许可

- [Apple Live Captions 方案](./design/0.2/apple-live-captions)
- [ASR 开源方案比较](./design/0.2/2026-09-20-asr-github-comparison)
- [许可与来源](./reference/licenses)
