# 代码逻辑重构实施计划

> **执行要求：** 使用 superpowers:subagent-driven-development，逐项实现并进行设计符合性与代码质量两轮审查。

**目标：** 按已批准的设计拆分存储与听力职责，并验证并发、失败和资源释放行为。

**架构：** storage.rs 保留服务入口，私有请求、线程分发和词库初始化分别归属独立模块。听力页面通过材料管理和进度 Hook 调用独立训练会话组件。

**技术栈：** Rust、Tauri、React、TypeScript、Vitest、seekdb。

## 任务一：存储服务

文件：src/app/src/storage.rs；新增 src/app/src/storage/{request,worker,library,tests}.rs。

- [x] 使用项目本地 Rust 工具链建立 storage::tests 基线：5 个普通测试和 7 个 ignored 真实数据库测试全部通过；共享 build/macos/cargo，禁止并行原生构建。
- [x] 在拆分前补充不同受保护请求的过期拒绝测试、当前版本放行测试及库初始化边界测试；对行为修正先记录失败证据。
- [x] 提取请求协议和拒绝函数，保持响应类型和错误码。
- [x] 提取词库初始化，保持分阶段推进、就绪状态和配置操作独立性。
- [x] 提取工作线程，将启动、版本校验、导入、凭据解析、分发组织成职责明确的函数。
- [x] 原有数据库测试路径继续保持 storage::tests::，避免修改测试运行矩阵。
- [x] 添加英文文档注释；运行 rustfmt 和受影响的存储测试，审查后提交。

测试命令：设置 CARGO_HOME=deps/cache/cargo、RUSTUP_HOME=deps/cache/rustup、CARGO_TARGET_DIR=build/macos/cargo，使用 deps/cache/cargo/bin/cargo test --locked --offline -p quicklang-app --lib storage::tests::，通过 scripts/testing/rust-test-runner.mjs 运行测试二进制；数据库场景追加 --ignored --test-threads=1。预期所有相关用例通过。

## 任务二：听力流程

文件：src/ui/src/shared/features/listening/Listening.tsx；新增 ListeningSession.tsx、useListeningMaterials.ts、useListeningProgress.ts；tests/unit/ui/listening.test.tsx 及新的行为测试文件。

- [x] 基线：npm test -- tests/unit/ui/listening.test.tsx tests/unit/ui/listening-repository.test.ts tests/unit/ui/recorders.test.tsx tests/unit/ui/phrase-cards.test.tsx；49 个测试通过。
- [x] 在拆分前添加可控制 Promise 的连续保存、失败重试、保存期间计时、切换用户/材料后迟到结果和卸载清理测试；若发现缺陷，记录失败结果再修正。
- [x] 提取材料 Hook，明确 owner 和存储依赖，保留部分导入成功结果和浏览器预览。
- [x] 提取进度 Hook，以最新成功保存记录作为下一次变更基准；只扣除成功保存的累计时间。
- [x] 提取训练会话组件，保留界面交互、草稿保存、音频/AI 生命周期。
- [x] 对新增函数写英文 JSDoc；运行相关 Vitest 和 npm run typecheck，审查后提交。

## 任务三：集成验收

- [x] 审查设计符合性，再审查代码质量；修正所有重要问题并重新验证。
- [x] 串行执行 make test、make test-db、make build；每次记录日志、退出码和目标配置。
- [x] 若发现原生契约受到影响，执行 make test-apple。
- [x] 不执行清缓存、安装、Release 或 iOS 构建；这些不属于本轮验收。
- [x] 更新设计稿和本计划的实际状态；报告改动、测试数量及未执行验证，不推断覆盖率提升比例。

## 基线记录

- 听力相关 4 个测试文件：49 个测试通过。
- 用户隔离与业务边界 2 个测试文件：79 个测试通过。
- UI 类型检查通过。
- 存储普通测试：5 个通过；真实数据库测试：7 个通过。

## 存储实施结果

提交 ee3760f0 完成存储拆分；15 个测试通过（8 普通、7 真实数据库）。新增 3 个用例覆盖不同受保护请求、当前版本放行和词库就绪边界。设计符合性与代码质量均经独立审查通过。

## 听力实施结果

提交 50ce4802 完成材料、会话、进度职责拆分。新增 9 个行为测试，4 个相关测试文件共 58 个用例通过，类型检查通过。测试先复现再修正：连续保存过早清除忙碌状态、旧用户异步导入污染新用户列表、取消后仍应用 AI 结果。两轮独立审查通过，其中设计审查独立运行听力测试 30/30。

## 集成验证进度

- make test-db：57 个测试通过，退出码 0。
- make test 首次在 swift-rs 构建脚本启动时被 SIGKILL；系统日志确认 AMFI 的 Unrecoverable CT signature issue。对该生成文件重新进行本地 ad-hoc 签名后重试；保留原始日志。

- make test 在三次本地生成脚本修复尝试后仍受同一 AMFI 拦截；已停止继续签名修复。单独启动已签名脚本成功，但 Cargo 执行时仍失败。未修改业务源码，未清理缓存。接下来独立执行工作区 Rust 测试、完整 UI 与脚本测试，再执行规范 Debug 构建；不宣称完整 make test 通过。

## 最终验证结果

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| 听力相关测试 | 58 个通过 | 新增 9 个行为测试 |
| 存储相关测试 | 15 个通过 | 新增 3 个用例，包含 7 个真实数据库测试 |
| 工作区 Rust 测试 | 314 个通过，91 个 ignored | 使用本地工具链与有界测试启动器；另用数据库矩阵显式运行相关 ignored 用例 |
| make test-db | 57 个通过，退出码 0 | 完整数据库矩阵 |
| 完整 UI 测试 | 105 文件、1056 个用例通过 | 2 个 worker；首次高并发时离线词库用例超时，单独和完整重跑均通过，未放宽超时或断言 |
| 脚本测试 | 177 个通过、1 个跳过 | 构建结束后重跑；未配置 DOCS_TEST_URL，跳过 VitePress 在线导航测试 |
| 格式检查与 Rustfmt | 通过 | 检查最终代码，不改写无关文件 |
| UI 类型检查 | 通过 | 相关测试阶段及规范构建都执行 |
| make build | 通过，退出码 0 | macOS ARM64 Debug，生成应用并验证本地证书签名；未安装或启动 |
| make test | 受阻 | Clippy 的 swift-rs 构建脚本被 AMFI 以 SIGKILL 终止；未获得完整 Clippy 通过证据 |
| 在线 AI 测试 | 跳过 | 此独立工作区未配置 .env.test 的聊天和转写服务 |

完成存储、听力、覆盖率测试更新的设计符合性和代码质量审查；整体生产代码整合审查通过。覆盖率解析器的真实文件测试已随模块拆分更新，并验证外部测试助手不会计入生产覆盖率；未执行覆盖率测量，不声明覆盖率百分比提高。

未运行 make test-apple、Release 或 iOS 构建：此次没有修改 Apple 原生桥或原生契约，验收范围为 macOS Debug 和受影响的共享业务代码。没有删除用户数据或构建缓存。

验证日志位于独立工作区 build/refactor-validation/，保留首次失败与后续重跑日志。用户于 2026-10-06 批准合并到本地 main，已快进合并至重构提交 950d521b；未推送远端。

## 本地 main 合并后验证

- 听力相关测试：58 个通过。
- Rust 覆盖率解析测试：14 个通过。
- 存储测试：15 个通过，包含 7 个真实数据库测试；本地工具链，macOS ARM64 test 配置。
- 合并后源码与重构分支一致，无冲突。此次未重新运行规范应用构建；合并前 macOS ARM64 Debug 构建通过，Clippy 的 AMFI 限制仍按原记录保留。
- 合并前未跟踪的初始设计稿保存在 build/refactor-validation/pre-merge/。
- 临时工作区的忽略产物和日志已保存在主目录 build/refactor-handoff/code-clarity/；合并后日志在 build/refactor-validation/post-merge-*.log。
