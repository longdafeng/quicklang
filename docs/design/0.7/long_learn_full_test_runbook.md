# 0.7 长期错题学习 · 全量测试执行手册（Runbook）

> **用途**：Issue #45 收尾阶段「一次性全量测试 + 报告归档」的可执行手册。
> **编写时间**：2026-10-04 23:52 CST（探测式编写，**未运行任何全量测试**）。
> **工作目录**：`/Users/longda/work/repo/myself/git.myself/quicklang_my-worktrees/issue-45-longterm-learning`
> **分支**：`issue/45-longterm-learning`（**本地分支，GitHub 冻结令有效：禁止 push / PR / Issue / 任何 `gh` 写操作**）。
> **基线 HEAD**：`85df722b fix(longterm): 修清除审计明文 owner 与重遇语义分歧 (#55)`。
> **数据来源**：本手册全部命令与数字均从 `Makefile`、`scripts/tasks.mjs`、`scripts/build-layout.mjs`、
> `scripts/testing/rust-test-matrix.mjs`、`scripts/bootstrap/*.mjs`、`.github/workflows/ci.yml`、
> 各 `Cargo.toml`、`tests/vitest.config.ts`、`opencode.db` 只读探测得出，**未凭记忆书写**。

---

## 0. 30 秒速查（收尾时照此顺序执行）

```bash
cd /Users/longda/work/repo/myself/git.myself/quicklang_my-worktrees/issue-45-longterm-learning

# 0) 环境注入（每次开新终端都要重跑；与 tests/native/apple-regression.sh 完全一致）
export CARGO_HOME="$PWD/deps/cache/cargo"
export RUSTUP_HOME="$PWD/deps/cache/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_TARGET_DIR="$PWD/build/macos/cargo"     # 与 make test / test-db 共享，不另开 10G

# 1) Rust 全量（含 doctest）
cargo test --locked --offline --workspace \
  --config "target.'cfg(target_os = \"macos\")'.runner = [\"$(command -v node)\",\"$PWD/scripts/testing/rust-test-runner.mjs\"]"

# 2) Rust 全量 + SQLite 双后端（无需 seekdb 运行时，见 §3.2）
cargo test --locked --offline --workspace --features quicklang-tests/sqlite

# 3) 前端
npm run typecheck
npm test                                        # = vitest run --config tests/vitest.config.ts
node scripts/format.mjs --check                # = npm run format:check

# 4) 静态检查
cargo clippy --locked --offline --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
make license-check

# 5) seekdb 后端（**需要 make init**，见 §3.4 降级路径）
make init && make test-db

# 6) 基准（磁盘紧张时最后再跑，见 §6 风险 R1）
CARGO_TARGET_DIR="$PWD/build/cargo" cargo bench -p quicklang-tests --features sqlite --bench longterm_bench
```

---

## 1. 环境准备

### 1.1 Cargo 环境注入（**以 `tests/native/apple-regression.sh` 为准，不是我编的**）

`tests/native/apple-regression.sh` 第 6–10 行是仓库内唯一的「裸 cargo 调用」权威样板：

```bash
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"   # 仅 apple-regression 需要
export CARGO_HOME="$PWD/deps/cache/cargo"
export RUSTUP_HOME="$PWD/deps/cache/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
export CARGO_TARGET_DIR="$PWD/build/macos/cargo"
```

`scripts/tasks.mjs` 第 13–18 行做的是同一件事（`make *` 自动注入，无需手动 export）：

```js
const localCargo = join(root, "deps/cache/cargo");
if (existsSync(join(localCargo, "bin/cargo"))) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = join(root, "deps/cache/rustup");
  env.PATH = join(localCargo, "bin") + delimiter + env.PATH;
}
```

另外 `scripts/tasks.mjs` 第 10–11 行会把 `deps/cache/npm/node_modules/.bin` 前置到 `PATH`。

### 1.2 ⚠️ `CARGO_TARGET_DIR` 的三个不同取值（最容易踩的坑）

| 场景 | target-dir | 来源 | 磁盘 |
|---|---|---|---|
| **裸 `cargo` 命令**（不 export） | `build/cargo` | `.cargo/config.toml` 的 `[build] target-dir` | **9.3 GiB** |
| `make test` / `make test-db` / `make test-apple` / `make review` | `build/macos/cargo` | `scripts/build-layout.mjs` 的 `validationEnvironment()` | **4.3 GiB** |
| iOS | `build/ios/cargo` | 同上 `buildLayout()` | — |

`validationEnvironment()` 只对 `test` / `test-db` / `test-apple` / `review` 四个 task 注入
`CARGO_TARGET_DIR=build/macos/cargo`，其它 task 不注入。

> **判定**：若不 export `CARGO_TARGET_DIR` 就跑 `cargo test --workspace`，会用 `build/cargo`，
> **与 `make test` 的 4.3 GiB 缓存完全不共享**，等于在 20 GiB 剩余磁盘上**重编整个 workspace**。
> 这是本手册第 1 号风险（§6 R1）。**要么 export 成 `build/macos/cargo`，要么直接用 `make test`。**

### 1.3 macOS 测试运行器（runner）—— 必须加

macOS 上测试二进制偶发被系统静默 `SIGKILL`。仓库的解法是一个重试包装器
`scripts/testing/rust-test-runner.mjs`（静默 SIGKILL 最多重试 2 次，其余失败原样上抛）。

- `make test` 通过 `--config "target.'cfg(target_os = \"macos\")'.runner = [...]"` 注入（`tasks.mjs` 第 326–333 行）。
- 裸 cargo 必须手动复刻：

```bash
RUNNER_CONFIG="target.'cfg(target_os = \"macos\")'.runner = [\"$(command -v node)\",\"$PWD/scripts/testing/rust-test-runner.mjs\"]"
cargo test --locked --offline --workspace --config "$RUNNER_CONFIG"
```

> 注意用 `$(command -v node)` 而不是硬编码 `node`：`tasks.mjs` 用的是 `process.execPath`，
> 而 `apple-regression.sh` 用的是裸 `node`。两者都能工作，但保持一致更安全。

### 1.4 Rust 工具链

`rust-toolchain.toml`：channel `1.93.1`，profile `minimal`，components `rustfmt` / `clippy` / `llvm-tools`。
`deps/cache/cargo/bin/` 已含 `cargo`、`cargo-fmt`、`cargo-clippy`、`cargo-llvm-cov`(?)
→ `make doctor` 可验证版本（`node --version` / `npm --version` / `cargo --version`）。

`Cargo.lock` 已被本分支改动过（`git log` 显示 `Cargo.lock` 与 `2587eacf` 同批），因此
**所有 cargo 命令必须带 `--locked`**，否则 CI 与本地会解析出不同依赖图。

### 1.5 Node 侧依赖

- `package.json` 的 `packageManager: npm@11.12.1`，`engines.node >= 22.12.0`。
- workspace：`src/ui`（`@quicklang/ui`）+ `scripts/docs`（`@quicklang/docs`）。
- 安装方式：`npm ci`（`scripts/bootstrap/init.mjs` 第 99 行：`fetchDependencies("npm", ["ci", "--fetch-retries=2", "--fetch-timeout=60000"])`）。
  → **首选 `npm ci`**；仅当 `package-lock.json` 与 `node_modules` 已一致且不想清缓存时，
  才用 `npm install --prefer-offline`。
- `node_modules/` 已存在（195 个顶层条目），一般无需重装。
- `make init` 第 [3/6] 步会顺带跑 `npm ci` + `cargo fetch --locked`。

### 1.6 `make init` 的实际作用（**以 `scripts/bootstrap/init.mjs` 为准**）

`Makefile:3-4` → `make init` = `./scripts/init.sh`；`init.sh` 只做 Node 版本门禁后
`exec node scripts/tasks.mjs init` → `scripts/bootstrap/init.mjs::initialize()`。

| 步 | 内容 | 是否需要网络 | 幂等/副作用 |
|---|---|---|---|
| [1/6] | `preflight()`：Node ≥22.12、**必须 macOS 15+ ARM64**、`xcrun clang`、npm/git/curl/perl/make、cmake（缺失则尝试 `brew install cmake`） | 否 | 无 |
| — | `acquireInitLock()`：在 `deps/cache/init.lock` 建目录锁，`owner.json` 记 pid+host；**只回收同 host 且进程已死的锁** | 否 | 有锁目录时若属主活着 → 直接报错退出 |
| [2/6] | `selectNetwork()` + `ensureRust()`：装仓库本地 Rust 1.93.1 | 视 `QUICKLANG_NETWORK` | — |
| [3/6] | `npm ci --fetch-retries=2 --fetch-timeout=60000` + `cargo fetch --locked`（`CARGO_HTTP_TIMEOUT=60`，被杀进程会重试） | **是** | 覆盖 `node_modules/` |
| **[4/6]** | **`node scripts/bootstrap/seekdb.mjs`**：下载并构建 seekdb 1.4.0 ARM64 运行时 + OpenSSL 3 + C driver，落盘 `deps/cache/seekdb-runtime/` | **是** | 见 §3.4 |
| [5/6] | `verifyLibrary()` 校验内置词库 → `cargo build -p quicklang-storage-common --bin init-word-library` → 无参跑一次（退出码 1 视为通过，打印 usage） | 否 | 编译产物 |
| [6/6] | `init-word-library <library> <dataDir> deps/cache/seekdb-runtime`，`dataDir` 默认 `~/Library/Application Support/<tauri identifier>/seekdb-1.4.0` | 否 | **写用户数据目录** |

**结论**：`make init` 是「**装运行时 + 首次初始化用户数据库**」，不是单纯装依赖。
只在需要解除 seekdb `#[ignore]`（§3.4）时才必须跑；纯 Rust/前端全量测试**不需要**它。

### 1.7 `make init` 的前置条件（本机满足情况已探测）

- macOS 27.0.1 / Apple Silicon（M2 Max）→ ✅
- `deps/cache/cargo/bin/cargo` 存在 → ✅（工具链已就绪，[2/6] 可跳过）
- `deps/cache/seekdb-runtime/` **当前为空目录（0 文件）** → ❌ [4/6] 未完成，**这是 §3.4 降级的根因**
- `deps/cache/init.lock` 不存在 → ✅ 无残留锁

---

## 2. 测试矩阵总览

| # | 阶段 | 命令 | 覆盖 | 预计耗时（量级） | 串/并 |
|---|---|---|---|---|---|
| T0 | 环境 | `make doctor` | node/npm/cargo 版本 | <5 s | 串 |
| T1 | Rust 全量 | `cargo test --locked --offline --workspace` + runner | 12 个 workspace 成员的全部 lib/bin/test + **doctest** | 冷 20–40 min / **热 5–15 min** | **独占**（编译锁） |
| T2 | Rust + SQLite | `cargo test --locked --offline --workspace --features quicklang-tests/sqlite` | 同 T1，外加被 `#[cfg(feature="sqlite")]` 门控的 ~114 个双后端用例 | 冷 20–40 min / 热 5–15 min | **独占**，必须与 T1 串行 |
| T3 | longterm 定向 | `cargo test --locked --offline -p quicklang-tests --test longterm` （+ 其余 6 个目标） | 逐目标回归 | 各 5–60 s | 可与前端并行 |
| T4 | seekdb 后端 | `make init && make test-db` | `DATABASE_TEST_CASES` 5 组 `#[ignore]` 用例 | `make init` 10–30 min（**含 OpenSSL 编译**）+ 测试 3–10 min | **独占** |
| T5 | 前端 typecheck | `npm run typecheck` | `tsc --noEmit`（`@quicklang/ui`） | 10–30 s | 可与 T3 并行 |
| T6 | 前端全量 | `npm test` | 81 个 vitest 文件（`tests/unit/ui/**`） | 1–3 min | 可与 T5 串（同一 node_modules） |
| T7 | 前端脚本 | `npm run test:scripts` | `tests/unit/scripts/*.test.mjs`（35 个） | 20–60 s | 可与 T6 并行 |
| T8 | 格式 | `node scripts/format.mjs --check` + `cargo fmt --all -- --check` | prettier + rustfmt | 10–30 s | 任意 |
| T9 | clippy | `cargo clippy --locked --offline --workspace --all-targets -- -D warnings` | 12 成员 + **benches** | 冷 15–30 min / 热 2–5 min | **独占** |
| T10 | 许可证 | `make license-check` | `scripts/compliance/check.mjs` | 5–20 s | 任意 |
| T11 | 基准 | `cargo bench -p quicklang-tests --features sqlite --bench longterm_bench` | 2 万卡 / 100 万事件 / 200 次迭代 | **≈24 min**（实测 1431.8 s）+ 首次 release 编译 10–25 min | **独占**，**磁盘最重** |

### 2.1 并行策略

**Cargo 侧全部串行。** 同一 `CARGO_TARGET_DIR` 下并发 cargo 会争抢 `target/debug/.cargo-lock`
并触发 `Blocking waiting for file lock on build directory`。仓库自己的
`AGENTS.md` 第 12 行也是这条规则：「Serialize tasks that write the same native build outputs.」

唯一安全的并行组合：

```
时段 1（独占）: T1 → T2 → T9        # 三个 cargo 阶段串行，共用 build/macos/cargo
时段 2（独占）: T4                   # make init 会 fetch + 编译，别与 cargo 阶段重叠
时段 3（独占）: T11                  # release/bench profile，磁盘峰值
时段 4（可并行）: T0 T5 T6 T7 T8 T10 # 纯 Node/只读，无 cargo 锁
```

T3（longterm 定向）属于时段 1 内：它在 T1 之后跑，因为 T1 会先把 10 个成员的测试二进制编出来，
T3 随后基本是纯执行（秒级）。

### 2.2 `--offline` 的含义

所有仓库既有命令（`make test`、`apple-regression.sh`、`native-ai-models.mjs`、基准文档 §8）
都带 `--locked --offline`。`--offline` 意味着**不能有新依赖可下载**；`Cargo.lock` 里
`rusqlite 0.37 bundled` 等已 vendor 到 `deps/cache/cargo/registry`。任何 `Cargo.toml` 改动
若引入新 crate，`--offline` 会直接失败 → 必须先 `cargo fetch --locked`（`make init` [3/6] 会做）。

---

## 3. 逐条命令详解

### 3.1 T1 — Rust 全量（含 doctest）

```bash
RUNNER="target.'cfg(target_os = \"macos\")'.runner = [\"$(command -v node)\",\"$PWD/scripts/testing/rust-test-runner.mjs\"]"
cargo test --locked --offline --workspace --config "$RUNNER"
```

- **workspace 10 个成员**：`src/crates/{application,domain,scheduler,storage-api,storage-seekdb,sync-core,typing-engine}`、`src/server`、`src/app`、`tests/rust`（包名 `quicklang-tests`）。
- ⚠️ `src/app`（`quicklang-app`）**不在 `default-members`** 里（`Cargo.toml:4` 只有
  `src/crates/*`、`src/server`、`tests/rust`），所以裸 `cargo test`（无 `--workspace`）
  **会漏掉 quicklang-app 的全部测试**。必须写 `--workspace`，或用 `make test`。
- **doctest**：`cargo test` 默认对所有 lib 目标跑 doctest（`--doc`）。`make test` 走的也是
  `cargo test --workspace`，同样含 doctest，所以「含 doctest」与 CI 口径一致。
- **不编译 benches**：`cargo test` 的默认目标选择是 lib/bins/tests/examples + doctest，
  **不含 bench**。所以 `[[bench]] longterm_bench` 的编译问题不会在 T1 暴露，
  但会在 **T9（clippy `--all-targets`）** 暴露 —— 见 §6 R4。

等价的官方入口是 `make test`，但它会**额外**跑 `npm run test:ai`（见 §3.6），
且不能只跑 Rust 部分。收尾时建议 **T1/T2 用裸 cargo（可控），前端与静态检查用 `make` 目标**。

### 3.2 T2 — Rust 全量 + SQLite 双后端

```bash
cargo test --locked --offline --workspace --features quicklang-tests/sqlite --config "$RUNNER"
```

**feature 名以 `tests/rust/Cargo.toml` 与 `src/crates/storage-seekdb/Cargo.toml` 为准：**

```toml
# tests/rust/Cargo.toml
[features]
sqlite = ["quicklang-storage-common/sqlite"]

# src/crates/storage-seekdb/Cargo.toml
[features]
default = []
sqlite  = ["dep:rusqlite"]
```

- 只有 `quicklang-tests` 与 `quicklang-storage-common` 有 `sqlite` feature；
  其余 10 个成员没有 → workspace 级启用必须写**包限定名** `quicklang-tests/sqlite`。
- feature 沿链传播：`quicklang-tests/sqlite` → `quicklang-storage-common/sqlite` → `dep:rusqlite`。
- 后端切换点在 `src/crates/storage-seekdb/src/lib.rs`：
  `#[cfg(any(target_os = "ios", feature = "sqlite"))]` 走 bundled rusqlite；
  `#[cfg(not(any(target_os = "ios", feature = "sqlite")))]` 走 `libloading` 加载
  `deps/cache/seekdb-runtime/libseekdb.dylib`（`lib.rs:67`）。

> **这是本手册最重要的判定口径**：T2 **不需要** seekdb 运行时。
> 全部 `#[cfg(not(feature = "sqlite"))] + #[ignore]` 的用例在 T2 下会被
> **cfg 编译掉**（不是被 ignore），对应地 `#[cfg(feature = "sqlite")]` 的对偶用例会**真实运行**。
> 也就是说：**T2 是本机（无 seekdb 运行时）能拿到的最强 Rust 验证**。

### 3.3 T3 — longterm 各定向目标

`tests/rust/Cargo.toml` 声明的 `[[test]]` 目标与用例规模（探测自 `grep -cE '^\s*#\[(tokio::)?test'`）：

| 目标名 | 源文件 | `#[test]` 数 | `#[cfg(feature="sqlite")]` 块 | `#[cfg(not(feature="sqlite"))]` 块 | 其中 `#[ignore]` |
|---|---|---:|---:|---:|---:|
| `longterm` | `tests/contract/longterm.rs` | 59 | 21 | 21 | **20** |
| `longterm_clear` | `tests/contract/longterm_clear.rs` | 54 | 22 | 21 | **18** |
| `longterm_list` | `tests/contract/longterm_list.rs` | 64 | 25 | 24 | **21** |
| `longterm_privacy` | `tests/contract/longterm_privacy.rs` | 36 | 15 | 15 | **12** |
| `longterm_export` | `tests/contract/longterm_export.rs` | 25 | 15 | 5 | **2** |
| `session_state` | `tests/contract/session_state.rs` | 44 | 11 | 9 | **7** |
| `ordinary_error` | `tests/contract/ordinary_error.rs` | 17 | 5 | 3 | **2** |
| `repository` | `tests/contract/repository.rs` | 3 | 0 | 0 | 0 |
| `core` | `tests/unit/rust/core.rs` | 22 | 0 | 0 | 0 |
| `server` | `tests/integration/server.rs` | 1 | 0 | 0 | 0 |
| `seekdb` | `tests/integration/seekdb.rs` | 2 | 0 | 0 | **1** |
| `word_library_schema` | `tests/integration/word_library_schema.rs` | 1 | 0 | 0 | **1** |

单目标跑法：

```bash
for t in longterm ordinary_error longterm_clear longterm_list session_state longterm_export longterm_privacy; do
  echo "===== $t ====="
  cargo test --locked --offline -p quicklang-tests --test "$t" --config "$RUNNER"
done
```

T2 口径下再跑一遍（sqlite 后端）：

```bash
for t in longterm ordinary_error longterm_clear longterm_list session_state longterm_export longterm_privacy; do
  echo "===== $t [sqlite] ====="
  cargo test --locked --offline -p quicklang-tests --features sqlite --test "$t" --config "$RUNNER"
done
```

> `harness = false` 的 bench 不在 `--test` 体系里，见 T11。

### 3.4 T4 — seekdb 后端（`make init` + `make test-db`）

`Makefile` 目标名核实：**`test-db` 存在**（`Makefile:2` 的 `.PHONY` 与 `:5` 的规则列表都在），
`node scripts/tasks.mjs test-db` 的实现（`tasks.mjs:365-369`）是三步：

```js
await checkLibrary();                                   // 校验 src/ui/public/content/word-library
run(process.execPath, ["scripts/bootstrap/seekdb.mjs", "--offline-check"]);
await runDatabaseTests();
```

`runDatabaseTests()` 遍历 `scripts/testing/rust-test-matrix.mjs` 的 `DATABASE_TEST_CASES`
（5 组，全部带 `--ignored --nocapture --test-threads=1`）：

| # | 包 | 目标 | filter |
|---|---|---|---|
| 1 | `quicklang-tests` | `--test seekdb` | `embedded_persistence_and_atomicity`（`--exact`） |
| 2 | `quicklang-tests` | `--test word_library_schema` | `shared_words_and_ordered_array_books`（`--exact`） |
| 3 | `quicklang-storage-common` | `--lib` | （全部 `#[ignore]`） |
| 4 | `quicklang-app` | `--lib` | `storage::tests::` |
| 5 | `quicklang-app` | `--lib` | `speech::tests::persists_download_refusal`（`--exact`） |

#### ⚠️ 降级路径（本机当前状态）

**症状**：`deps/cache/seekdb-runtime/` 是**空目录（0 个文件）**。
此时 `make test-db` 会在第 2 步炸掉：

```
$ node scripts/bootstrap/seekdb.mjs --offline-check
ENOENT: no such file or directory, open '.../deps/cache/seekdb-runtime/manifest.json'
```

`seekdb.mjs::verify()` 第 75 行直接 `readFileSync(join(runtimeDirectory, "manifest.json"))`，
没有空目录兜底 → **硬失败，且是在跑任何测试之前**。

**判定为「环境缺失」而非「真失败」**，依据三条：

1. 失败发生在 `runDatabaseTests()` **之前**，一个测试二进制都没启动；
2. 错误是文件不存在，不是断言失败；
3. 对应用例在源码里全部带 `#[ignore = "requires real macOS ARM64 seekdb runtime (make init)"]`，
   作者已声明它们需要运行时。

**降级路径（按优先级）**：

| 方案 | 命令 | 代价 | 能解除的 ignore 数 |
|---|---|---|---|
| **A（推荐）** 补运行时 | `make init`（联网，10–30 min，含 OpenSSL 3 源码编译） | 磁盘 ~1–2 GiB | **10**（seekdb 系，见 §4） |
| **B** 只跑 sqlite 对偶 | `cargo test --locked --offline --workspace --features quicklang-tests/sqlite` | 0 | **82**（`#[cfg(not(feature="sqlite"))]` 块被编译掉，sqlite 对偶真实运行） |
| **C** 记录跳过 | 在执行报告 §6.2 写明「seekdb 运行时缺失，N 个用例未跑 + 原因 + 复现命令」 | 0 | 0 |

> **方案 B 不是「假装通过」**：它跑的是**同一份契约断言**（`test_idempotent_event_retry(&seekdb_repo(...))`
> 这类共享 helper，见 `tests/contract/longterm.rs:1560-1593`），只是把 `SeekDbEmbeddedAdapter`
> 的底层从 `libseekdb.dylib` 换成 bundled `rusqlite`。执行报告里必须写明
> 「**sqlite 后端已验证 / seekdb 后端未验证**」，不得合并成一句「双后端通过」。

### 3.5 T5/T6/T7 — 前端

```bash
npm run typecheck     # = npm run typecheck --workspace @quicklang/ui = tsc --noEmit
npm test              # = vitest run --config tests/vitest.config.ts
npm run test:scripts  # = node --test tests/unit/scripts/*.test.mjs
```

> ⚠️ **不要写 `npx vitest run`**。vitest 默认只在**根目录**找 `vitest.config.*`，
> 而本仓库的配置在 `tests/vitest.config.ts`。裸 `npx vitest run` 会用默认 include
> `**/*.{test,spec}.?(c|m)[jt]s?(x)`，**行为与 CI 不同，且丢掉 coverage thresholds**。
> 必须带 `--config tests/vitest.config.ts`（即用 `npm test`）。
>
> ⚠️ **不要写 `npm --prefix src/ui test`**。`src/ui/package.json` **没有 `test` 脚本**
> （只有 `dev` / `build` / `typecheck` / `predev` / `prebuild`）→ 该命令直接报错。

`tests/vitest.config.ts` 关键约束：

- `environment: "jsdom"`、`globals: true`
- `include: ["tests/unit/ui/**/*.test.{ts,tsx}"]` → **81 个文件**
- `setupFiles: ["./tests/unit/ui/setup.ts"]`
- `reporters: ["default", "junit"]`，junit 输出 `build/test-results/ui.xml`
- ⚠️ `onConsoleLog(log, type) { if (type === "stderr") throw ... }`
  → **任何测试往 stderr 写一行都会 fail 整个 run**。这是最常见的「假失败」来源。
- coverage thresholds（仅 `--coverage` 时生效）：lines 93 / statements 83 / functions 79 / branches 77

longterm 前端相关文件（8 个，收尾回归重点）：

```
tests/unit/ui/longterm-dashboard-ipc.test.ts
tests/unit/ui/longterm-dashboard.test.tsx
tests/unit/ui/longterm-early-practice.test.tsx
tests/unit/ui/longterm-ipc.test.ts
tests/unit/ui/longterm-ordinary-error.test.tsx
tests/unit/ui/longterm-review-route.test.tsx
tests/unit/ui/longterm-review-session.test.tsx
tests/unit/ui/longterm-session-ipc.test.ts
tests/unit/ui/longterm-session-rules.test.ts
```

### 3.6 `make test` 的完整展开（为什么建议手工拆开）

`tasks.mjs:312-338` 的 `test` case 依次跑：

```
1. npm run format:check          # node scripts/format.mjs --check
2. cargo fmt --all -- --check
3. checkLicense()                # node scripts/compliance/check.mjs
4. cargo clippy --locked --offline --workspace --all-targets -- -D warnings
5. cargo test --locked --offline --workspace --config <macos runner>
6. npm run typecheck
7. npm test                      # vitest
8. npm run test:scripts
9. npm run test:ai               # ← 唯一有「环境依赖」的一步
```

第 9 步 = `scripts/testing/run-ai-model-tests.mjs`，跑两个东西：

- `node --test tests/integration/ai-models.test.mjs` → 未配置 `.env.test` 时
  `skip: config.chat ? false : "chat model is not configured"` → **跳过，不失败**；
- `node scripts/testing/native-ai-models.mjs` → chat / transcription 未配置时打印
  `SKIP: <name> live test is not configured in .env.test` 并 `continue` → **跳过，不失败**。

> 结论：`make test` 在本机**可以跑通**，AI live 测试会自动跳过。
> 但它把 9 步绑成一个不可分割的串行流程，无法「只跑 Rust」或「只跑前端」，
> 且任一步失败会掩盖后续步骤。**收尾时按 §2.1 分时段跑，出问题时定位更快。**
> `make test` 最后跑一次作为「与 CI 口径一致」的收口证明即可。

### 3.7 T8 — 格式检查的作用域（`scripts/format.mjs`）

`scripts/format.mjs:64` 只收集三个目录：

```js
["src", "scripts", "tests"].map((directory) => collectSources(join(root, directory)))
```

扩展名白名单（`format.mjs:24-37`）：`.js/.mjs/.cjs/.ts/.tsx/.mts/.cts/.jsx/.css/.html/.sh`
+ 原生 `.m/.mm/.c/.h/.cpp/.hpp` + `.sql`。排除目录：`node_modules`、`gen`、`public`、
`build`、`dist`、`target`、`.vite`、`.vite-temp`、`cache`、`.temp`。

> **推论**：`docs/**/*.md` **不在格式化范围内**，因此
> `docs/design/0.7/long_learn_full_test_runbook.md` 这类纯文档**不会**被 T8 或 `make format` 改动，
> 也**不会**成为 T8 的失败原因。T8 的实际覆盖面 = `src/` + `scripts/` + `tests/` 下的
> TS/JS/CSS/SQL/shell/clang-format 文件。

---

## 4. 判定标准

### 4.1 什么算「通过」

| 层级 | 通过条件 |
|---|---|
| **单命令** | 进程退出码 0；Rust 无 `test result: FAILED`；vitest 无 failed test 且无 `stderr` 异常抛出 |
| **阶段** | §2 表中所有「必跑」行（T0/T1/T2/T3/T5/T6/T7/T8/T9/T10）退出码均为 0 |
| **全量收尾** | 必跑行全绿 **且** T4 走通方案 A/B/C 之一 **且** §5 判定表无「真失败」条目 |
| **CI 等价** | 额外跑通 `make test`、`make test-coverage`、`make test-coverage-db`（**仅在 seekdb 运行时就绪时**） |

### 4.2 「真失败」vs「环境缺失导致跳过」

| 现象 | 归属 | 处置 |
|---|---|---|
| 断言失败 / `panicked at` / `assert_eq!` 左侧右侧不符 | **真失败** | 进 §5 流程 |
| `test result: FAILED. n passed; m failed` | **真失败** | 进 §5 流程 |
| vitest `stderr` 钩子抛出 `Unexpected stderr outside diagnostic guard` | **真失败**（多半是被测代码漏 `console.error`，或测试自身污染） | 定位到具体文件后修复，**不要**去掉钩子 |
| clippy `error:` / `-D warnings` 触发 | **真失败** | 修代码或 `#[allow]` **并写明理由**，不允许无理由 suppress |
| `cargo fmt --check` 有 diff | **真失败** | `cargo fmt --all` + `node scripts/format.mjs` |
| `Blocking waiting for file lock on build directory` 长时间挂起 | **环境/并发** | 停掉并发的 cargo，串行重跑（§2.1） |
| `Required command not found: cargo` | **环境** | 忘了 §1.1 的 export |
| `cargo failed (101)` 且 stderr 含 `no matching package` / `failed to select a version` | **环境**（新依赖未 fetch） | `cargo fetch --locked` 或 `make init` |
| `ENOENT ... seekdb-runtime/manifest.json` | **环境**（运行时缺失） | §3.4 降级路径 |
| `Test executable killed before producing output; retrying (n/2)` | **环境**（macOS 静默 SIGKILL） | runner 会自动重试 2 次；仍失败才升级为真失败 |
| `SKIP: <model> live test is not configured in .env.test` | **环境**（主动跳过） | 记录跳过，无需处置 |
| 测试输出 `test result: ok. n passed; m ignored` 且 m 全是 seekdb 系 | **环境** | §3.4 降级路径 |

### 4.3 `#[ignore]` 当前总数与按文件分组明细

> 统计口径：`grep -rnE '^[[:space:]]*#\[ignore' tests/ src/`
> （**只统计独立成行的属性**；文档注释里提到 `#[ignore]` 的行不算）。
> 快照时间 **2026-10-04 23:52 CST**，HEAD `85df722b` + 在途 WIP。

#### 总数

| 范围 | `#[ignore]` 数 |
|---|---:|
| `tests/` | **84** |
| `src/` | **10** |
| **合计** | **94** |

#### `tests/` 按文件分组（84）

| 文件 | 数量 |
|---|---:|
| `tests/contract/longterm_list.rs` | 21 |
| `tests/contract/longterm.rs` | 20 |
| `tests/contract/longterm_clear.rs` | 18 |
| `tests/contract/longterm_privacy.rs` | 12 |
| `tests/contract/session_state.rs` | 7 |
| `tests/contract/ordinary_error.rs` | 2 |
| `tests/contract/longterm_export.rs` | 2 |
| `tests/integration/seekdb.rs` | 1 |
| `tests/integration/word_library_schema.rs` | 1 |

#### `src/` 按文件分组（10）

| 文件 | 行 | 数量 | 原因 |
|---|---:|---:|---|
| `src/app/src/storage.rs` | 526 / 710 / 779 / 858 | 4 | `requires real seekdb runtime` ×3、`requires real seekdb and generated seed` ×1 |
| `src/app/src/coach.rs` | 347 / 373 | 2 | `Live provider test; run by make test when chat/transcription is configured` |
| `src/app/src/caption_stream.rs` | 378 | 1 | `Manual saved-profile probe; requires QUICKLANG_AI_PROBE_DATA and QUICKLANG_AI_PROBE_PROFILE` |
| `src/app/src/speech.rs` | 562 | 1 | `requires real embedded seekdb` |
| `src/app/src/ai_network.rs` | 215 | 1 | `Manual live connectivity probe; set QUICKLANG_AI_PROBE_URL` |
| `src/crates/storage-seekdb/src/schema.rs` | 285 | 1 | `requires real macOS ARM64 seekdb runtime` |

#### 按 ignore 原因分组（全部 94）

| 原因 | 数量 | 类别 |
|---|---:|---|
| `requires real macOS ARM64 seekdb runtime (make init)` | 82 | seekdb 运行时 |
| `requires real seekdb runtime` | 3 | seekdb 运行时 |
| `requires real macOS ARM64 seekdb runtime` | 1 | seekdb 运行时 |
| `requires real macOS ARM64 seekdb runtime; run make test-db` | 1 | seekdb 运行时 |
| `requires bundled macOS ARM64 seekdb runtime` | 1 | seekdb 运行时 |
| `requires real embedded seekdb` | 1 | seekdb 运行时 |
| `requires real seekdb and generated seed` | 1 | seekdb 运行时 |
| **seekdb 小计** | **90** | |
| `Live provider test; run by make test when chat is configured` | 1 | AI live（可跳过） |
| `Live provider test; run by make test when transcription is configured` | 1 | AI live（可跳过） |
| `Manual saved-profile probe; requires QUICKLANG_AI_PROBE_DATA and QUICKLANG_AI_PROBE_PROFILE` | 1 | 手工探针（永久跳过） |
| `Manual live connectivity probe; set QUICKLANG_AI_PROBE_URL` | 1 | 手工探针（永久跳过） |
| **非 seekdb 小计** | **4** | |

#### 与已有文档的差异（**必须在执行报告里更正**）

| 来源 | 声明的数字 | 实测 | 说明 |
|---|---|---|---|
| `long_learn_execution_report.md` §「待办 2」 | 「解除 87 个 tests/ `#[ignore]`」 | **84** | 87 是用 `grep -rn "#\[ignore"` 统计的，**把文档注释里的提及也算进去了** |
| `long_learn_execution_report.md` §「待办 2」 | 「快照 23:00 为 tests/ 87」 | **84** | 同上；另有 3 个文件在 23:00 后被 #55-A/#55-B 改动 |
| `long_learn_execution_report.md` §「待办 2」 | `tests/ 归零`（目标） | — | ⚠️ **该目标不可能达成**：4 个 AI live / 手工探针类 `#[ignore]` 与 seekdb 无关，应改为「**seekdb 类 90 个归零，AI live/手工探针 4 个保留**」 |
| `long_learn_execution_report.md` §「待办 2」 | benches 有 2 个 `#[ignore]` 待解除 | **0** | `tests/rust/benches/longterm_bench.rs` 只有 2 处**文档注释**提到 `#[ignore]` 范式（第 55、2178 行），无真实属性 |

#### 解除条件

| 类别 | 解除条件 | 解除方式 |
|---|---|---|
| **seekdb 系 90 个**（其中 82 个是 `#[cfg(not(feature="sqlite"))]` + `#[ignore]` 成对出现） | `deps/cache/seekdb-runtime/manifest.json` 存在且 `node scripts/bootstrap/seekdb.mjs --offline-check` 通过 | `make init` → `make test-db`（T4）。**不需要改任何 `#[ignore]`** —— `#[ignore]` 的语义是「本机没有 dylib 时跳过」，运行时到位后仍需 `make test-db` 用 `--ignored` 显式跑 |
| **AI live 2 个**（`coach.rs:347/373`） | `.env.test` 配好 chat / transcription 凭据（模板见 `.env.test.example`） | `make test` / `npm run test:ai` 自动跑；不配则永久 `SKIP` |
| **手工探针 2 个**（`caption_stream.rs:378`、`ai_network.rs:215`） | 无条件解除（需真实用户档案 / 真实 provider URL） | **不解除**。执行报告里登记为「已说明的未采集项」，不是「未说明的跳过项」 |

> ⚠️ **不要为了「归零」而删 `#[ignore]` 或删 `#[cfg]`。**
> 82 个成对属性是**双后端契约的另一半**，删掉等于永久放弃 seekdb 后端的验证能力。
> `#[ignore]` + 显式 `--ignored` 运行是本仓库刻意的设计（见 `rust-test-matrix.mjs` 的 `DATABASE_TEST_CASES`）。

---

## 5. 失败处置流程

### 5.1 归属判定（三选一）

```
失败出现
  │
  ├─ 编译失败（cargo/rustc/tsc 报错）        → 【实现 bug】或【测试过期】
  │     · 报错文件是 src/**            → 实现 bug
  │     · 报错文件是 tests/**           → 测试过期（签名/字段/契约漂移）
  │     · 报错是 dep/registry          → 环境（§4.2）
  │
  ├─ 运行时断言失败                          → 【实现 bug】或【测试过期】
  │     · 断言的是设计文档（§编号）明确规定的行为 → 实现 bug
  │     · 断言与设计文档矛盾                  → 测试过期（先改测试，再回填文档）
  │     · 断言与另一已提交测试矛盾            → 契约漂移，登记后再裁决（不可两边都改）
  │
  └─ 环境报错（文件缺失 / 锁 / 找不到命令）   → 【环境问题】→ §4.2 表处置，不改代码
```

### 5.2 🚫 绝对禁止

1. **禁止删断言**（删 `assert_*`、放宽 `assert_eq!` 为 `assert!`、把 `.unwrap()` 改 `.ok()`、
   加 `if cond { return; }` 提前退出）。
2. **禁止为过测试新增 `#[ignore]`**。已有 `#[ignore]` 只能因「环境确实缺失」而保留，
   不能因为「跑不过」而新增。新增 `#[ignore]` 一律视为回归。
3. **禁止删 `#[cfg(not(feature = "sqlite"))]` 块或 `#[cfg(feature = "sqlite")]` 块**来消除数量差。
4. **禁止 `--locked` 改成无锁**（会绕过 lockfile 校验）。
5. **禁止 clippy 无理由 `#[allow(...)]`**；确需 suppress 时在代码注释里写清 issue 号与理由。
6. **禁止为了让 `make test` 通过而 `make clean`**（`AGENTS.md:9`：不要为预热而清缓存，
   `build/` 里已有 13.6 GiB 编译缓存，清掉等于重编 40 分钟）。
7. **禁止 `git add -A`**、禁止 stash / checkout / reset / pull；`index.lock` 冲突时**等待重试**，
   不删锁文件。

### 5.3 修复后的最小重跑集

| 改动落在 | 必须重跑 |
|---|---|
| `src/crates/storage-seekdb/**` | T3（该 crate 全部 `--lib`）+ T2（sqlite 组合）+ T4（若运行时可用） |
| `src/app/src/**`（含 `longterm.rs` IPC、`storage.rs`） | T1 + T2 + T3 + T5 + T6 |
| `tests/contract/longterm*.rs`、`session_state.rs`、`ordinary_error.rs` | 对应 `--test <name>` + T2 同目标 + T9（clippy 编译测试目标） |
| `src/ui/src/**` | T5 + T6（+ T7 若动到 scripts） |
| `tests/unit/ui/**` | T6 |
| `tests/rust/benches/**` | T9（`--all-targets` 会编译 bench）+ T11 |
| `Cargo.toml` / `Cargo.lock` | T0 + `cargo fetch --locked` + T1 + T2 + T9 |
| `package.json` / `package-lock.json` | `npm ci` + T5 + T6 + T7 + T8 |

**硬性下限**：任何 Rust 侧修复后，**至少要跑一次 `--features quicklang-tests/sqlite` 组合**，
否则双后端契约的另一半未被验证 —— 这是 §3.2 的核心价值。

---

## 6. 风险清单

| # | 风险 | 现状证据 | 影响 | 应对 |
|---|---|---|---|---|
| **R1** | **磁盘不足** | `df -h` → **仅剩 20 GiB**，卷已用 **98%**。`build/cargo` **9.6 GiB** + `build/macos/cargo` **4.3 GiB** | T11 bench 需 release profile 全量编译（`build/cargo/release` 现仅 260 MiB）+ 播种 2 万卡/100 万事件数据库 + **756 MB 导出文件**（实测 `build/bench/longterm_bench_1m.md`） | ① 强制 `CARGO_TARGET_DIR=build/macos/cargo`（复用 4.3 GiB 调试缓存），**不开新 target-dir**；② T11 放最后；③ 若剩余 <10 GiB，**先跑 T1–T10，T11 记录跳过原因**；④ **禁止 `make clean`**；⑤ 可清理项：`build/test-databases`（294 MiB，测试残留） |
| **R2** | **seekdb 运行时缺失** | `deps/cache/seekdb-runtime/` 为**空目录** | T4 在跑测试前就 ENOENT 失败；90 个 seekdb 系 `#[ignore]` 无法解除 | §3.4：优先 `make init`（需联网 10–30 min，含 OpenSSL 3 `perl Configure` + `make -j4` 源码编译）；不可用则走 sqlite 组合（方案 B），并在执行报告**明确分列**「sqlite 已验证 / seekdb 未验证」 |
| **R3** | **macOS 静默 SIGKILL** | `scripts/testing/rust-test-runner.mjs` 专门为此存在（重试 2 次） | 未加 `--config runner` 的裸 cargo 会随机失败 | 所有 cargo test 都带 §1.3 的 runner 配置；或直接用 `make test` |
| **R4** | **在途 WIP 让 clippy 挂掉** | `git status`：`tests/rust/benches/`（untracked，`longterm_bench.rs` 93 KB，23:14 仍在写）、`src/crates/storage-common/src/longterm_flags.rs`（untracked，630 行）、`storage-seekdb/src/lib.rs`、`tests/contract/session_state.rs`（已改未提交） | `cargo clippy --all-targets` **会编译 bench 目标**（`cargo test` 不会），未完成的 bench 可能编译失败 → T9 整段红 | **收尾第一步先收齐 #55-A/#55-B 的 WIP 并提交**，再开始全量；或在跑 T9 前用 `git status --porcelain` 确认工作区无 untracked `tests/rust/benches/` |
| **R5** | **全量 vitest 内存 / stderr 钩子** | 81 个 vitest 文件；`onConsoleLog` 遇 stderr 即 throw | 单个文件泄漏 console.error 会让整个 run 失败，且报错信息不直观 | 跑 T6 时保留完整输出；失败先 `npx vitest run --config tests/vitest.config.ts <单个文件>` 定位到文件；内存不足时 `--pool=forks --poolOptions.forks.maxForks=4`（**不要**改 `onConsoleLog`） |
| **R6** | **iOS 工具链缺失** | `make test-apple` 需要 Xcode + `make ios-init` + simulator 构建；`rust-toolchain.toml` 注释提到 swift-rs 需要 `llvm-objcopy`（Xcode 27） | `make test-apple` 可能整段失败 | **本次全量不跑 `make test-apple`**（收尾范围是 §2 表的 T0–T11）。若用户要求 iOS 验证，单独立项：先 `xcodebuild -version` + `xcrun --find swiftc` 探测，再 `make ios-init` |
| **R7** | **CI 与本机差异** | `.github/workflows/ci.yml` 在 `xcode-27` runner 上依次跑 `make init` → `npm audit --audit-level=high` → `make test` → `make test-coverage` → `make test-coverage-db` → `make docs-build` → `make build` → `make review` | 本机缺：`npm audit`、`make test-coverage`/`test-coverage-db`（需 `cargo install cargo-llvm-cov --version 0.9.1 --locked`）、`make docs-build`、`make build`、`make review`；本机多出：`make test-db`（CI 用 coverage-db 变体） | §4.1 判定表已把 CI 等价项单列。**收尾报告必须写明「哪些 CI 步骤本机未跑」**，不得笼统写「CI 通过」。`make review`（license + `git diff --check` + clippy + typecheck）本地可跑且低成本，建议跑 |
| **R8** | **`--offline` 撞新依赖** | 本分支已改过 `Cargo.lock`（`2587eacf`） | 任一新 crate → 立即失败 | 见到 `failed to select a version` 就先 `cargo fetch --locked`（或 `make init`），**不要**去掉 `--offline` 或 `--locked` |
| **R9** | **cargo 编译锁 / 并发** | `AGENTS.md:12` 明令串行 | 并发 cargo 互相阻塞，可能被误判为挂死 | §2.1 的四时段方案；`Blocking waiting for file lock` 出现时**停掉另一个 cargo**，不删锁 |
| **R10** | **`cargo fmt` / prettier 互相打架** | `make format` 同时跑 `node scripts/format.mjs` 与 `cargo fmt --all` | 收尾格式化可能改动他人文件 | ⚠️ `scripts/format.mjs` **只收集 `src`/`scripts`/`tests`**（`format.mjs:64`），**不碰 `docs/`**；`cargo fmt --all` 覆盖全部 Rust。`make format` 的写入面 = 全部 Rust + `src/scripts/tests` 的非 Rust 源文件 —— **收尾阶段慎用**，只在明确知道要改哪些文件时跑。全量 `--check` 只判定不写盘 |
| **R11** | **token/费用快照漂移** | 执行报告 §9.3 缺陷 #3：在途会话 token 持续增长；#55-B 单会话缓存读已从 8.9M 涨到 16.3M | 报告数字必然偏小 | §7 清单：全量测试跑完**之后**再重算 SQL，且必须重施 #47 分段 |

---

## 7. 收尾动作清单（全绿之后）

> 顺序不可颠倒：**先确认工作区状态 → 再算费用 → 最后改文档 → 最后确认干净**。

### 7.1 前置：确认没有在途 WIP

```bash
git status --porcelain          # 期望：只有本次要提交的 docs/** 文件
git log --oneline -5            # 确认 #55-A / #55-B 的提交已在 HEAD 之上
```

若仍有 untracked 的 `tests/rust/benches/` 或 `src/crates/storage-common/src/longterm_flags.rs`
→ **先让对应代理收尾提交，再开始 §7.2**（否则费用统计与报告都对不上）。

### 7.2 重算最终 token / 费用（`session_v2`）

数据源：`~/.local/share/opencode/opencode.db`，表 `session_v2`（字段：
`id` / `title` / `model` / `tokens_input` / `tokens_output` / `tokens_cache_read` /
`tokens_cache_write` / `cost` / `time_created` / `parent_id` / `directory`）。

```bash
DB=~/.local/share/opencode/opencode.db

# ① 按模型汇总
sqlite3 "$DB" "
select json_extract(model,'\$.id') m, count(*),
       sum(tokens_input), sum(tokens_output), sum(tokens_cache_read), sum(tokens_cache_write)
from session_v2
where directory like '%issue-45-longterm-learning%'
   or id='ses_efa2c8676ffeLzovoAaaOxodW7'
group by 1 order by 5+6 desc;"

# ② 缓存写是否为 0（定价文档 §5.3 前提）
sqlite3 "$DB" "select count(*) from session_v2 where tokens_cache_write>0;"   # 期望 0

# ③ 每会话归属 + 首末消息时间（不要用 session_v2.time_updated，缺陷 #4）
sqlite3 -separator '|' "$DB" "
select s.title, json_extract(s.model,'\$.id'),
       s.tokens_input, s.tokens_output, s.tokens_cache_read,
       (select datetime(min(time_created)/1000,'unixepoch','localtime')
          from session_message where session_id=s.id),
       (select datetime(max(time_created)/1000,'unixepoch','localtime')
          from session_message where session_id=s.id)
from session_v2 s
where s.directory like '%issue-45-longterm-learning%'
   or s.id='ses_efa2c8676ffeLzovoAaaOxodW7'
   or s.parent_id='ses_efa2c8676ffeLzovoAaaOxodW7'
order by s.time_created;"
```

#### ⚠️ 三个必踩的坑（**执行报告 §9.3 已登记，此处复述**）

1. **#47 的 LongCat / MiMo 分段归属（缺陷 #1）**
   `session_v2.model` **只记录会话的最终模型**。#47 阶段 1（16:07–16:44）实际跑 LongCat，
   16:46 切 MiMo，字段里只有 `mimo-v2.6-flash-free`。直接按 `model` 计费会把 #47
   全部按 MiMo 价算（$0.2083），而正确的分段值是 **LongCat $0.0283 + MiMo $0.1955 = $0.2238**。
   分段基准值（来自看板，`long_learn_execution_report.md` §9.2 ⑤）：

   | 阶段 | 模型 | input | output | cache_read | 费用 |
   |---|---|---:|---:|---:|---:|
   | 阶段 1（16:07–16:44） | LongCat 2.5 | 73,762 | 1,721 | 686,208 | $0.0283 |
   | 阶段 2（16:46–18:04） | MiMo-V2.6-Flash | 744,695 | 99,901 | 22,606,464 | $0.1955 |

   > **17:41 的「收尾 #47」会话创建于切换之后，是纯 MiMo，不可再切** —— 这是聚合中最易出错的一处。

2. **协调主会话不并入子任务合计（缺陷 #2）**
   主会话 `ses_efa2c8676ffeLzovoAaaOxodW7` 的 `model` 最终值是 `space-bunny-free`（Zen Free → $0），
   但 15:31–16:47 实际跑在 MiMo 上（看板曾记 $0.0244）。**与子任务分开列示**，
   不并入 §1.1 合计行。

3. **在途会话 token 持续增长（缺陷 #3）**
   §1 / §2 的数字是 22:55 快照，必然偏小。**必须在全量测试跑完之后重跑上面的 SQL**，
   并且**重新施加第 1 点的分段**。费率版本从 `v2026-10-04-01` 更新为 `v2026-10-XX-02`。

### 7.3 刷新 `docs/design/0.7/long_learn_execution_report.md`

| 刷新点 | 内容 |
|---|---|
| §「待办 2 — 全量测试」 | 填入 §2 表各行的**实际退出码与耗时**；删除整节 |
| §6.1 底部「🏁 全量测试」行 | **唯一权威的通过数**（执行报告 §9.3 缺陷 #5：各代理的定向测试有重叠，**不能求和**） |
| §6.2 `#[ignore]` 数量 | 用 §4.3 的实测值替换：tests/ **84**、src/ **10**、合计 **94**；并更正「tests/ 归零」这个**不可达**的目标为「seekdb 类 90 个归零 + AI live/手工探针 4 个保留」 |
| §6.3 验收判定 | 逐条给出 通过 / 未跑（+原因） / 失败 |
| §0 结论速览 | 6 个数字（Token / 费用 / 提交数 / 子任务完成度） |
| §1 主表 + §1.1 合计 + §2 + §2.1 | §7.2 重算结果（**含 #47 分段**） |
| §5.4 / §7 | 最终 token 列、提交汇总 |
| §9.3 缺陷表 | 逐条标注「已解决 / 仍存在」 |
| §「待最终刷新」 | 全部补齐后**删除该标题行** |
| §「待办 4 — 官网价复核」 | 逐项勾选（LongCat 折扣、MiMo v2.5 下线、Space Bunny 转收费、Ling-3.1-flash、Meta 官方页） |
| §「待办 5 — 遗留裁决」 | 9 项语义分歧逐项标注裁决结果 |

### 7.4 归档看板

- 看板路径：`/Users/longda/work/repo/myself/git.myself/issue45-progress.md`（worktree **外**，**只读**）。
- 把看板的**最终内容**（含时间线、限速台账、替补链、并发策略复盘）整段并入执行报告，
  建议作为新的一节「附录 A：过程看板归档」。
- 归档后**不要删除**看板文件（主控仍需它做 §7.2 的 #47 分段核对）。

### 7.5 确认工作区干净

```bash
git status --porcelain          # 期望为空（或只剩已知的 build/ 忽略项）
git log --oneline origin/main..HEAD | wc -l   # 本地提交数
git diff --shortstat origin/main..HEAD        # 净变更行数（与 §7 的按提交累加口径不同，勿混用，缺陷 #7）
git diff --check                                  # make review 也会跑这条，确认无空白错误
```

`.gitignore` 应已覆盖 `build/`、`node_modules/`、`deps/cache/`；若有泄漏文件**加进 `.gitignore`
而不是删掉**。

### 7.6 🚫 用户说「提交」之前禁止的动作

| 禁止 | 说明 |
|---|---|
| `git push`（任何 refspec，含 `--force`、`--force-with-lease`） | **GitHub 冻结令**。分支必须留在本地 |
| `gh pr create` / `gh pr edit` / `gh pr merge` / `gh pr close` | 同上 |
| `gh issue create` / `gh issue close` / `gh issue comment` | 同上 |
| `gh api`（任何写方法）/ `gh release` / `gh workflow` | 同上 |
| `git push --tags` / 推 `origin/main` | 同上 |
| `git add -A` / `git commit -a` | 会把其他代理的 WIP 扫进来（缺陷 #8 已登记过这个问题） |
| `git stash` / `git checkout -- .` / `git reset --hard` / `git pull` | 会销毁在途成果 |
| 删 `index.lock` | 遇到就**等待重试** |

**正确的终态**：本地 `issue/45-longterm-learning` 分支上有一个干净的收尾提交，
远端零改动，然后**停下等用户明确说「提交」**。

---

## 8. 探测中发现的「意外」（与已有文档/常见认知不符之处）

| # | 意外 | 证据 | 修正 |
|---|---|---|---|
| **E1** | **`deps/cache/seekdb-runtime/` 是空目录** | `ls -la` → `total 0` | `make test-db` 必然在 `--offline-check` 阶段 ENOENT 失败。执行报告「待办 2」假设 `make init` 就能解决——需要联网 + 10–30 min |
| **E2** | **`src/ui` 没有 `test` 脚本** | `src/ui/package.json` 只有 `dev`/`build`/`typecheck`/`predev`/`prebuild` | 执行报告「待办 2」的 `npm --prefix src/ui test` **必然报错**；应写 `npm test` |
| **E3** | **vitest 配置不在根目录** | 配置在 `tests/vitest.config.ts`；`npm test` = `vitest run --config tests/vitest.config.ts` | 裸 `npx vitest run` 会用默认 include，**与 CI 口径不同**，且丢 coverage thresholds |
| **E4** | **bench 包名不是 `quicklang-contract`** | `tests/rust/Cargo.toml` → `name = "quicklang-tests"`；`[[bench]] longterm_bench`，`harness = false` | 执行报告「待办 2」的 `cargo bench -p quicklang-contract --bench longterm_bench` **包名不存在**。正确命令见 `long_learn_benchmarks.md` §8：`cargo bench -p quicklang-tests --features sqlite --bench longterm_bench` |
| **E5** | **bench 文件里没有真实 `#[ignore]`** | `tests/rust/benches/longterm_bench.rs` 只有第 55、2178 行**文档注释**提到 `#[ignore]` | 执行报告「待办 1」#55-B 行「解除 benches 的 2 个 `#[ignore]`」**无对象** |
| **E6** | **`#[ignore]` 数不是 87，是 84（tests/）/ 94（合计）** | `grep -rnE '^[[:space:]]*#\[ignore'` | 87 是把注释里的提及算进去了。**且「tests/ 归零」不可达**——4 个 AI live / 手工探针与 seekdb 无关 |
| **E7** | **`.cargo/config.toml` 的 `target-dir` 是 `build/cargo`，不是 `build/macos/cargo`** | `.cargo/config.toml:2` vs `scripts/build-layout.mjs:12-16` | 裸 cargo 不 export 就用 9.3 GiB 的另一套缓存，**13.6 GiB 缓存有一半用不上** |
| **E8** | **`src/app` 不在 `default-members`** | `Cargo.toml:4` → `default-members = ["src/crates/*", "src/server", "tests/rust"]` | 裸 `cargo test`（无 `--workspace`）**会漏掉 `quicklang-app` 的全部测试**（含 6 个 `#[ignore]` 的 storage/coach/speech） |
| **E9** | **sqlite feature 会 `cfg` 编译掉那 82 个 `#[ignore]`** | `tests/contract/longterm.rs:1560-1593` 的 `#[cfg(not(feature="sqlite"))] + #[test] + #[ignore]` 成对结构；`storage-seekdb/src/lib.rs:32-71` | 「解除 `#[ignore]`」的**真正机制是 `make init` + `make test-db --ignored`**，不是删属性；而 sqlite 组合让**对偶用例真实运行**，是无运行时环境下最强的验证 |
| **E10** | **磁盘只剩 20 GiB（98% 占用）** | `df -h .` | T11 bench（release 全量编译 + 756 MB 导出）必须放最后并预留空间 |
| **E11** | **`cargo test` 不编译 benches，但 `cargo clippy --all-targets` 会** | Cargo 目标选择规则 | 未完成的 `tests/rust/benches/longterm_bench.rs`（untracked，23:14 仍在写）会让 **T9 整段红** |
| **E12** | **`make test-db` 存在，但 CI 不跑它** | `Makefile:2` 有 `test-db`；`ci.yml` 跑的是 `make test-coverage-db` | 本机 T4 与 CI 覆盖**不完全等价**，报告要写明 |
| **E13** | **CI 还跑 5 件本机默认不跑的事** | `ci.yml:23-29`：`npm audit`、`make test-coverage`、`make test-coverage-db`、`make docs-build`、`make build` | 「全量通过」不等于「CI 通过」，报告要分列 |
| **E14** | **`make test` 里 `npm run test:ai` 在本机会自动 SKIP 而非 FAIL** | `tests/integration/ai-models.test.mjs:14` 的 `skip:`；`native-ai-models.mjs:34-37` 的 `continue` | `make test` 可以完整跑通，AI live 测试不算失败 |
| **E15** | **vitest 有「stderr 即抛错」的钩子** | `tests/vitest.config.ts` 的 `onConsoleLog` | 任何测试/被测代码往 stderr 写一行 → 整轮失败，且报错不直观。列为 §4.2 的「真失败」 |
| **E16** | **workspace 有 10 个成员** | `ls src/crates/` → 7 个 crate + server + app + tests/rust | 执行报告与本手册的「Rust 全量」都应覆盖当前全部 workspace 成员 |
| **E17** | **`scripts/format.mjs` 不覆盖 `docs/`** | `format.mjs:64` 只收集 `["src","scripts","tests"]` | 本手册与执行报告这类纯 Markdown **既不会被 T8 判失败，也不会被 `make format` 改写** —— 收尾阶段可以放心写文档 |

---

## 9. 变更记录

| 时间 | 内容 |
|---|---|
| 2026-10-04 23:52 CST | 初版。基于 HEAD `85df722b` + 在途 WIP 只读探测写成；**未运行任何测试** |
