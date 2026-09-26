# QuickLang 产品与技术架构

> 核实日期：2026-09-20。本文依据当前工作区源码重新编写，包含尚未提交的实现，不代表已发布版本或已完成设备验收。保留原文件名以兼容现有链接；不再将早期 v1.2 方案当作当前架构。

## 1. 产品定位与实现范围

QuickLang 是本地优先的个人英语学习桌面应用，覆盖单词学习、听说训练、AI 陪练及分段同声翻译。当前完整运行目标为 **macOS 15+、Apple Silicon**，采用 React / TypeScript、Tauri 2、Rust 和嵌入式 seekdb 1.4.0。

基础单词学习无需配置 AI。AI 补词、场景生成、反馈、语音转写及翻译需要兼容服务和网络；同声翻译还需要系统音频或麦克风权限。浏览器可预览共享界面，但不具备完整数据库、Keychain、原生语音和音频采集能力。

### 当前功能

- **单词背诵**：选书、自动飘单词、强化学习、拼写背诵、生词表及学习进度。
- **听说训练**：内置/生成场景的听写、理解题、录音回听、文字反馈，以及本地音频与字幕导入、多轮听力练习。
- **同声翻译**：系统声音、麦克风或混合采集；分段转写和可选翻译；历史音频回放、导出、缺失转写重试及全文翻译/摘要分析。
- **工具**：跨词书查询、自建词书、条目维护、JSON 导入及本地优先的 AI 补词。
- **设置**：本机学习档案、语音偏好、设备级多 AI 配置和凭据管理。

### 尚未交付的完整链路

远程账户、跨设备同步、OceanBase 服务端存储、完整移动版和 Windows 版都不是当前可用产品能力。Rust 复习调度及事务仓库已存在，但学习页面尚未接入该复习提交链路；查询和词库维护也尚未改用数据库词库。

## 2. 代码组织与依赖方向

### 共享界面：`src/ui/`

`src/main.tsx` 挂载 `src/app/App.tsx`，由 React 状态组织菜单、用户和页面。`features/` 按 library、spelling、flashcard、auto-recite、conversation、listening、interpretation、speech、settings、users 等功能划分。

`src/adapters/desktop.ts` 封装 Tauri SDK 的命令与事件访问；`runtime.ts` 和各功能适配器决定桌面调用或浏览器行为。界面仍承担学习会话、进度、听力轮次和同声翻译编排，不能概括为“所有业务都在 Rust”。

### macOS 与 iOS 共用宿主：`src/app/`

`src/main.rs` → `src/lib.rs::run` 组装 Tauri、存储服务和命令。目录名为 app，Rust crate 标识为 `quicklang-app`；macOS 与 iOS 共用宿主，平台专有实现通过条件编译隔离。

当前职责包括：

- IPC 命令与事件、本机资源定位、应用退出清理。
- `storage.rs` 的数据库工作线程、请求队列和初始化状态。
- `ai_profiles.rs` 的配置操作与凭据解析协调。
- `coach.rs` 的会话/听力模型请求和 `interpretation_ai.rs` 的同声翻译请求。
- `speech.rs` 的 macOS 朗读、`voice_download.rs` 及 Objective-C 增强音色下载辅助。
- `interpretation_capture.rs` 与 `native/interpretation_capture.m` 的系统音频/麦克风采集。

这是桌面适配与服务组装边界，但仍包含网络请求和存储协调实现，并非所有逻辑都已抽取为共享 crate。

### 共享 Rust：`src/crates/`

- `domain`：领域结构、卡片类型、评级、复习状态/事件和统一错误。
- `typing-engine`：纯拼写规范化、差异比较及建议评级。
- `scheduler`：版本化的 SM-2-inspired 调度器 `quicklang-sm2-v1`。
- `storage-api`：复习仓库、时钟、原子提交及幂等结果契约。
- `application`：组合仓库、时钟和调度器的复习用例。
- `storage-seekdb`：原生驱动、迁移、复习、词库、听力、AI 配置及语音偏好存储。
- `sync-core`：推送批次 DTO 和校验，未实现完整网络同步。
- `storage-oceanbase`：预留适配器，连接返回 `DB_NOT_CONFIGURED`。

入口依赖共享层，共享层不反向依赖 UI、desktop 或 server；领域层不依赖具体数据库。

### 服务与工程目录

`src/server/` 是独立 Axum 服务骨架，不是桌面应用的后端或 AI 代理。`src/schema/` 统一保存当前表的建表语句，一张表一个 SQL 文件；`tests/` 保存 Rust、UI 和脚本测试；`scripts/` 保存初始化、任务、构建、发布、合规和文档工具；`deps/` 保存依赖锁定信息、许可证及本地缓存。

`docs/` 只放原始文档和阅读资源；VitePress 工具在 `scripts/docs/`；构建、测试、图形校验和文档站输出在 `build/`，分发制品在 `dist/`。

## 3. 运行模式

### 桌面模式

React WebView 通过窄 IPC 访问 Rust 命令。数据库、Keychain、系统语音和原生采集属于本机能力。外部 AI 由桌面 Rust 网络层直接访问配置的兼容服务，不经过 `src/server`。

### 浏览器预览

共享 UI 的拼写评估有 TypeScript 本地实现，语音有 Web Speech API 分支，但原生数据库适配器拒绝浏览器持久化访问。应用状态加载门禁在缺少 seekdb 时显示错误，不使用 localStorage/IndexedDB 替代；独立模块的临时内存预览不代表完整应用可用。存在 fetch 分支也不表示浏览器已具备完整 AI 配置、采集或同声翻译工作流。

### 服务端骨架

服务监听 `127.0.0.1:4318`，`/health/live` 返回活性状态，`/health/ready` 及其他路由返回 503、`DB_NOT_CONFIGURED`。构建任务会编译 server，但桌面启动不启动它；目前没有可用的账户、词库或同步 API。

## 4. 数据归属与隔离

应用持久化数据统一保存到 seekdb；Keychain 仍仅保存加密主密钥，临时内存/文件与打包静态资源保持原职责。不使用 localStorage/IndexedDB，不迁移旧浏览器数据，不提供浏览器持久化回退。

### 应用状态

`ql_app_state` 以键/字符串值保存本地用户档案、当前词书、自建/覆盖词书、生词表、闪卡与拼写进度、练习记录、生成场景和语音设置。学习键通常按用户 ID 区分；AI 和语音设备设置不随用户切换。

启动先通过 `app_state_list` 加载状态，失败显示错误与重试，不开放依赖状态的页面。异步 `app_state_write` 在单个 seekdb 事务中提交批量修改，提交成功后才确认操作成功。这些是本地学习档案，不是登录账户或系统安全边界。

### 同声翻译历史

`interpretation_repository` 使用 seekdb 专用会话/分段表保存会话、分析记录及按会话/序号组织的 WAV 分段、转写和翻译。音频以 Base64 经 IPC 传输，在数据库中持久化；运行时 API Key 不进入会话白名单字段。

它与听力材料使用不同业务表，但共用 seekdb 存储。提交失败会中止采集并提示，不能承诺设备异常时完全无损。

### 嵌入式 seekdb

保存规范词库、Rust 复习状态/事件、听力材料原始音频和训练状态、AI 配置及加密凭据、增强音色下载偏好与确认缓存。

默认目录为 `~/Library/Application Support/io.github.longdafeng.quicklang/seekdb-1.4.0/`；`QUICKLANG_DATA_DIR` 可覆盖。连接由专属线程创建和使用，Tauri 经容量 32 的有界队列提交请求，不跨线程共享原生句柄。

### Keychain 与临时数据

macOS Keychain 保存 AI 凭据的加密主密钥，API Key 密文保存在 seekdb；显式解析后明文会进入前端运行时内存，再随 IPC 请求交给 Rust 网络层。

会话/听力练习录音通常只在页面内存暂存，区别于已持久化的听力原材料和同声翻译分段。系统朗读生成临时 WAV，播放使用临时 Object URL。

**备份边界：**复制 seekdb 目录仍不包含 Keychain 主密钥、打包资源或未保存录音。当前未实现统一备份恢复和多端同步功能。

## 5. 词库与初始化

唯一维护的最终词库为 `src/ui/public/content/word-library/`，浏览器、桌面开发和发布共用：

- `words.jsonl`：17,844 个规范词条。
- `wordbooks.jsonl`：14 本词书、60,897 个有序成员；阶段词书同时提供逐级累积的完整版与排除前置阶段的纯版。
- `legacy-map.jsonl`：49,436 条固定来源映射，仅用于来源追溯；当前 UI 不读取旧词 ID 或旧位置。
- `manifest.json`、`source-manifest.json`、合并冲突记录、许可证和署名文件：数据校验及来源追溯。

前端目录和历史映射作为资源导入，`loadBook` 获取 `words.jsonl` 并组装学习条目；词书查询在前端内存完成。用户编辑保存为 seekdb 应用状态中的覆盖书，不自动双写规范词库表。

数据库初始化验证清单、文件集合、校验和、计数及成员关系，再分批补齐缺失词条和词书；保留已有内容及用户修改。数据库词条位于 `ql_word`，`wordbook.words` 使用原生 `VARCHAR(256)[]` 保存顺序，不是 JSON 数组列。

`make init`、`make dev`、`make build` 不生成词库，也不依赖上游仓库 checkout。旧 `make content`、`src/content/` 和 `scripts/content/` 已移除，来源清单中的历史路径不是运行依赖。

## 6. 数据库生命周期与迁移

数据库打开、迁移与词库就绪是不同阶段：

1. 检查平台、固定运行时、数据目录、权限及排他锁，打开数据库。
2. 从构建时自动收集并嵌入的 `src/schema/*.sql` 逐表检查，跳过已有表，顺序创建缺表，并验证所有必需表存在。
3. 基础存储就绪：`phase=ready`、`persistence_ready=true`。
4. 后台验证词库，数据库线程分批导入，批次之间继续处理业务请求。
5. 独立设置 `library_phase` 为 ready 或 error。

新增表只需在 `src/schema/` 添加 SQL 文件并重新构建应用，不需要修改初始化代码或手动注册。不维护迁移版本或旧版 schema 兼容链，不自动 ALTER、重建或修复已有表结构。DDL 可能自动提交，失败后重新检查补缺，不宣称整批事务回滚。

复习读取/提交要求词库就绪，初始化中返回 `LIBRARY_NOT_READY`，词库失败返回 `LIBRARY_UNAVAILABLE`。基础库可用时，听力、AI 配置和语音偏好仍可工作；队列满或工作线程退出返回可重试 `DB_UNAVAILABLE`。

## 7. 学习链路与调度边界

### 拼写、强化学习与自动背诵

拼写提交在桌面调用 `evaluate_spelling`，由 Rust 返回正确性、差异和建议评级；页面使用正确性维护前端会话，错词加入生词表，首轮后进入错词强化。闪卡按朗读、停顿、揭示及位置推进学习。自动背诵按英文、释义、字母拼读、复读和间隔循环，当前位置只在组件内存中。

这些页面没有调用 `submitStoredReview`，建议评级也没有自动交给 Rust 调度器。当前进度主要是位置和会话完成情况，不等于长期掌握度或数据库到期队列。

### Rust 复习能力

`application::rate_card` 校验事件 → 检查幂等 → 加载旧状态 → 比较版本 → 调度 → 原子提交事件和新状态。

seekdb 使用事务和行锁再次核对版本。同一事件重试不重复调度；不同内容复用事件 ID 返回 `EVENT_CONFLICT`，过期版本返回 `SESSION_STALE`。调度算法是 `quicklang-sm2-v1`，不是 FSRS。

复习表当前以 `card_id` 为键，未实现从 UI 用户档案/词 ID 到复习卡的完整映射；接入前必须明确用户隔离、卡片生命周期及重试策略。

### 听力训练

桌面通过 `listening_repository` 将原始音频和训练状态保存到 `ql_listening`，按 owner/material 分组，版本冲突返回 `VERSION_CONFLICT`。浏览器仅内存暂存。

训练为精听、跟读、盲听、复述；TypeScript 独立安排 6 小时、1 天、2 天、4 天、7 天、14 天、28 天的七轮复习。这与 Rust 复习调度不是同一系统。跟读文字匹配不是声学发音评分。

## 8. AI、语音与同声翻译

### AI 配置与调用

设备级多配置及活动选择保存在 `ql_ai_profiles`；密钥操作区分保留、替换和清除。密文采用 AES-256-GCM，主密钥存 Keychain。普通列表不需解密，实际发起动作时才解析凭据；解析失败不退回明文存储。

会话、听力、补词复用 `features/conversation/ai.ts` → `coach.rs`，同声翻译使用 `features/interpretation/ai.ts` → `interpretation_ai.rs`。两条通路直接访问 OpenAI 兼容服务，也可指向单独部署的 LiteLLM Proxy；应用不会自动启动网关。

地址仅允许 HTTPS 或本机 HTTP，拒绝地址内凭据、查询、锚点和重定向。网络层校验输入、大小和响应，错误不能伪装成功；UI 取消不等于已发出的 Rust 请求立即取消。不同通路的限制与超时详见[模块说明](./architecture/modules)。

### 系统语音

桌面通过 `/usr/bin/say` 生成 PCM WAV，再由前端处理边缘静音并播放；浏览器使用 Web Speech API。启动检查在后台执行，不阻塞主界面。增强音色下载辅助需要 macOS 辅助功能权限，只有重新枚举确认安装后才写入确认缓存。

### 同声翻译

macOS 系统/混合音频使用 ScreenCaptureKit，纯麦克风使用 AVAudioEngine，输出 16 kHz 单声道 PCM WAV，常规每 5 秒一段。

处理顺序为：原生采集 → `interpretation-audio` 事件 → seekdb 保存分段 → 串行转写 → 可选翻译 → 更新历史。识别和翻译可选不同 AI 配置；队列达到 12 段时停止采集并处理已保存数据。

**启动即启用自动分段上传。** 这区别于会话练习中点击“转写”才上传录音。采集会议或他人语音前应确认授权及服务隐私政策。

首次打开后页面保持挂载，切换菜单只隐藏，因此采集可以继续；切换用户、卸载、窗口销毁或应用退出触发停止/清理。它是分段处理，不是流式 ASR 或语音到语音翻译。

历史支持音频回放/导出、缺失转写重试和独立分析 run。全文翻译及摘要按段处理，保留部分结果和失败/取消状态，不覆盖实时翻译；异常关闭不等于自动后台恢复。

## 9. 开发、测试与发布

任务统一由 `scripts/tasks.mjs` 分派，Makefile 是薄入口。

- `make init`：准备锁定依赖、项目内 Rust/npm、原生运行时，并实际初始化词库数据库。需要独立数据目录时从初始化开始设置 `QUICKLANG_DATA_DIR`。
- `make dev`：启动 Tauri 桌面开发；`npm run dev`：仅浏览器 UI。
- `make test`：许可、Rust fmt/clippy/默认测试、TypeScript、UI 和脚本测试。
- `make test-db`：需要真实运行时的数据库及桌面存储测试。
- `make review`：许可、Git 空白差异检查、clippy 和类型检查，不是人工安全审计。
- `make docs`：启动文档站；`make docs-build` 或 `npm run docs`：生成 `build/docs/site/`。
- `make build`：校验依赖与词库，构建 UI、server 和未签名桌面应用，复制至 `dist/<platform>-<arch>/`。
- `make release`：重新构建并验证资源、架构和动态依赖，生成 macOS ARM64 ZIP 与 SHA-256。
- `make install`：构建后安装到用户 Applications，拒绝覆盖既有目标。
- `make clean`：清理构建产物，保留依赖、工具链和用户数据库。

完整环境要求和目录见[开发指南](./development/0.1/getting-started)。发布包未配置 Apple Developer ID 签名与公证；配置中的移动/Windows 分支不代表相应平台已经可用。

测试定义、历史测试报告和本次实际执行结果必须分开。文档构建通过只能证明站点可构建，不能替代数据库、系统权限、录音或网络设备验收。

## 10. 许可、隐私与后续演进

QuickLang 自有代码采用 Apache-2.0。Ink-Learner 学习素材按 CC BY-SA 4.0 独立保留来源、许可及修改说明；AI 例句保留来源标记，不冒充上游原文。第三方原生运行时及驱动遵循各自许可和发布要求，见[许可与来源](./reference/licenses)。

后续演进应优先明确以下边界，再扩展平台与同步：

1. 学习页面如何接入复习卡 ID、用户隔离和幂等提交，避免与现有位置进度混淆。
2. UI 覆盖书如何进一步对接规范词库表，同时保留旧 ID、重复成员和既有学习记录。
3. seekdb 与 Keychain 主密钥的备份、恢复和容量管理。
4. 原生音频采集、失败恢复、设备权限和外部服务隐私的真实环境验收。
5. OceanBase、账户与同步协议的独立实现；移动端和 Windows 运行时必须单独验证。

Apple Live Captions 与 ASR 方案比较属于[后续设计](./design/0.2/apple-live-captions)，不是当前代码所用的转写实现。

## 11. 阅读索引

- [整体架构](./architecture/overview)：运行边界、数据层与依赖方向。
- [模块与关键流程](./architecture/modules)：详细实现、失败路径及源码入口。
- [词库数据库说明](./development/0.1/word-library-schema)：规范词库与历史兼容映射。
- [听力训练](./development/0.1/listening)：材料、字幕和训练持久化。
- [大模型统一接入](./development/0.1/llm-gateway)：兼容协议和外部网关。
- [架构图维护](./architecture/diagrams)：现有图的覆盖范围及重新生成方式。
