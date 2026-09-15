# 测试覆盖率与代码审查记录

日期：2026-09-14（Asia/Shanghai）。范围为本次工作区全部未提交业务代码，包括已有新增文件；验证期间新增的自动朗读、强化学习设置及起始位置预览也纳入最终前端测试。保留原有修改，未创建提交。

## 覆盖率实测

| 统计范围 | 开始时 | 完成时 |
| --- | ---: | ---: |
| 前端行 | 84.36% | **94.32%** |
| 前端语句 | 71.21% | 84.95% |
| 前端分支 | 69.04% | 78.67% |
| 前端函数 | 67.08% | 80.79% |
| Rust 业务代码行，默认测试集 | 27.68%（343/1239） | **59.61%（741/1243）** |
| Rust 业务代码行，默认测试集 + 真实数据库 | 未测基线 | **84.96%（1056/1243）** |
| Node 脚本行 | 未测基线 | 60.85% |
| Node 脚本分支 | 未测基线 | 84.62% |

前端使用 Vitest V8，统计 `src/mac_ui/src` 所有 TS/TSX 业务文件，仅排除挂载入口 `main.tsx`；未导入的文件也包含在统计范围。最终前端统计包含执行期间其他任务新增的朗读设置代码，所以分母也有增长。

Rust 使用 cargo-llvm-cov 0.9.1、Rust 1.93.1 的 llvm-tools-preview。原生 LLVM 报告会把同文件内的测试函数也算入分母和分子，因此新增 `scripts/testing/rust-coverage.mjs`，从 LCOV 中剔除顶层 `#[cfg(test)]` / `#[cfg(all(test, unix))]` 模块，仅比较业务代码。没有剔除未覆盖的桌面启动、命令转发或二进制入口。较早记录的 Rust 29.13% 是包含测试体的原始数值，应使用本表修正后的 27.68% 基线。原始 JSON/LCOV 留存供复查。

Node 使用 Node 24 的原生测试覆盖率，包含测试调用的 CLI 子进程。两个新增内容处理模块 `apply-example-supplements.mjs`、`generate-word-library.mjs` 行覆盖率均为 100%；源码下载、原生编译、安装和打包流程没有用单元测试模拟执行，仍计入脚本报告中的未覆盖代码。不同语言的统计方式不同，不混成一个仓库总百分比。

## 测试与验证结果

- 最新前端：161 项通过，16 个测试文件；覆盖率门槛通过。
- Rust 默认测试集：61 次测试执行通过，4 项真实引擎测试显式忽略；其中 native 模块通过 `#[path]` 被两个集成测试目标复用，5 个原生单测会在三个目标分别执行，61 不是唯一测试函数数量。
- 真实 seekdb：4 项测试均通过，覆盖音频/元数据持久化与用户隔离、乐观版本冲突、幂等复习写入、跨进程恢复、事务回滚、完整词库导入与旧库迁移及用户编辑保留、词书 ARRAY/schema 约束。
- Node 脚本：23 项通过。
- `make test`：Rust fmt、Clippy（工作区所有 target，warnings 视为错误）、Rust 测试、TypeScript 和前端/脚本测试通过。
- `make test-coverage`、`make test-coverage-db`：通过。最后的前端修复与同期朗读代码更新另以 `npm run test:coverage` 复测通过；Rust 源码此后未改动。
- `make build`：通过，生成 `dist/darwin-arm64/macos/QuickLang.app`。
- `make docs`、`make review`、`git diff --check`：通过。

## 审查修复及回归测试

| 问题 | 修复 | 回归测试 |
| --- | --- | --- |
| 编辑现有单词重新创建对象，丢失音标、翻译列表和例句来源 | 保留原词条附加字段，再覆盖用户编辑内容 | `tests/unit/ui/library.test.tsx` |
| 导入 JSON 词书保存失败后仍切换到新词书 | 使用已校验持久化结果的 `saveBook`，成功后才切换 | `tests/unit/ui/library.test.tsx` |
| 麦克风权限请求期间父页面没有锁定，可能切走后收到过期授权 | 请求开始就通知父页面；以请求代次拒绝卸载后的旧授权，释放音轨 | `tests/unit/ui/recorders.test.tsx` |
| 听力组件接受空或超限录音；两种录音组件在设备错误后仍可发布残缺录音 | 校验字节数；错误后丢弃当前录音并释放音轨，支持重试 | `tests/unit/ui/recorders.test.tsx` |
| 非法十六进制音频被静默转换为错误字节 | 校验类型、长度、偶数位数和十六进制字符，显式报错 | `tests/unit/ui/listening-repository.test.ts` |
| 听力切句失败时丢失尚未保存的回答 | 切句保存成功后才清理回答；复述模式保留整段草稿 | `tests/unit/ui/listening.test.tsx` |
| 收藏短语失败时清空词语/笔记草稿 | 将保存结果返回给组件，成功才清空；异步保存期间新输入保留 | `tests/unit/ui/phrase-cards.test.tsx` |

已审查前端用户隔离、学习状态机、词库编辑与查询、AI 请求/取消/响应限制、录音生命周期、听力保存队列，以及 Rust FFI 生命周期、事务 RAII、复习幂等性、存储线程、词库校验、迁移、内容校验和运行库准备流程。新增原生接口单测使用受控 C ABI 函数，验证成功/错误/栈展开时的释放与回滚；它们与真实引擎测试分别运行。

## 可复现入口与 CI

首次准备 Rust 覆盖率工具（任务脚本会优先使用 `deps/cache/cargo` / `deps/cache/rustup`；安装时应使用相同工具链）：

```sh
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --version 0.9.1 --locked
```

```sh
make test
make test-coverage
make test-coverage-db
```

CI 已安装固定版本覆盖率工具，执行上述覆盖率任务并上传 `build/coverage/`。前端门槛：行 93%、语句 83%、函数 79%、分支 77%；Rust 业务代码行门槛：默认测试集 55%、包含数据库 75%。

- 前端 HTML：`build/coverage/ui/index.html`
- 前端明细：`build/coverage/ui/coverage-summary.json`
- Rust 业务代码：`build/coverage/rust-unit-summary.json`、`build/coverage/rust-db-summary.json`
- 基线：`build/coverage/baseline-ui/`、`build/coverage/baseline-rust-summary.json`
- 最终日志：`build/qa/final-tests.log`、`final-ui-coverage.log`、`final-coverage.log`、`final-db-coverage.log`、`final-build.log`

## 尚未覆盖的边界

测试和审查不能证明所有运行条件下绝无错误。仍未用真实麦克风、系统授权弹窗或付费 AI 厂商接口进行端到端验证；录音使用 MediaRecorder 替身，网络使用本机模拟服务/IPC。Tauri 启动与窗口生命周期、原生运行库下载/编译/安装也未达到完整单元覆盖，构建通过不等于这些路径均做过人工实测。macOS 应用未签名，符合当前打包配置。

## 提交前复审（2026-09-14）

复核当前待提交改动中的数据库事务与迁移、原生接口资源释放、用户存储隔离、学习进度、词库维护、AI 传输及运行库准备流程。

发现并修复 P2 问题：桌面转写和字幕生成在 `Blob.arrayBuffer()` 异步读取期间取消，仍会调用 IPC 上传音频。现在读取完成后、发起 IPC 前再次检查取消状态。新增两项回归测试，已验证修复前失败、修复后通过。已发出的桌面请求仍只能丢弃迟到响应，本次不改变后端请求的取消机制。

本轮验证：`make test`、`make test-db`、`npm run test:coverage`、`make build`、`make docs` 和 `make review` 通过。修复后的前端共 171 项测试通过，行覆盖率 93.88%、语句 85.11%、分支 79.31%、函数 80.98%，覆盖率门槛通过。真实数据库的 4 项测试均单独执行通过。此次未重新测量 Rust 覆盖率，前文数值保留为此前实测记录。

日志位于 `build/qa/review-*.log`（构建输出目录不提交）。真实麦克风和外部 AI 厂商调用未在本轮实测。
