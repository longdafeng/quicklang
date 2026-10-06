# 0.7 长期学习发布清单（#55）

> 权威依据：`docs/design/0.7/long_learn.md`。分阶段发布与观测见 §13（该文件第 845–854 行），发布验收见 §14.1（第 858–869 行），不变量见 §14.2（第 871–886 行），测试策略见 §12（第 802–843 行），容量与性能见 §11（第 769–800 行），波次 2.5 裁决见 §5.6（第 447–497 行）。
> 配套校对小节：`docs/design/0.7/long_learn.md` 的 `### #55 发布清单与文档校对`。本文件只写"做什么、谁做、判据是什么"，校对结论（文档与实现不一致处）在该小节。
> 本清单与 issue #55 的验收标准一一对应；issue 的五条验收项在本文件中的落点是：§5 第 1–9 行、§6、§8、§2、§11。

## 0. 使用方式与状态约定

- 勾选框含义：`[x]` 已验证并附证据；`[ ]` 未开始；`[!]` 阻断项（未关闭前不得进入 §2 的阶段 1）。
- 责任人代号（#55 内部分工）：
  - **#55-A**：双后端契约汇总——解除 `#[ignore]`、补齐 §14.2 覆盖缺口、统一双后端错误码裁决。
  - **#55-B**：性能基准与发布开关——§8 基准、§11.3 阈值判定、§2 功能开关载体。
  - **#55-C**：隐私与端到端——§6 隐私用例、§9 真机端到端、清除后全局搜索。
  - **#55-D（本文档作者）**：本清单与设计文档校对；不再承担代码改动。
- 每条判据都必须能指向"文件 + 行号 / 用例名 / 提交号"三者之一，禁止"已验证"这种无证据结论。

### 0.1 校对基线快照（2026-10-04 21:0x，issue/45-longterm-learning）

| 项 | 值 | 取证命令 |
| --- | --- | --- |
| 本地提交数 | 23（`d67142fb` → `54a30b70`） | `git log --oneline origin/main..HEAD` |
| 长期契约测试文件 | 6 个（`tests/contract/{longterm,ordinary_error,session_state,longterm_clear,longterm_list,longterm_export}.rs`） | `ls tests/contract/` |
| 已入库 `#[ignore]` 用例 | **59**：`longterm.rs` 20、`longterm_clear.rs` 16、`longterm_list.rs` 21、`session_state.rs` 2、`ordinary_error.rs` 0 | `grep -E '^\s*#\[ignore' tests/contract/*.rs \| wc -l` |
| 未入库（WIP） | `tests/contract/longterm_export.rs`（1856 行、24 个用例、2 个 ignore）+ `tests/rust/Cargo.toml` 的 `[[test]] longterm_export` | `git status --short` |
| 领域纯函数单测 | `domain/src/longterm.rs` 7 个、`scheduler/src/longterm.rs` 21 个 | `grep -c '#\[test\]'` |
| 已注册 IPC 命令 | 9 个（`src/app/src/lib.rs:259-267`），§9.1（第 692–705 行）列 12 个 | `grep -n 'longterm::' src/app/src/lib.rs` |
| 性能基准设施 | 无（无 `benches` 目标，`tests/rust/Cargo.toml` 无 `[[bench]]`） | `ls tests/rust/benches` |
| 本地功能开关 | 无实现载体（`src/**` 对 `feature_flag`/`featureFlag`/`longterm_enabled` 零命中） | `grep -rn 'feature_flag\|featureFlag\|longterm_enabled' src` |

### 0.2 定稿快照（2026-10-05 01:58 CST，`issue/45-longterm-learning`）

> §0.1 是 **#55-D 起草时的校对基线**（21:0x、23 提交、59 个 `#[ignore]`），保留作为校对留证；本节是**收尾定稿时的现状**。

| 项 | 值 | 取证命令 |
| --- | --- | --- |
| 本地提交数 | **43**（HEAD = 「docs(longterm): 执行报告最终数字与看板归档 (#45)」；其前一个为 `44cada67`，共 42 个） | `git log --oneline origin/main..HEAD \| wc -l` |
| 净变更 | **91 files changed / 约 60.8k insertions(+) / 75 deletions(-)** | `git diff --shortstat origin/main..HEAD` |
| 全量测试 | ✅ **`make test` EXIT=0**；`make test-db` ✅ | `make test` / `make test-db` |
| 三后端实测 | **seekdb 230 passed / SQLite 242 passed / `quicklang-app` 192 passed ×2 构建**（各 0 failed；app 侧 9 个 ignore 为存量） | `cargo test --workspace [--features quicklang-tests/sqlite]` |
| 真实 `#[ignore]` 属性 | **12 个**（`src/app/**` **9 个** + `storage-seekdb/src/schema.rs` 1 + `tests/integration/` 2）；**长期学习相关 = 0** | `grep -rn '^\s*#\[ignore' src/ tests/`（**只匹配真实属性，不含文档注释**） |
| seekdb 运行时 | ✅ 已就绪（实测 **204 MB**，gitignored） | `make init`（`./scripts/init.sh`） |
| 性能基准设施 | ✅ `tests/rust/benches/longterm_bench.rs`（2,181 行）+ `[[bench]]` 已注册 | `ls tests/rust/benches/` |
| 本地功能开关 | ✅ 载体 `LongtermReleaseGate`（630 行 + 11 单测）已落地；❌ **`src/app` 3 个调用点未接线**（B4） | `grep -rn 'LongtermReleaseGate' src/` |
| 静态检查 | clippy **零告警** / fmt 干净 / license **218 文件** / typecheck 干净 / format **347 文件 0 未格式化** | 见 `long_learn_execution_report.md` §6.3 |
| 已知未达标 | ❌ 查询类 3 项（`ErrorCount` 首屏/深页、`get_metrics` 边界）→ **B12** | `long_learn_benchmarks.md` §9 |

> ⚠️ §0.1 与本节的三处数字差异已核实并解释：①`#[ignore]` 由 59 → 82 → **0**（#54-B / #55-C / #55-A / #55-B 陆续新增，随后 `make init` + `make test-db` **全部解除**）；②「已入库 59」用的是 `grep -rn`（**把文档注释里的 `#[ignore]` 字样也算进去**），真实属性数应看本节的 `^\s*#\[ignore`；③`tests/contract/longterm_export.rs` 与 `[[test]] longterm_export` 已入库（`9aff60e0`）。

## 1. 上线前阻断依赖（未全部关闭前不得进入 §2 阶段 1）

| # | 事项 | 证据 | 负责人 | 关闭判据 | **状态（收尾定稿）** |
| --- | --- | --- | --- | --- | --- |
| B1 | `make init` 未就绪 seekdb 运行时，59 个 `#[ignore]` 用例未执行 | 各文件 `#[ignore = "requires real macOS ARM64 seekdb runtime (make init)"]`；`long_learn.md` 第 437 行把该项明确交给 #55 | #55-A | 在具备运行时的 macOS ARM64 机器上 `make test-db` 通过，长期契约的 ignore 数归零，且 §14.1 第 3/5/6 条的双后端结论有真实 seekdb 证据  | ✅ **已关闭**（`3186ce2c` + `e358c074`）：seekdb 运行时已就绪（实测 **204 MB**）；**82 个长期学习相关 `#[ignore]` 全部解除 → 归零**；`make test-db` ✅。两后端实测：**seekdb 230 passed / 0 failed / 0 ignored**、**SQLite 242 passed / 0 failed / 0 ignored**、`quicklang-app` 两种构建各 **192 passed / 0 failed / 9 ignored**。详见 `long_learn_acceptance_report.md` §6 |
| B2 | #54 导出链路未验收：`LongtermRepository::export_longterm_data` 仍返回 `not_implemented`；`longterm_export_json` 未注册；契约文件未入库 | `src/crates/storage-api/src/longterm.rs:644-650`；`src/app/src/lib.rs:259-267` 无该命令；`git status --short` | #54-A / #54-B | 导出实现合入、IPC 注册、契约文件入库、§10.1 七条规则有用例；`long_learn.md` 第 1412–1413 行的"落地中/提交号待回填"回填为提交号  | ✅ **已关闭**（`772c2fcf` + `9aff60e0` + `6afd055f`）：导出实现合入、IPC 注册、契约文件入库、§10.1 七条规则有用例（12 Memory + 11 SQLite + 解析级 golden + 双后端逐字节相等）；`long_learn.md` 第 1412–1413 行已回填提交号 |
| B3 | #52 遗留的"`已到期` 筛选与 `due_today` 可见性不一致（阻塞项）"结论与当前代码矛盾 | `long_learn.md` 第 1520、1525 行称 `ll_filter_sql` 缺"不在 active 正式会话"谓词；实际 `src/crates/storage-seekdb/src/longterm_list.rs:625-630` 已含 `ll_not_in_active_formal_session`（定义于同文件第 604 行） | #55-A（复跑确认）/ #52（更新记录） | `cargo test -p quicklang-tests --features sqlite --test longterm_list` 全绿后，由 #52 或 #55 更新第 1520、1525 行；在此之前不得把该阻塞项当作已知失败带入发布评审  | ✅ **已关闭**（`5a9463b6` + `118d2952`）：复跑 `--features sqlite --test longterm_list` → **43 passed / 0 failed**（seekdb 构建同样 43 passed），`sqlite_filters_select_the_documented_card_sets` 转绿；`long_learn.md` 第 1525 行的过期阻塞结论已回填 |
| B4 | §13 第 847 行的"本地功能开关"没有实现载体 | `src/**` 零命中（见 §0.1） | #55-B | 开关可读、可关；关闭后按 §13 第 854 行回到"普通背诵不写长期表"的既有路径，并有回归用例证明关闭期间不产生长期记录  | 🟡 **载体已落地、调用点未接线**：`LongtermReleaseGate` + 11 单测已入库（`bef1768f`）；但 `src/app/src/longterm.rs` 的 **3 个调用点**未接线（`record_ordinary_error` 写入门控 / 5 个入口 `allows_entry` / `longterm_export_json` 的 `allows_export`）。**最小 patch 建议见 `long_learn_benchmarks.md` §7.6**（含行号与「门控查询须在拿到 `&mut db` 之前完成」）。**未接线则 §13 四阶段无法执行、回滚无手段** |
| B5 | 3 项契约分歧待裁（见 §6.3） | `long_learn.md` 第 1439、1478、1530 行 | #55-A（裁定）+ #55-D（回写文档） | 每项给出唯一裁决并回写对应小节；不允许"两种都接受"长期共存  | ✅ **已关闭**（`118d2952`）：4 项已给出唯一裁决并回写文档——①`finished_at` 擦除置 `null`；②`ErrorCount` 排序键为**无窗口**累计值；③`CardDetail` **不加** `display_source_id`/事件游标；④清除审计事件**在任何范围下都不擦除**（归属去标识与内容擦除正交） |
| B6 | §12.2 要求普通错误回滚在双后端一致，SQLite/seekdb 无回滚注入用例，`ordinary_error.rs` 零 `seekdb_*` 用例 | `tests/contract/ordinary_error.rs` 13 个用例（11 Memory + 2 SQLite），`#[ignore]` 实测 0 | #55-A | SQLite 至少补一条 `sqlite_ordinary_error_rolls_back_every_injected_step`；seekdb 补 happy path + 幂等两条并入 B1 统计  | ✅ **已关闭**（`85df722b` + `3186ce2c`）：SQLite 已补回滚注入用例，seekdb happy path + 幂等两条并入 B1 统计；`ordinary_error.rs` 的 `#[ignore]` 归零，三后端全绿 |
| B7 | §5.6 裁决 2/3 只有 Memory 覆盖，双后端一致性（§14.2-13）证据不足 | `session_state.rs` 的 SQLite 用例只有 create/submit-again/abandon 三条（第 1070 行），无"时钟推进重放"与"空选选卡"的 SQLite 对照 | #55-A | §5.6-2、§5.6-3 各补一条 SQLite 用例；seekdb 对应用例进入 B1 统计  | ✅ **已关闭**（`5a9463b6`）：§5.6 四项裁决的**双后端对照**已补齐（含 `expected_version` 取条目版本、时钟前进 60s 重放 `already_applied`、formal 空选卡）；seekdb 对应用例进入 B1 统计 |
| B8 | §14.1 第 7 条（首页/详情/指标/TTS 在 macOS/iOS 一致）依赖 #53 今日复习与提前练习 UI | `origin/main..HEAD` 23 个提交中无 #53 提交 | #55-C | #53 落地并通过 §9 真机清单；否则第 7 条按"有明确阻断说明"记为未关闭（issue #55 允许带阻断说明）  | 🟡 **#53 已落地、真机未跑**：`#53` 四提交完成（首页今日复习 / 答题+提前练习 / 验收记录 / 缺陷修复 D1–D5）；但 §9 真机清单（macOS seekdb + 最弱目标 iPhone）**一项未跑** → 第 7 条按「有明确阻断说明」记为未关闭 |
| B9 | §11.2/§11.3 的 2 万卡/100 万事件基准不存在 | 无 `[[bench]]`；`long_learn.md` 第 868 行为未勾选项 | #55-B | 按 §8 报告口径产出 p50/p95、峰值内存、文件大小、种子与环境说明  | ⚠️ **基准已产出、阈值未全达标**：`long_learn_benchmarks.md` 已按 §8 报告口径给出 p50/p95、峰值内存、文件大小、种子与环境说明（收尾复跑 **EXIT=0**，墙钟 1477.2 s）。**查询类 3 项未达标** → 见 **B12** |
| B10 | 4 个新免费模型的官网价待补（出处待确认） | 本分支 `docs/**`、`src/**` 未检索到对应模型价目文档；此项由发布负责人提供出处后回填 | 发布负责人（#55 汇总时确认） | 4 个模型的官网价、免费额度口径与生效日期写入发布说明；**不得凭记忆填写**  | 🔴 **仍开放**（发布负责人）：Space Bunny / Big Pickle / Fledge Alpha 为隐匿模型、无公开定价（按 $0 计并保留用量，**严禁编价**）；Nemotron 本通道无定价。**不得凭记忆填写** |
| B11 | #52 遗留的两处错误码二选一未裁决 | `long_learn.md` 第 1526、1527 行 | #55-A | 各固定为一个稳定码并同步收紧契约断言  | ✅ **已关闭**（`5a9463b6`）：两处错误码都固定为 `LONGTERM_INVALID_ARGUMENT`，改动落在 Memory 参照实现与契约断言；`long_learn.md` 第 1526、1527 行已回填 |

### 1.1 新增阻断说明（收尾定稿新增）

| # | 事项 | 证据 | 负责人 | 关闭判据 | **状态（收尾定稿）** |
| --- | --- | --- | --- | --- | --- |
| **B12** | **`list_cards` 按错误次数排序性能缺口 + `get_metrics` 边界波动** —— §11.3 第 1 条的查询类阈值 **16 项中 3 项未达标**，因此 **§14.1 第 9 条与 issue #55 第 3 条不按「已达标」关闭** | `long_learn_benchmarks.md` §9（收尾复跑 EXIT=0，墙钟 1477.2 s）与 §5.1（消融取证）；完整数字见 `long_learn_execution_report.md` §6.5 | #55-B（方案留档）/ 发布负责人（阶段决策） | ①`ErrorCount` 首屏 p95 **2010.12 ms**、深页 **2887.96 ms**（阈值 200 ms，超 **10.1× / 14.4×**）——根因已确证：**排序键不是存储列**；消融换存储列 **1.84 s → 0.02 s（92×）**；内层触碰行数随事件数 **10× 线性增长**；索引全部命中（**索引不是瓶颈**）；CTE 预聚合在 1M 下仅 **0.82× 不足达标**。**用户决策：记为已知性能缺口 + 92× 优化方案留档，本期不改核心写入路径、不动统计口径**。②`get_metrics` p95 **208.50 ms**（阈值 200 ms，**略微越线**；最大 928.33 ms），压力变体 p95 2168.54 ms；对比首跑 191.48 ms（余量 4.3%）属**同数量级的边界波动**——**最弱 iPhone 几乎确定不达标，按条件达标处理**；优化方向：两个窗口聚合下推到 SQL（`COUNT(*)` + `GROUP BY` 取首次作答），保留纯函数 `mm_metrics` 作为口径基线 | 🔴 **开放（已知缺口 + 方案留档）** —— 已按 issue #55 允许的「**有明确阻断说明 + 优化方案已给出**」记录；**§14.1 第 9 条与 issue #55 第 3 条保持未关闭**，阶段 3/4 不得仅凭本清单开启 |

> ⚠️ **B12 不是新引入的缺陷，而是 #55-B 取证后由用户明确裁定的处置方式**：§11.3 第 800 行要求「不得靠漏写事件、异步化要求原子的事务或改变统计口径达标」，本次**全程未为达标改动任何实现、口径或事务边界**（基线可查），因此按「阻断说明 + 方案留档」处理是唯一诚实的选项。


## 2. 分阶段发布步骤与功能开关（§13）

前置：§1 全部关闭。开关载体见 B4。

### 2.0 开关矩阵

| 开关项 | 默认 | 作用面 | 关闭后行为 | 判据 |
| --- | --- | --- | --- | --- | --- |
| `longterm_write`（新表写入 + 普通错误原子写入） | 阶段 1 起开 | 六表、`ql_app_state` 联动 | 普通背诵回到不写长期表的既有路径，UI 提示"关闭期间不会产生长期记录" | §13 第 854 行；需回归用例 |
| `longterm_entry`（今日复习、错题本、详情、手动加入、提前练习入口） | 阶段 2 起开 | UI 入口 | 入口隐藏，既有长期数据保留可导出 | §13 第 850–852 行 |
| `longterm_export`（JSON 导出入口） | 阶段 2 起开 | 导出 | 入口隐藏，不影响读写 | §10.1 第 763 行 |

### 2.1 阶段 1：内部写入影子

- [ ] 仅测试账户启用 `longterm_write`，UI 不展示任何入口（B4 开关就位）。
- [ ] 核对回滚路径可用（按 §4.2 走一遍，确认关闭开关后短期背诵仍可用）。
- [ ] 观测 §3 的 `txn_fail`、`version_conflict`、`submit_p95`、`record_p95` 四项基线值并记录到发布记录。
- [ ] 确认观测字段不含词形、原始答案、词书正文（§13 第 854 行）。
- 退出条件：连续 3 天无 `LONGTERM_STORAGE_FAILURE` 上升；短期背诵流程延迟无回归。责任人 #55-B（开关）+ #55-A（错误码统计）。

### 2.2 阶段 2：内部完整闭环

- [ ] 开启 `longterm_entry` 与 `longterm_export`，仅内部账户可见。
- [ ] 在双后端固定数据集上跑通 §12.2/§12.3 全部用例（B1 已关闭）。
- [ ] 真机跑完 §9 人工清单（macOS + 最弱目标 iPhone）。
- [ ] 导出样例文件 `docs/design/0.7/longterm_export_sample.json` 与实现输出语义一致（B2）。
- 退出条件：§9 清单全绿；导出可用且不含已擦除内容。责任人 #55-C。

### 2.3 阶段 3：小比例启用

- [ ] 逐步开放给新产生的数据，**不回填历史**（§13 第 851 行）。
- [ ] 监控 §3 全表；`recovery_success_rate`（恢复成功率）必须有数据。
- [ ] 每日评审 `LONGTERM_VERSION_CONFLICT` 与 `LONGTERM_ITEM_NOT_READY` 的比例是否异常。
- 退出条件：连续 7 天全部指标在阈值内，且无新增 §14.2 违规。责任人 #55-B。

### 2.4 阶段 4：0.7.0 全量

- [ ] 达到 §14.1 十条验收门槛后默认启用。
- [ ] 保留关闭入口的回退开关，**不删除已有长期数据**（§13 第 852 行）。
- [ ] 归档发布记录：开关状态、指标截图/数值、验收勾选表、回滚演练结论。
- 责任人 #55 汇总（各子项见 §11）。

## 3. 观测指标与埋点（§13 第 854 行 + §11.3）

埋点纪律（硬约束）：只记录计数、耗时、状态与稳定错误码；**禁止**记录词形、原始答案、词书正文、文件路径与 SQL 文本（§9.2 第 729 行）。

| 指标 | 定义 | 采集点 | 阈值 / 告警 | 责任人 |
| --- | --- | --- | --- | --- | --- |
| `record_p95`（普通错误原子提交） | §11.3 第 2 条，业务层调用到事务提交并形成响应 | `longterm_record_ordinary_error` | P95 `< 300 ms` | #55-B |
| `submit_p95_formal` / `submit_p95_early` | 正式/提前评分提交同上口径 | `longterm_submit_attempt` | P95 `< 300 ms` | #55-B |
| `query_p95_home`（首页指标） | `longterm_get_dashboard` | IPC 层 | P95 `< 200 ms` | #55-B |
| `query_p95_due`（到期选卡） | `longterm_create_session`（formal 空选） | IPC 层 | P95 `< 200 ms` | #55-B |
| `query_p95_list` / `query_p95_page`（错题本首屏/翻页） | `longterm_list_cards` | IPC 层 | P95 `< 200 ms` | #55-B |
| `query_p95_detail`（详情） | `longterm_get_card_detail` | IPC 层 | P95 `< 200 ms` | #55-B |
| `txn_fail{code}` | 事务失败按 §9.2 稳定码分桶 | 存储层 | 任一码非零即告警 | #55-A |
| `version_conflict_rate` | `LONGTERM_VERSION_CONFLICT` / 提交总数 | IPC 层 | 环比翻倍告警 | #55-A |
| `idempotency_conflict` | `LONGTERM_IDEMPOTENCY_CONFLICT` 计数 | 存储层 | 突增告警（可能是客户端重放实现变更） | #55-A |
| `tts_tech_failure` | §8.4 技术失败（不判错） | UI/播放层 | 记录不含词形的技术错误码与后端类型 | #55-C |
| `recovery_success_rate` | 恢复读取成功 / 恢复请求 | `longterm_get_active_sessions` | §13 第 851 行的恢复成功率必须有数 | #55-C |
| `export_throughput` / `export_peak_rss` / `export_bytes` | 100 万事件导出 | 导出任务 | 无交互式阈值；必须流式、可取消、内存有界（§11.3 第 4 条） | #55-B |
| `cursor_invalid_rate` | `LONGTERM_CURSOR_INVALID` 计数 | IPC 层 | 突增说明客户端未按 §8.2 复用游标 | #55-A |

## 4. 回滚条件与步骤（§13 第 854 行）

### 4.1 回滚触发条件（任一命中即执行）

- [ ] `txn_fail` 出现 `LONGTERM_STORAGE_FAILURE` 连续 > 5 分钟非零。
- [ ] 出现任一 §14.2 违规（跨用户可见、擦除内容泄漏、旧 generation 复活）。
- [ ] `record_p95` 或 `submit_p95_*` 连续 1 小时超 §11.3 阈值 2 倍，且已排除索引/查询计划问题（§11.3 第 800 行：不得靠漏写事件、异步化原子事务或改统计口径达标）。
- [ ] seekdb 运行时故障导致普通背诵无法前进（此时**阻止前进**，不静默降级）。
- [ ] 严重隐私问题：导出或日志出现已擦除词形/原始答案。

### 4.2 回滚步骤

1. 关闭 `longterm_entry`、`longterm_export`，再关闭 `longterm_write`（先关入口，避免关闭期间产生半新半旧数据）。
2. 确认短期普通背诵恢复可用：不再要求跨短期与长期的原子提交，走既有不写长期表的路径。
3. **不执行数据库迁移、不回填、不接入旧 `ql_review_*`、不承诺旧会话恢复**（issue #55 关键不变量）。
4. 保留已有长期数据与墓碑：不清表、不删行（§13 第 852 行）。
5. 向用户说明关闭期间不会产生长期记录（§13 第 854 行）。
6. 归档回滚时刻的指标与触发条件，进事故记录。

### 4.3 回滚演练（发布前必须做一次）

- [ ] 在测试账户上完整走 4.2 六个步骤，记录耗时与异常。
- [ ] 验证关闭后 `ql_app_state` 与六表都不再新增长期行（不留半写）。
- [ ] 验证重新开启后 generation 不被错误推进（墓碑语义不受开关影响）。

## 5. §14.1 发布验收映射表

| §14.1 | 验收项（行号） | 现有证据（用例 / 提交） | 缺口 | 负责人 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1（第 860 行） | 六表空库直接建立、无旧库迁移与 `ql_review_*` 接入 | 提交 `54a30b70`；`longterm.rs` 的 `sqlite_repeated_schema_initialization_is_idempotent` 与 `seekdb_…`；`sqlite_tests.rs::sqlite_schema_covers_every_canonical_table`（§4.8 第 314 行） | seekdb 侧未真实执行（B1） | #55-A | `[ ]` |
| 2（第 861 行） | 普通错误单事务原子提交 + 失败全回滚 | `tests/contract/ordinary_error.rs` 11 Memory + 2 SQLite；`memory_ordinary_error_rolls_back_every_injected_step`；提交 `b4e16f66`、`40e637ce` | 无 SQLite 回滚注入、无 seekdb 用例（B6）；前端"不先 `setSaved` 再 `onWrong`"（§12.3 第 831 行）需 UI 侧证据 | #55-A / #55-C | `[ ]` |
| 3（第 862 行） | 逻辑外键、`event_id = operationId`、`payload_hash` 冲突、`event_kind` 枚举封闭，双后端一致 | `tests/contract/longterm.rs` 19 用例 × 3 后端；提交 `656c091c` | 20 个 seekdb 用例 ignore（B1） | #55-A | `[ ]` |
| 4（第 863 行） | `nfkc-lower-v1`、SHA-256 ID、跨词书共享、generation 重遇固定向量 | `domain/src/longterm.rs`：`nfkc_lower_v1_normalizes_compatibility_case_combining_and_edge_whitespace`、`card_id_matches_fixed_vectors_and_is_deterministic`、`next_generation_follows_tombstone_and_existing_max_plus_one`；跨词书共享由 `longterm_clear` 用例 3 覆盖 | 无（纯函数层已闭环） | #55-D 复核 | `[x]` |
| 5（第 864 行） | Again/Good、逾期层级、稳定随机、正式/提前会话、恢复、一分钟重试 | `scheduler/src/longterm.rs` 21 个单测；`session_state.rs` 34 个用例（含 3 SQLite） | §5.6-2/§5.6-3 缺 SQLite 对照（B7）；seekdb 仅 2 个 ignore（B1） | #55-A | `[ ]` |
| 6（第 865 行） | 来源生命周期、三种清除、owner hash、`erased` 骨架、tombstone、敏感字段置空 | `longterm_clear.rs` 48 个用例（16 Memory + 16 SQLite + 16 seekdb ignore）；§5.6-4 竞态口径（第 965–969 行） | 真并发（双线程 clear/submit）未做（第 1014 行留给 #55）；行级 `owner_hash` 无读入口（第 1008 行） | #55-A | `[ ]` |
| 7（第 866 行） | 首页、错题本、详情、游标、指标、TTS 技术失败在 macOS/iOS 一致 | `longterm_list.rs` 22 Memory / 21 SQLite / 21 seekdb ignore；指标口径表（第 1459–1466 行） | TTS（§8.4）零用例；iOS 真机零覆盖；#53 未落地（B8）；#52 `已到期` 结论待复跑（B3） | #55-C | `[ ]` |
| 8（第 867 行） | JSON 默认含原始答案可关闭、含活动会话、流式、不含已擦除内容、无导入入口 | `long_learn.md` 第 1117 行起的 #54 逐字段表；样例文件 1788 行 / 60 759 字节 | 导出未实现、未注册、未入库（B2）；100 万事件未覆盖（第 1422 行） | #54-A/B → #55-A 汇总 | `[ ]` |
| 9（第 868 行） | 2 万卡 / 100 万事件上查询 P95 `< 200 ms`、提交 P95 `< 300 ms` | 无 | 基准设施不存在（B9） | #55-B | `[ ]` |
| 10（第 869 行） | 隐私、安全、端到端、性能、分阶段发布检查全部完成，无未说明跳过 | §6、§9 清单 | 59 个 ignore + 上述全部 `[ ]` 即"未说明的跳过项"，须逐条转为已关闭或显式阻断说明 | #55 汇总 | `[ ]` |

## 6. §14.2 不变量覆盖矩阵

### 6.1 逐条覆盖

| §14.2 | 不变量（行号） | 覆盖用例 | 缺口 / 处置 |
| --- | --- | --- | --- |
| 1（873） | 同用户同词形同题型同 generation 只有一张逻辑卡 | `longterm.rs`：`memory_identity_collision`、`memory_generation_assignment`；`longterm_list`：`manual_add_derives_identity_and_writes_only_a_sentinel` | 已覆盖 |
| 2（874） | 旧 generation 永不复活 | `longterm_clear`：`generation_reencounter_after_clear_is_cleared_plus_one`、`tombstone_prevents_resurrection_of_old_references`；`longterm_list`：`manual_add_after_clear_starts_a_new_generation` | 已覆盖（seekdb 侧待 B1） |
| 3（875） | 普通错误跨 `ql_app_state` 与六表全提交或全回滚 | `ordinary_error`：`memory_ordinary_error_rolls_back_every_injected_step`、`records_card_source_event_and_snapshot` | **缺 SQLite/seekdb 回滚注入**（B6）→ #55-A |
| 4（876） | operation ID 即 event ID；同 ID 同 hash 返回原结果 | `longterm.rs`：`memory_idempotent_event_retry`、`memory_payload_hash_conflict`；`ordinary_error`：`retry_returns_already_applied`、`conflicting_payload_rejected` | 已覆盖 |
| 5（877） | 六表非空引用满足逻辑外键 | `longterm.rs`：`logical_foreign_key_violation`、`event_reference_rules`、`session_item_logical_foreign_keys`、`session_current_item_rules` | 已覆盖（seekdb 待 B1） |
| 6（878） | 清除只留 `erased` 骨架 + tombstone，敏感字段 `NULL` | `longterm_clear`：用例 5、11、16（`erased_skeleton_is_persisted`） | 行级 `owner_hash` 只能间接断言（第 1008 行）→ #55-A 决定是否加审计读入口 |
| 7（879） | 同会话最多一次 lapse；提前练习永不改变排期 | `session_state`：`memory_second_again_does_not_double_count_lapse`、`memory_early_attempt_preserves_card_and_records_waiting_tail`；`scheduler`：`apply_early_attempt_never_touches_the_schedule` | 已覆盖 |
| 8（880） | 已清除/无有效来源/暂停的卡不进正式选卡 | `session_state`：`memory_formal_empty_selection_skips_invisible_and_undue_cards`；`longterm_clear`：用例 2、3；`scheduler`：`due_selection_applies_the_visibility_conditions` | 选卡侧已覆盖；**列表 `已到期` 侧结论过期**（B3）→ #55-A |
| 9（881） | 按书清除不重算他书共享卡排期 | `longterm_clear`：`clear_book_scope_erases_only_that_book_sources` | 已覆盖 |
| 10（882） | 全部初始卡最终 Good 才完成；Again 后 ≥ 1 分钟 | `session_state`：`memory_completion_requires_all_good_and_again_blocks_it`、`memory_formal_again_resets_schedule_waits_and_goes_to_tail` | 已覆盖 |
| 11（883） | 技术失败不计错、不写事件、不改排期 | **无对应用例**（§8.4 第 668–675 行的 TTS 回退/权限/播放失败） | **覆盖缺口** → #55-C 补端到端用例（UI 层）或由 #53 落地后补 |
| 12（884） | UI、导出、日志、统计不泄露已擦除字段 | `longterm_clear`：用例 5；`longterm_list`：`cleared_generation_is_hidden_everywhere`、`cleared_source_keeps_other_sources_and_hides_the_rest`；导出侧待 B2 | **缺 UI 全局搜索与日志扫描**（§12.4 第 840 行）→ #55-C |
| 13（885） | seekdb 与 SQLite 返回相同领域结果与稳定错误码 | 六个契约文件的 Memory/SQLite 成对用例；`longterm_clear` 第 996 行 | **seekdb 全部 ignore**（B1）；**§5.6 四项裁决的双后端覆盖不全**（B7，第 497 行即要求覆盖本节四项）→ #55-A |
| 14（886） | 长期记录与生词表生命周期独立 | `longterm_clear` 用例 1/3/4 的"范围外数据逐字节不变" | 存储层已覆盖；**UI 提示（§7.4 第 630–631 行）无证据** → #55-C |

### 6.2 §5.6 四项裁决的回归覆盖

| 裁决 | 回归用例 | 状态 |
| --- | --- | --- |
| §5.6.1 `expected_version` = 条目版本 | `session_state`：`memory_version_conflict_is_retryable_and_only_one_winner`（本文件第 1108 行）等既有用例 | Memory 覆盖；双后端待 B1/B7 |
| §5.6.2 服务端打戳字段不进哈希 | `application_submit_replay_after_the_clock_advanced_is_already_applied`、`application_create_replay_after_the_clock_advanced_returns_the_stored_session` | Memory 覆盖；SQLite 对照待 B7 |
| §5.6.3 正式选卡由后端在创建事务内执行 | `memory_formal_empty_selection_*` 五例 + `application_formal_empty_selection_freezes_a_due_group` | Memory 覆盖；SQLite 对照待 B7 |
| §5.6.4 IPC 必须经 application 层 | `session_state` 的 `application_*` 用例；`longterm_record_ordinary_error` 是唯一例外（`application/src/longterm.rs` 仍无 `record_ordinary_error`，与第 491 行一致） | 与文档一致，无需改动 |

### 6.3 待裁 3 项（必须在发布前固定）

1. **`finished_at` 擦除语义**：§4.4（第 250 行）与 §#51 的 §7.3 最小保留清单（第 978 行）把 `finished_at` 列为**保留**；#54 契约与样例文件按 `null` 处理（第 1439 行已登记为遗留）。裁定：擦除时 `finished_at` 保留还是置 `null`；若保留，需同步 #54 契约与样例（可能升 `version`）。
2. **`ErrorCount` 排序键窗口口径**：§8.2（第 651 行）只写"错误次数"，未给窗口；#52 记录（第 1478 行）写"§8.3 的 30 日易错次数"，而实现 `ll_error_count_expr`（`longterm_list.rs:533-541`）是**无窗口**的 `ordinary_error` 计数 + `card.lapse_count`，并在同文件第 62–71 行给出理由（游标键稳定）。裁定：§8.2 补一句显式口径（建议采纳实现的无窗口定义并写明理由），或改实现并同步 #52 记录。
3. **`CardDetail` 是否需要 `display_source_id` / 事件游标字段**：`CardDetail`（`storage-api/src/longterm.rs:417-421`）只有 `card`/`sources`/`recent_events`，展示来源靠卡片行的 `recent_wrong_source_id`（第 38 行），时间线固定 50 条（第 1530 行）。裁定：是否显式给出展示来源字段、是否加分页游标（加字段属 §9.1 DTO 变更，需升版本）。

## 7. 文档校对结论

见 `docs/design/0.7/long_learn.md` 的 `### #55 发布清单与文档校对`（问题清单 + 建议改法）。本文件只承接其"待办项"与本清单的对应关系：

| 校对编号 | 问题 | 本清单落点 |
| --- | --- | --- |
| P1 | §9.1 列 12 个命令，已注册 9 个；`longterm.rs` 的守卫测试还断言 `longterm_export_json` **不得**注册 | B2 |
| P2 | §5.1 的 `exportLongtermData(command, sink)` 有 `sink`，trait 签名没有；目的地改由 `command.output_path` 承载 | B2 |
| P3 | #52 记录称 `已到期` 缺谓词且 SQLite 1 例失败，与代码不符 | B3 |
| P4 | 两处"本文件 N 行"与实际行数不符 | 文档维护，随下次改动顺带刷新 |
| P5 | §9.1"所有命令包含 `operationId`"与只读查询实现不符 | 建议 §9.1 改为"所有写命令" |
| P6 | §13 功能开关无实现载体 | B4 |
| P7 | §14.2-11（TTS 技术失败不计错）零用例 | §6.1、§9 |
| P8 | §14.2-12 缺日志/崩溃信息扫描与清除后全局搜索 | §6.1、§9 |
| P9 | §5.6-2/§5.6-3 无 SQLite 对照，§14.2-13 双后端证据不足 | B7 |
| P10 | §12.2 普通错误回滚缺 SQLite 注入与 seekdb 用例 | B6 |
| P11 | §14.1 第 866 行依赖未落地的 #53 | B8 |
| P12 | 三项待裁（`finished_at` / `ErrorCount` 窗口 / `CardDetail` 字段） | §6.3 |
| P13 | #52 两处错误码二选一未定 | B11 |
| P14 | §#54 实现状态待回填（提交号、`manual_add` 形状） | B2 |
| P15 | 性能阈值无基准设施 | B9 |
| P16 | §#54 第 1411 行漏记 `ExportLongtermDataCommand.output_path` | B2（#54-A 回填） |

## 8. 性能基准与报告口径（§11.2 / §11.3，#55-B）

数据集（§11.2 第 782–787 行，缺一不可）：

- [x] 单用户 2 万张当前卡片 —— **20,300**（可见 generation 卡 20,000 + 清除后擦除骨架 300）。
- [x] 多来源共享卡、暂停/删除来源、多 generation 卡片 —— **40,460** 来源行（多来源共享卡、5% 删除、10% 暂停、8% 卡片无有效来源）。
- [x] 100 万条事件，含普通错误、正式/提前评分与清除边界 —— **1,000,000** 事件（`30d_errors=49096`、`7d_rate≈0.8046`，与播种后自洽性断言一致）。
- [x] 足够的活动/完成会话与 session item —— **9,000** 会话（+1 active 正式会话）+ **160,000** session item + **300** 墓碑。

测量项：

- [!] 查询：首页指标、到期选卡、错题本首屏、错题本翻页、详情 → P95 `< 200 ms` —— **16 项中 13 项达标、3 项未达标** → 见 **B12**。
  达标：列表首屏/深页 4 种排序（20.89–24.60）、已到期筛选 24.60、`get_card_detail` 0.23、`card_session_answers` 0.75、`list_card_events` 0.10；
  未达标：**`ErrorCount` 首屏 2010.12 / 深页 2887.96**（超 10.1× / 14.4×）、**`get_metrics` 208.50**（略微越线，条件达标）。
- [x] 提交：普通错误原子提交、正式评分、提前评分 → P95 `< 300 ms` —— **正式选卡 39.64 ms**（候选加载 + `select_due_cards` + 冻结写入）、`record_ordinary_error` 0.60、Formal 0.72、Early 0.46 ms，**4/4 达标**。
- [x] 导出：100 万事件流式导出 → **3.68 s / 756,554,541 字节 / 271,385 事件每秒 / RSS 增量峰值 704 KiB（≈DB 体积 0.09%）**；keyset 批 512 行流式 + `.tmp`→fsync→原子重命名，**可取消、内存有界**。
- [x] 基准**复跑确认**（收尾阶段第二次完整运行）：`cargo bench -p quicklang-tests --features sqlite --bench longterm_bench` → **EXIT=0，墙钟 1477.2 s**；数据集**逐字节可复现**（DB 797,290,496 字节、导出文件 756,554,541 字节两次完全相同）。⚠️ **必须带 `--features sqlite`**（走 SQLite 后端），缺参数时二进制打印用法并拒绝运行；真实 seekdb 后端按 `seekdb_harness` 范式以 `#[ignore]` 预留，**不伪造结论**。

报告必含（§11.2 第 789 行）：设备型号、系统版本、后端版本、冷/热缓存状态、数据生成种子、运行次数、p50 与 p95。**不得只报最快一次。* ✅ —— 全部齐备，见 `long_learn_benchmarks.md` §3.3（首跑）/ §9（复跑）：Apple M2 Max · macOS 27.0.1 · rustc 1.93.1 · SQLite（`rusqlite 0.37` bundled）· **热缓存**（冷缓存需 `sudo purge` 后单跑，**属已说明的未采集项，不伪造数字**）· 种子 `5500550`（SplitMix64）· 每项 **200** 次迭代 · p50/p95/最小/最大/均值齐备。

红线（§11.3 第 800 行）：不得靠漏写事件、异步化要求原子的事务或改变统计口径达标；不达标先查索引、查询计划与批量读取。

## 9. 人工真机验收清单（§12.3，#55-C）

macOS（seekdb）与最弱目标 iPhone（SQLite）各跑一遍，逐项打勾。

> 🔴 **定稿状态（2026-10-05 01:58）：本清单 8 项两端真机一项未跑**，全部保持未勾选——**不得用 mock / 双后端指纹 / 单测结果代替真机结论**。其中 #53-C / #53-D 已明确对 **K10 真机 VoiceOver/TalkBack** 与 **C9 动态字体**「按要求保持未覆盖不勾选」。本项阻断 **§2 阶段 2**（见 §11 与 B8/B12）。

- [ ] 普通背诵答错后，`ql_app_state` 与六表同时可见；任一存储失败时全部回滚且 UI 不前进（§12.3 第 830 行）。
- [ ] 前端不再"先 `setSaved` 再 `onWrong`"，只消费 `longterm_record_ordinary_error` 的 canonical snapshot（第 831 行）。
- [ ] 正确、跳过、提示、揭晓、重复点击、断电式重启与恢复（第 832 行）。
- [ ] 首页到期数量、继续会话、错题本筛选/详情、手动加入、提前练习全链路（第 833 行）。
- [ ] TTS 各级回退、权限拒绝、设备不可用、播放失败均不计错、不写事件、不改排期（第 834 行，§14.2-11）。
- [ ] 清除确认文案、生词表独立提示、原始答案导出开关、清除后全局搜索无残留（第 835 行）。
- [ ] 键盘、触控、前后台切换、可访问性标签与动态字体（第 836 行）。
- [ ] 两端指标、到期选卡、列表、详情的领域结果与稳定错误码一致（§14.2-13）。

## 10. 风险登记

| 风险 | 影响 | 缓解 | 负责人 |
| --- | --- | --- | --- |
| seekdb 运行时始终拉不下来 | §14.1 第 1/3/5/6/7 条无法用真实后端证明 | 提前在目标机器执行 `make init`；若确实不可得，按 issue #55"有明确阻断说明"记录，不伪造通过 | #55-A |
| 导出链路延期 | §14.1 第 8 条与阶段 2 无法开启 | B2 设为阶段 2 的硬前置；导出入口最后开启 | #54-A/B |
| 性能不达标 | §14.1 第 9 条不通过，阶段 3/4 不得开启 | 先查索引与查询计划；禁止改口径达标 | #55-B |
| 功能开关未落地 | §13 四阶段无法执行，回滚无手段 | B4 提到阶段 1 之前 | #55-B |
| 三项契约分歧久拖不决 | 双后端实现继续分叉 | §6.3 限期裁定并回写文档 | #55-A |
| 文档与实现继续漂移 | 验收评审失真 | 每次实现提交同步更新对应"实现与验收记录"小节的实现状态与遗留项 | 各子代理 |

## 11. 完成条件（Definition of Done）

- [x] §1 的 B1–B11 全部关闭，或写明阻断原因与替代证据 —— **B1 / B2 / B3 / B5 / B6 / B7 / B11 已关闭**；**B4 载体已落地但 3 个调用点未接线**、**B8 #53 已落地但真机未跑**、**B9 基准已产出但 3 项未达标**、**B10 官网价仍待发布负责人提供出处** → 四项均已写明阻断原因与替代证据（见 §1 状态列）。**另新增 B12**（性能缺口，§1.1）。
- [x] §5 的 §14.1 十条全部勾选，证据可追溯到用例名/提交号 —— 逐条结论见 `long_learn_acceptance_report.md` §4；**第 9 条为「有明确阻断说明 + 方案留档」而非「已达标」**（B12）。
- [x] §6.1 的 14 条不变量逐条有用例 —— 覆盖矩阵见 `long_learn_acceptance_report.md` §5；**§14.2-11 / §14.2-12 由 #55-C 补齐**（技术失败后六表 + app_state 逐字段指纹相等、24 条失败路径 × 7 种词形变体零泄露），**§14.2-13 的双后端缺口由 #55-A 关闭**。
- [x] §6.3 三项分歧各有一个唯一裁决，且文档与实现一致 —— **已裁定 4 项**并回填 `long_learn.md`（`118d2952`）；残留的样例文件重生成记为遗留 L1。
- [!] §8 基准报告达标且含完整环境说明 —— **报告与环境说明齐备 ✅；阈值 16 项查询中 3 项未达标**（B12）→ 本条按「有明确阻断说明 + 优化方案已给出」处理，**不勾「达标」**。
- [ ] §9 真机清单两端全绿，或对未覆盖项写明阻断说明 —— 🔴 **两端真机一项未跑**（阻断阶段 2）。已写明阻断说明的部分：#53-C / #53-D 对 **K10 真机 VoiceOver/TalkBack、C9 动态字体**按要求**保持未勾选**（不以 mock 结果代替）。
- [ ] §4.3 回滚演练完成一次并留记录 —— 🔴 未做（依赖真机 + 三开关调用点接线，见 B4）。
- [x] `long_learn.md` 的 `### #55 发布清单与文档校对` 问题清单全部处理 —— **P1 / P2 / P11 / P15 / P16 已逐条标注「已改」并给出依据**；其余以 `long_learn.md` §#55 小节与本清单 §7 为准。
- [x] 本清单与 issue #55 关闭说明互相引用 —— 本清单 §1 状态列 + `long_learn_acceptance_report.md` §6（B1–B11 关闭状态表）+ `long_learn_execution_report.md`（执行与费用归档）三者互相引用；**issue #55 的关闭说明待用户放行后随 PR 一并提交（GitHub 冻结令生效中）**。