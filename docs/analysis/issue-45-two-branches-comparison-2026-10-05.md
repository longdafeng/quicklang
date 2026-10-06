# Issue 45 两分支实现与故障对比

日期：2026-10-05。以下结论基于本次读取的代码和本机新运行的测试；分支内的旧验收报告不作为本次通过证据。

## 结论

建议在修复存储回归后，以 local/issue-45-longterm 为后续整合基础：它的错题本、手动添加、隐私清除、原生导出和语音开始后的评分流程更完整，存储模块也更易维护。opencode 的独立 application 业务层、四项统计界面和广泛的三后端合同测试值得吸收，但已补充复现两个复习界面故障。local 的长期学习合同与 UI 测试通过，但真实 seekdb 的词库缺表修复测试稳定失败，完整原生验证还受到 swift-rs 构建进程 SIGKILL 阻塞。因此两边都不宜直接视为发布候选。

两个实现不能直接共用已有长期学习数据库。本次 SQLite 双向 schema 切换均复现缺失列；合并前必须确定迁移策略或明确隔离测试数据库。

## 比较范围与隔离

| 项目 | opencode | local |
|---|---|---|
| 分支 | issue/45-longterm-learning-opencode | local/issue-45-longterm |
| 固定提交 | 286631a66d0abf037ced2b176e90e7e83c5fc753 | d7c1625320a990720d8cdb7921f6f4f177ad10bf |
| 独有提交数 | 43 | 11 |

共同祖先：cb2db77dd1821768600d0be9ba1d51d377a02bce。两分支之间 194 文件变化、24,158 行新增、61,103 行删除（从 opencode 到 local，包含文档和测试）。这些数字不代表功能或质量评分。

两份 detached worktree 位于 build/branch-comparison/opencode 和 local。依赖缓存与 node_modules 复用原工作区；Git 源码和 build/macos/cargo 输出分离。测试数据使用自动测试的隔离目录，未使用用户真实应用数据库。原工作区现有 iOS 脚本修改未参与分支测试，未提交、合并或修复任一分支。

## 功能实现

| 功能 | opencode | local | 判断 |
|---|---|---|---|
| 普通拼写错误进入长期学习 | 一次事务写普通状态、卡、来源、事件，维护 owner app-state version | 原生先冻结普通会话上下文；精确 app-state token/CAS 与来源校验；一次事务提交错误与长期记录 | 两边都有；local 对陈旧来源、并发状态的契约更明确 |
| 正式复习 | 到期分组、SHA-256 稳定排序、冻结会话、Again 等待与恢复 | 相同主要规则；全流扫描、保留 top K；原生会话/题目/卡三重版本校验 | 正常流程规则近似；异常恢复与数据模型不同 |
| 复习数量 | 实际 UI 使用固定默认 20；后端支持 5–100 | UI 可输入 5–100，默认 20 | local 更灵活 |
| 提前练习 | 筛选、排序、分页加载、选择 1–100、继续会话 | 独立错题本入口、筛选、排序、分页、选择 1–100、继续会话 | 两边均有，不推进正式排期 |
| 手动加词 | 后端有 add_card；实际复习界面无添加入口 | UI 先 prepare 读取下一代，再以双 UUID 执行添加 | local 用户闭环更完整 |
| 错题详情 | 后端有详情接口；复习时用于来源解析，列表无完整详情入口 | 单词、来源分页、事件分页、调度、累计错误次数 | local 更完整 |
| 来源暂停/恢复/删除 | 后端实现 | 后端实现、详情显示来源状态 | 两边都没有发现可操作的来源状态按钮；不要把后端能力写成已交付 UI |
| 隐私清除 | 后端 word/book/user 清除与 tombstone，UI 无对应管理入口 | 单词/词书/用户范围确认清除，失效相关回执与会话 | local UI 更完整 |
| JSON 导出 | 后端流式快照、临时文件原子发布；IPC 接受 output_path；复习界面无导出入口 | 原生 macOS/iOS 保存选择器、取消控制、临时文件原子发布、导出确认 UI、JSON schema | local 产品闭环与文件权限边界更明确；Windows 导出 handler 明确返回失败 |
| 首页统计 | 到期、已掌握、7 日首次正确率、30 日错误次数 | 到期、7 日首次正确率（整数分子/分母）、30 日易错次数 | local 缺已掌握总数；卡片仍有掌握状态/筛选，属于统计功能差异 |
| 语音评分门槛 | `audio !== failed` 即认为 audible；异步语音渲染尚未完成也可评分 | 播放开始回调才设置 heard；失败、取消、换题取消证明 | local 更准确；opencode 故障见下 |
| 导航中未知结果重试 | 复习组件按路由挂载/卸载；尝试保存在组件 ref | LongtermArea 保持挂载；固定 UUID/payload 重试、owner key 隔离 | local 更有利于保留未确认操作；仍不是重启后持久化的前端重试队列 |
| 跨平台 | 共享 UI 与后端；IPC 的 Desktop 名称不是 iOS 禁用判断 | 明确共享 UI、平台保存对话框 | 本次 host SQLite 不是 iPhone 端到端验收 |

## 架构与维护取舍

opencode 调用链：ReviewSession/useReviewSession → native/longterm typed IPC → app/longterm → application/longterm → storage-api LongtermRepository → storage-seekdb 的 longterm_repo/ordinary/list/clear/export 等模块 → 原生后端。

优点：application 层明确注入 Clock 和抽象 Repository，便于内存后端合同测试；底层 storage 与业务 repository 能分别验证；文档包含完整运行手册、验收和性能报告；正式/提前 UI 使用同一复习组件，统计文字与语义表格清晰。

代价：app/longterm.rs 约三千行，application/longterm.rs 约两千行，多个存储文件也达千行以上；DTO 转换、业务校验、存储校验较多；存在旧测试 mock 与真实 SQL 契约脱节。后端接口齐全但用户管理入口尚不齐全。

local 调用链：LongtermArea/useReview/ReviewQuestion/notebook → versioned client → app/longterm dispatch → StorageService 有界 owner-thread 队列 → storage-api 各小 trait → storage-seekdb/longterm 分模块事务 → prepared binding/C connector 或 SQLite。

优点：领域类型拆成 enums/identity/models/validation；存储按 ordinary/sessions/lifecycle/queries/export 分责；统一中立 DTO 和错误码；绑定参数避免把值拼入 SQL；SQL CHECK、引用校验、回执依赖失效一起加强数据边界。UI 冻结操作 UUID/payload，原生返回权威快照；普通学习大词书容量、来源化身、事件分页排除大回执等有回归测试。

代价：长期业务不再有独立 application 层，更多业务编排在具体存储事务模块；应用 dispatch 也直接依赖 SeekDbEmbeddedAdapter，对未来替换 backend 的抽象隔离弱于 opencode。额外 C bridge 和平台原生导出增加需要跨平台维护的代码。严格新 schema 并未附带旧分支数据迁移。百万事件优化不能仅由代码推断实测优胜。

两边的主要排期均为 1/3/7/14/30 天，随后倍增并封顶 3650 天；Again 等待至少 60 秒；提前练习不改变正式排期；首次 30 天记录 mastery；普通错误重置排期。local 统一使用受验证 signed i64；opencode 多使用 u32/u64，并限制非负时间。调度 API 与存储布局不同，不能互换 DTO 或数据库文件。代码上的边界/性能机制差别不等于本机性能排名。opencode 在 sr_load_due_candidates 收集候选 Vec，再排序选择；local 用 100 行 keyset 分页扫描并保留 K 个最优候选，减少排名阶段的内存需求，但仍扫描完整候选集合。

## 可复现故障与缺口

### F1 — opencode 最后一题完成后显示失败（P1）

`useReviewSession.adopt` 在 getActiveSessions 返回空时设置 phase=failed。提交成功后代码忽略返回的 completed session，再调用 adopt。真实 SQL 只查 state='active'，而最后一题已把会话更新为 completed，因此读不到 active 是正常结果。

本次补充测试模拟最后一张 Good 成功、提交返回 completed、后续活动查询为空，预期“本轮复习完成”失败，实际显示“本轮复习数据不可用，请重试”。已保存的评分/排期未因此回滚，故障在完成页面。原有完成测试返回 formal: completed，这违背实际 active-only 查询，导致假通过。

### F2 — opencode 未开始播放就能评分（P1）

ReviewSession 的 audible 条件是 spelling 非空且 audio != failed。调用 speak 前立即设 audio=playing；native speak 先 await speech_render，再 audio.play。渲染等待期无播放证明，但提交能通过。

本次补充测试把 speak 保持 pending，输入并提交，断言 submitAttempt 不应调用，实际已调用。语音慢或随后失败时，可能已写学习评分。local 使用 onStart 设置 heard，并已有对应 UI/audio 回归。

### F3 — 双向复用 SQLite 数据库失败（P1，切换/升级条件）

两个分支 SQLite user_version 都为 1，初始化使用 CREATE TABLE IF NOT EXISTS，没有此两实现之间的迁移。用各自 schema 创建隔离数据库，再执行另一分支 schema，初始化均成功；执行目标实际需要的列查询分别失败：

- opencode → local：`no such column: result_json`。
- local → opencode：`no such column: item_index`。

还存在 source incarnation、session creation_payload_hash、约束和字段表示等差异。上述结果是 SQLite schema/查询实测，不是完整应用升级测试；seekdb 的 schema 也改变且默认只检查表存在，兼容性风险可由源码确认，但本次未对同一 seekdb 数据目录进行双向切换。

### F4 — local 完整回归未通过：swift-rs 构建 SIGKILL（验证阻塞）

本次原始 `make test`、保留缓存的复跑，以及补齐隔离依赖后的 `make build` 均在 `swift-rs v1.0.8` 的 `build-script-test-build` 被 signal 9 终止。日志没有提供根因；不能直接归因于长期学习源码，也不能说完整 make test 通过。领域/调度/SQLite 与 UI 测试随后独立运行验证。

### F5 — local seekdb 词库缺表修复稳定失败（P1，修复场景）

完整 ignored 数据库矩阵 41 项中 40 项通过，`word_library::tests::full_import_schema_repair_preservation_and_rollback` 失败。单独复跑 local 再次在 word_library.rs:650 失败：已有数据导入并关闭重开连接后，DROP TABLE wordbook，再 ensure_library 重新创建表/恢复词库，返回 `DB_LOCKED`。opencode 的同名测试单独执行通过（1 passed，33.15 秒）；local 独立复跑 27.91 秒后失败。

该测试逻辑基本相同，两个分支的 native driver/事务实现不同；当前证据定位到缺表修复与 native 操作，未完成驱动/引擎层根因诊断，不能宣称是哪一行实现导致。local 的隔离 seekdb 日志还记录了 client error 4012/事务回滚信息；local driver 把 4012 映射为 DB_LOCKED。该映射覆盖更宽的错误范围，所以用户看到的 DB_LOCKED 不足以独立证明普通锁等待就是根因。

影响边界：已有词库的 schema 修复流程；本次长期复习、普通错误、清除、导出等 40 项 ignored 合同仍通过。不得把此结果泛化为所有学习场景失败。

### 功能缺口，区别于崩溃

opencode 尚缺用户可达的手动加词、完整详情、清除、导出界面；local 缺已掌握总数；两边来源状态修改均主要停留在后端接口。这些是阅读实际组件后的交付差异，不是测试返回失败的数量。

## 本次测试结果

| 检查 | opencode | local |
|---|---|---|
| 长期学习/拼写专项 UI | 131 passed / 12 文件 | 86 passed / 11 文件 |
| 全量 UI | 715 passed / 79 文件 | 677 passed / 79 文件 |
| TypeScript | make test 内通过 | 单独 typecheck 通过 |
| Node 脚本 | 164 passed、1 skipped | 164 passed、1 skipped |
| 格式、许可证、Clippy | make test 内通过 | make test 复跑中 Clippy 通过，格式/许可证通过 |
| make test | **通过**；Rust 汇总 603 passed、24 ignored（含无测试的 doc 套件） | **失败，两次**；workspace Cargo test 的 swift-rs build script SIGKILL |
| SQLite Rust | storage + quicklang-tests：415 passed、2 ignored | domain + scheduler + storage：105 passed、1 ignored |
| 真实 seekdb | make test 的多个合同套件已实际执行；额外同名词库修复测试 1 passed | 单独 storage ignored 矩阵：40 passed、1 failed；该失败再独立复跑仍失败 |
| 补充完成页与未播放评分探针 | **2 failed**，原套件漏测 | 已有相应完成/播放开始测试通过；未复制不兼容的 opencode 探针 |
| SQLite 双向 schema 切换 | 目标查询缺 item_index | 目标查询缺 result_json |
| Chrome 渲染 | 未另做浏览器验收 | 已安装 Chrome 154 路由隐藏/保持挂载检查通过；transport mocked |
| make build（macOS ARM64 Debug） | **通过**，本地签名验证通过 | 补齐隔离依赖后复跑，仍被 swift-rs SIGKILL 阻塞 |
| AI 真实服务 | .env.test 未配置，跳过 | .env.test 未配置，跳过 |

Rust backend 测试在 macOS ARM64 host 的 unoptimized test profile 执行，项目 Rust 1.93.1，使用各自 build/macos/cargo。SQLite 是宿主 feature 测试，不能替代 iOS 编译/安装或 WebView 调用验证。双方套件组成不同，不按测试条数判质量或计算覆盖率。

未运行：make release/release_ios、make build_ios、make test-apple、实机安装/启动、端到端原生保存对话框/发音验收、百万事件性能门槛、完整 make test-db（其 ignored 矩阵会包含百万规模测试）。local 本次真实 ignored 矩阵明确 `--skip export_million_events`；没有把 smoke 或旧报告冒充全规模性能通过。已保留 build/cache 和测试输出，没有执行 clean。

日志：opencode-make-test.log、opencode-sqlite-rust.log、opencode-build.log、opencode-probes.log、opencode-import-probe.log；local-make-test.log、local-make-test-retry.log、local-sqlite-rust-retry.log、local-seekdb-rust.log、local-import-retry.log、local-build-retry.log、local-full-ui.log、local-scripts.log、local-chrome.log。


## 复现与证据

全部日志保留在 [build/branch-comparison](../../build/branch-comparison)。主要命令在各自 worktree 根执行：

```sh
make test
npm test -- tests/unit/ui/longterm* tests/unit/ui/spelling*
npm run typecheck
npm test
npm run test:scripts
```

local SQLite：项目本地 Cargo，`cargo test --locked --offline -p quicklang-domain -p quicklang-scheduler -p quicklang-storage-seekdb --features quicklang-storage-seekdb/sqlite`，CARGO_HOME/RUSTUP_HOME 指向 deps/cache、CARGO_TARGET_DIR 指向该 worktree 的 build/macos/cargo，并配置绝对路径 rust-test-runner。

local seekdb：同样环境，`cargo test --locked --offline -p quicklang-storage-seekdb --lib -- --ignored --skip export_million_events --test-threads=1`。opencode SQLite：`cargo test --locked --offline -p quicklang-storage-seekdb -p quicklang-tests --features quicklang-storage-seekdb/sqlite,quicklang-tests/sqlite`。

补充 UI 探针源码保留在 opencode worktree 的 tests/unit/ui/branch-comparison-probe.tsx；复现时暂命名为 .test.tsx，`npm test -- tests/unit/ui/branch-comparison-probe.test.tsx -t 'branch comparison'`。该文件不进入默认套件。原始失败日志 opencode-probes.log，schema 切换结果 schema-switch-probe.json；未修改产品源码来让测试通过。

最初 local 离线 Cargo 缺 sha2-asm 0.6.4，执行 cargo fetch --locked 补齐后继续；锁文件未改。最初手工 runner 使用相对路径导致找不到脚本，改成绝对路径后重跑。local 首次 make build 在 Tauri 步骤因隔离检出的 node_modules 只有先前测试缓存、缺 CLI 而失败；保留该缓存目录并补齐依赖软链接后复跑。它们是本次测试准备问题，不是分支功能故障。

## 整合建议

1. 以 local 的数据契约、UI 和事务边界作为一套完整实现保留，不逐文件混合两套 schema/DTO。
2. 引入 opencode 独立应用层的测试/抽象思路、已掌握统计及其可靠的合同场景；每个场景重接 local 的真实接口，避免复制错误 mock。
3. 为数据兼容增加明确版本与迁移/隔离策略，并测试两种已有数据库。优先修复 opencode 完成页与语音门槛，再考虑把其 UI 整合。
4. 先修复 local 的 seekdb 缺表修复回归，再补齐来源管理入口和统计缺口；排除原生构建阻塞后继续 canonical Apple 验证、安装与实机听音/导出/清除验收。
5. 如需要性能决策，按统一数据规模、profile、硬件和冷热定义重跑双方性能测试。本次不把不同历史报告当成可比成绩。

## 关键源码定位

- [opencode 完成恢复空值分支](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/ui/src/shared/features/longterm/useReviewSession.ts:208)
- [opencode 提交后重新读取活动会话](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/ui/src/shared/features/longterm/useReviewSession.ts:340)
- [opencode 真实活动会话 SQL](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/crates/storage-seekdb/src/longterm_repo.rs:586)
- [opencode 完成提交状态变更](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/crates/storage-seekdb/src/longterm_repo.rs:1382)
- [opencode 语音评分门槛](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/ui/src/shared/features/longterm/ReviewSession.tsx:98)
- [opencode 语音生成先于播放](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/ui/src/shared/features/speech/native.ts:129)
- [opencode 原完成测试的错误 mock](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/tests/unit/ui/longterm-review-session.test.tsx:434)
- [local 原生播放开始回调](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/ui/src/shared/longterm/ReviewQuestion.tsx:59)
- [local 所有管理/复习入口](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/ui/src/shared/longterm/LongtermArea.tsx:17)
- [local 专用导出能力](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/app/src/longterm_export.rs:156)
- [local 事务边界](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/crates/storage-seekdb/src/longterm/mod.rs:49)
- [local 普通会话冻结上下文](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/crates/storage-seekdb/src/longterm/ordinary.rs:78)
- [local 统计类型](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/crates/storage-api/src/longterm.rs:522)
- [local SQLite 初始化版本](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/crates/storage-seekdb/src/sqlite.rs:38)
- [local seekdb 仅检查表存在](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/crates/storage-seekdb/src/schema.rs:112)

- [local 缺表修复失败语句](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/local/src/crates/storage-seekdb/src/word_library.rs:650)
- [opencode 候选加载](/Users/longda/work/repo/myself/quicklang/build/branch-comparison/opencode/src/crates/storage-seekdb/src/longterm_repo.rs:730)
