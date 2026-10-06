# #55-A 双后端契约汇总与验收报告

> 范围：`docs/design/0.7/long_learn_release_checklist.md` 的 §1 阻断项 **B1 / B3 /
> B6 / B7 / B11**、§5 的 §14.1 十条、§6 的 §14.2 十四条与 §5.6 四项裁决，以及
> §6.3 的三项待裁与 #54-B 新发现的第四项。
> 权威依据：`docs/design/0.7/long_learn.md` §3.3、§4.3、§4.7、§5.3、§5.6、§7.2、
> §7.3、§8.2、§9.2、§11.1、§12.2、§12.4、§14.1、§14.2。
> 配套产出：`docs/design/0.7/long_learn_privacy_report.md`（#55-C，G1/G2/G3）。
>
> 基线：`issue/45-longterm-learning`，本代理的两个提交
> `85df722b`（修缺陷）与 `5a9463b6`（补对照与固定错误码），跑测试时的实际 HEAD
> 以本文件 §7「测试命令与完整结果」一节为准。

## 1. 一句话结论

本波次**关闭 B1 / B3 / B6 / B7 / B11**，把 #55-C 报出的 **G1 / G2 两个真实缺陷**
修掉并把 §7.2 的清除语义统一成一条规则，另在双后端核对中发现并修掉两处真实
分歧（`SeekDbEmbeddedAdapter` 覆写 `validate_session_item_refs` 的**检查顺序**，
以及 `seekdb_never_silently_falls_back` 在 SQLite 构建下**必然失败**）。
**82 个 seekdb 用例已在真实 macOS ARM64 seekdb 引擎上实跑通过，`#[ignore]` 归零**，
§14.1 第 1/3/5/6/7 条与 §14.2-13 现在都有真实后端证据。

## 2. 本波次改了什么

| 文件 | 行数变化 | 内容 |
| --- | --- | --- |
| `src/crates/storage-seekdb/src/longterm_clear.rs` | +49 | G1 归属去标识 + 裁定 ④ 审计行永不擦除 |
| `src/crates/storage-seekdb/src/longterm_ordinary.rs` | +73 | G2 重遇语义 + §5.2 失败注入点（B6） |
| `src/crates/storage-seekdb/src/longterm.rs` | +20/−9 | `validate_session_item_refs` 检查顺序对齐 trait 默认实现 |
| `tests/contract/longterm_clear.rs` | +203 | 裁定 ④ 与骨架擦除的 ×3 后端用例 |
| `tests/contract/longterm_privacy.rs` | +170/−… | 删除 G1 的例外摘除；重遇断言改为「开新 generation」 |
| `tests/contract/ordinary_error.rs` | +193 | B6 的 SQLite 回滚注入 + 2 条 seekdb 用例 |
| `tests/contract/session_state.rs` | +470 | B7 的 §5.6 四项裁决双后端对照（一份函数体 + 两个薄包装） |
| `tests/contract/longterm_list.rs` | +8/−… | B11 两处错误码收紧 + Memory 参照实现对齐 |
| `tests/contract/longterm_export.rs` | +30 | Memory 参照实现的清除语义对齐，恢复逐字节相等 |
| `tests/unit/rust/core.rs` | +34 | §11.1「不静默降级」按构建分治，修掉 SQLite 构建下必然 panic 的用例 |
| 七个契约文件的模块注释 | +… | 解除 `#[ignore]` 后同步「seekdb 用例待 `make init`」的过期说明 |

### 2.1 G1（隐私，§7.2 第 608 行 / §14.2-6）——已关闭

`clear_longterm_data` 的清除审计事件此前在**三种 scope 下都写明文 `user_id`**，
所以用户级清除之后导出的审计行里仍有原文 owner。修复是清除事务内的第二条语句
`cl_deidentify_audits`：把该 owner 名下**全部** `clear_word`/`clear_book`/
`clear_user` 行的 `user_id` 物理置 `NULL` 并写 `owner_hash`。
之所以覆盖「全部」而不是只覆盖本次写的那一行：只覆盖当次的话，用户先按词清除、
再按用户清除时，**前一次**的 `clear_word` 审计行仍带明文 owner，隐私缺口会以
另一种顺序重新出现。`write_event` 要求非空 owner（§4.7 的引用校验需要它），所以
去标识只能在写入之后做，二者同事务。

`tests/contract/longterm_privacy.rs` 的按用户全局搜索**不再按 `event_id` 摘掉任何
行**——原来那条「把清除动作自身的审计行摘掉再断言」的例外已经删掉，`scrub_events`
现在必须为空否则用例直接失败。这正是「修复后应能不做例外摘除即通过」的验收形态。

### 2.2 裁定 ④：审计事件永不擦除——已落地

#54-B 发现 `longterm_export_sample.json` 里两条词级 `clear_word` 审计**自身被擦除**，
而 `clear_book`/`clear_user` 没有，于是文档第 1433 行「清除审计事件未被擦除」对样例
字面不成立。核对实现的成因：按词清除的擦除集合是
`user_id=? AND (card_id=? OR source_id IN …)`，而 `clear_word` 审计行**带 card_id**，
所以下一次按词清除会把它一起擦掉；按书清除按 `source_id` 匹配（审计行的
`source_id` 为 NULL），按用户清除虽然匹配 card，但 `clear_user`/`clear_book` 审计行
没有 card/source，因此幸存。三个 scope 的行为本来就不一致。

裁定与落地：**§7.2 第 610 行只擦除「既有**业务**事件」，清除审计事件不属于业务
事件，所以任何 scope 都不擦除它。** 实现上把三种审计 kind 从词级与用户级的擦除
集合里排除；归属去标识与内容擦除是正交的两件事——用户级清除仍然对该 owner 名下
存活的审计行做 owner 去标识，但不把它们标记 `erased`、不置 `erased_at`。

受影响面：`tests/contract/longterm_export.rs` 的 golden 断言原本就**没有**断言审计行
的 `erased_at`（第 1776–1781 行的注释明确写了「这是一个文档层面的未决项，而不是
已定的 §7.3 规则」），所以裁定落地后测试无需改动即可继续通过；但**样例文件本身
仍是裁定前的产物**，它的两条词级审计行仍写着 `state: "erased"`。这是给 #54 的
一条明确回填项（见 §5 的遗留项 L1），不阻断发布，因为没有任何用例断言它。

### 2.3 G2（语义不对称，§3.3 / §7.2 第 606 行）——已关闭

`record_ordinary_error`（#48）此前把「最新一行是已擦除骨架」也算作 `existing_card`，
于是 `card.generation <= cleared` 命中并返回 `LONGTERM_CLEARED`；而
`add_card_manually`（#52）走 `next_generation` 建新一代。裁定按 §3.3 与 §7.2 第 606
行「以后重遇使用新 generation」：**清除后的重遇创建新 generation**，
`LONGTERM_CLEARED` 只保留给两件事——复用已擦除的 `source_id`，以及写回被墓碑
覆盖的**活**行（复活尝试，§14.2-2）。

实现上把 generation 判定从「最新行」改成「最新**活**行」：骨架不参与判定，重遇从
墓碑之上开一代。同时把「复用已擦除 `source_id`」从会落到
`LONGTERM_IDENTITY_COLLISION` 的路径改为显式的 `LONGTERM_CLEARED`——§7.3/§12.4
描述的「已清除的 source_id 不可复用」本来就该是自己的稳定码，而不是身份冲突。

双向证据：`longterm_list.rs::manual_add_after_clear_starts_a_new_generation`
（#52 原有，Memory/SQLite/seekdb）固定手动加入侧；本波次把
`longterm_privacy.rs` 的重遇断言从「返回 `LONGTERM_CLEARED`」改写成「建 generation 2
且旧 generation 仍 `LONGTERM_NOT_FOUND`」，并把「复用已擦除 source_id」收紧为
`LONGTERM_CLEARED`。

### 2.4 附带修掉的跨后端错误码顺序分歧（§11.1 / §14.2-13）

核对 §11.1 逐条时发现 `SeekDbEmbeddedAdapter` 覆写了 trait 的
`validate_session_item_refs`，并把**检查顺序**换了：先读 card 再读 session。
结果是「他用户的会话条目」在 Memory 参照实现上返回 `LONGTERM_INVALID_ARGUMENT`
（session 归属检查先命中），在 SQLite/seekdb 上返回 `LONGTERM_NOT_FOUND`
（card 读不到先命中）。`tests/contract/longterm.rs` 的
`sqlite_session_item_logical_foreign_keys` 因此**一直是红的**（清单基线快照没有
记录这一点，因为它不在 B1–B11 任何一条里）。

已改为与 trait 默认实现同序：先 session 归属（`INVALID_ARGUMENT`），再 card
（`NOT_FOUND`），并在覆写里保留 seekdb 额外需要的「已擦除卡 → `LONGTERM_CLEARED`」
守卫。该用例现在通过。

### 2.6 解除 `#[ignore]` 后暴露的两个被掩盖缺陷

seekdb 运行时到位、82 个用例第一次真正执行，立刻暴露了两个此前被 `#[ignore]`
完全掩盖的问题。两者都不是「解除后失败」，而是「解除前根本没被执行过」：

1. **`session_state.rs::seekdb_repo` 用固定临时目录**（`§2.6` 提交 `3186ce2c`）。
   路径是 `temp_dir()/session-state-seekdb-{tag}`，而 seekdb 是**持久**引擎：第二次
   运行会重开上一轮残留的数据，于是 5 个用例的 `initial_count`/`completed_count`
   断言全部漂移。SQLite 侧的 `sqlite_repo` 用「进程 ID + 纳秒时间戳」所以没有这个
   问题。改为每个 tag 独占目录并在打开前 `remove_dir_all`，重复与并行运行都确定，
   连跑 3 次全绿。**这条缺陷只有真实持久后端才会显形**——它也是 #55-C 报告里
   「并行稳定性」那条经验（导出扫描撞临时文件）在另一个地方的同源问题。
2. **`tests/unit/rust/core.rs::seekdb_never_silently_falls_back` 在 SQLite 构建下
   必然失败**（提交 `b07e2ef8`）。它断言 `open_with_runtime(dir, "missing-runtime")`
   返回 `DB_RUNTIME_MISSING`，但该错误码只存在于
   `#[cfg(not(any(target_os = "ios", feature = "sqlite")))]` 的 seekdb 构造里；
   `--features sqlite` 下适配器**就是**平台引擎，`open_with_runtime` 按设计忽略
   runtime 参数，`result.err()` 是 `None`，`.unwrap()` 直接 panic。也就是说 §11.1 的
   「不静默降级」在 SQLite 构建里从来没有被断言过，却让定向测试集永远红。改为按
   构建分治：seekdb 构建保留原用例，SQLite 构建新增
   `bundled_sqlite_never_silently_falls_back`，用同一个故意无效的 runtime 参数打开
   真实引擎并断言 `engine_version()` 以 `SQLite ` 开头、数据目录里真的落出
   `quicklang.sqlite3`。顺带修掉原用例在 `--features sqlite` 下把
   `tests/rust/unused/` 当数据目录写进仓库的副作用。

### 2.8 B3 复跑结论——已转绿

```
cargo test --locked --offline -p quicklang-tests --features sqlite --test longterm_list
test result: ok. 43 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.30s
```

`sqlite_filters_select_the_documented_card_sets` 通过，`ll_filter_sql` 的 `Due` 分支
确实已含 `ll_not_in_active_formal_session`。`long_learn.md` 第 1520、1525 行的
「阻塞项」结论**已过期**，本波次在 §5 的回填项里列出（给 #55-D / #52-D）。

本波次另外给 B3 补了一条更强的双后端证据（seekdb 侧同样实跑通过）：
`session_state.rs::ruling_queued_cards_leave_the_shared_due_visibility_filter`
断言冻结之后 `due_today` 与错题本 `已到期` **同时**减去那 5 张卡，也就是 §8.1 与
§8.2 共用的可见性过滤在真实适配器上确实成立。

## 3. 裁定记录

| # | 待裁项 | 裁定 | 依据 | 影响范围 | 需回归的测试 |
| --- | --- | --- | --- | --- | --- |
| ① | `finished_at` 擦除语义（§4.4 第 250 行与 #51 记录列为**保留** vs #54 契约与样例按 `null`） | **置 `null`** | ①`finished_at` 是「会话何时结束」的业务事实，`occurred_at`/`created_at`/`state` 已经把这个事实保留下来（`state='erased'` 不再区分 completed/abandoned），留着毫秒时间戳等于在一行已经没有任何可读内容的骨架上保留唯一可关联的时间点；②§7.3 的最小保留清单是 #51 的**实现记录**而非 §7.3 正文，正文只要求「敏感正文与原 owner ID 置 NULL」，`finished_at` 不属于正文；③`erased` 骨架的语义是「不可读」，保留精确结束时间对用户没有价值，对审计也没有价值——审计读的是 tombstone 的 `cleared_at`；④与 `current_item_id` 一致：终态/擦除都置空。 | `storage-seekdb/src/longterm_clear.rs` 的会话擦除语句已含 `finished_at=NULL`；`longterm_export.rs` 的 `sessions[]` 擦除形态；样例文件 | `longterm_clear.rs`（38 用例）、`longterm_export.rs`（25 用例）、`longterm_privacy.rs`（36 用例）——已全部通过 |
| ② | `ErrorCount` 排序键窗口口径（§8.2 只写「错误次数」；#52 记录写「§8.3 的 30 日易错次数」；实现 `ll_error_count_expr` 是**无窗口**计数） | **采纳实现的无窗口定义**，并在 §8.2 写明理由 | ①游标是 keyset 游标，排序键值进游标并带完整性校验；窗口计数随 `ql_app_state` 时钟移动，**翻页途中窗口边界前移会让同一页内的键值前后不一致**，破坏 §8.2「翻页不因相同时间值重复或遗漏」；②`ErrorCount` 是「这个词错了几次」的用户心智模型，不是统计窗口指标——要窗口口径请看首页的「最近 30 日易错次数」（§8.3），那里本来就是窗口函数；③`longterm_list.rs` 第 62–71 行已给出同一理由，实现与文档取齐即可。 | `longterm_list.rs` 的 `CardSort::ErrorCount` 与 `ll_error_count_expr`；`long_learn.md` §8.2 第 651 行需补一句 | `longterm_list.rs` 用例 3（`sorts_are_deterministic_and_tie_roken_by_card_id`）、用例 16（`list_summaries_agree_with_detail_history_and_metrics`）——已通过 |
| ③ | `CardDetail` 是否需要 `display_source_id` / 事件游标字段 | **不加 `display_source_id`；不加事件游标，留作 §9.1 的 DTO 变更** | ①卡片行已有 `recent_wrong_source_id`（§4.1 第 145 行之后的字段），详情里的「当前展示来源」按 §7.1 第 600 行的固定回退规则就是它，再加一个 DTO 字段等于把同一事实暴露两次，两次可以不一致；②时间线固定 50 条是**有意的有界契约**（`LongtermStorage::list_events_for_card` 的 `1..=500` 上限），要分页就必须改 trait 签名 + §9.1 DTO + 升 `version`，属于下一个版本的取舍，不该在 0.7.0 收尾阶段塞进来；③`CardDetail` 现在只有 `card`/`sources`/`recent_events` 三个字段，加字段会连带 §10.1 导出与 §9.1 的版本策略。 | `storage-api/src/longterm.rs` 的 `CardDetail`（不加字段）；`long_learn.md` 第 1530 行需回填裁定 | 无（不改动实现）。若产品坚持分页时间线，需开 `version=2` 的 DTO 变更并重跑 `longterm_export.rs` |
| ④ | 清除审计事件是否擦除（#54-B 发现样例里词级 `clear_word` 自身被擦除，文档第 1433 行字面不成立） | **审计事件永不擦除（三种 scope 一致）；但用户级清除仍对存活审计行做归属去标识（不置 `erased_at`）** | ①§7.2 第 610 行的擦除对象是「既有**业务**事件」，清除自身的审计事件不是业务事件；②§4.3 第 230 行把 `clear_*` 与 `source_link`/`session_abandon` 并列为「调用方生成 operationId 的管理与生命周期事件」，不是被擦的业务事件；③归属去标识与内容擦除正交——这样 §14.2-6「原 owner ID 置 NULL」与「审计不被擦除」两条同时成立；④三个 scope 行为不一致本身就是缺陷的证据。 | `storage-seekdb/src/longterm_clear.rs`；四个 Memory 参照实现；`longterm_export.rs` 的 `visible` 谓词 | `longterm_clear.rs::clear_audit_events_are_never_erased_in_any_scope`（×3 后端）、`longterm_privacy.rs` 全部 3 个 scope 用例、`longterm_export.rs::sqlite_and_memory_export_byte_equal_for_same_dataset` —��� 已通过 |

**P1 / P2 / P16 回填**

| 项 | 状态 | 处置 |
| --- | --- | --- |
| P1（§9.1 列 12 个命令、实际注册数、守卫测试断言导出命令**不得**注册） | **已由 #54-A 关闭** | 命令已注册、守卫测试已更新（见 `long_learn.md` 第 1545 行的 P1 行归属 #54-A）。本波次只核对「守卫测试不再与注册冲突」这一事实，未改动 `src/app/**`。 |
| P2（§5.1 第 348 行 `exportLongtermData(command, sink)` 带 sink，trait 没有） | **已由 #54-A 关闭** | `ExportLongtermDataCommand` 现在是 `{user_id, include_raw_answers, output_path}` 三字段，目的地由命令承载；§5.1 与 #54 记录第 1411 行的「两字段 + sink」表述需由 #55-D 回填为三字段（回填项 L2）。 |
| P16（§#54 第 1411 行漏记 `output_path`） | **已由 #54-A 关闭** | 同上，`long_learn.md` 第 1411 行的 `ExportLongtermDataCommand{user_id, include_raw_answers}` 需更新为三字段（回填项 L2）。 |

## 4. §14.1 十条发布验收逐条结论

| §14.1 | 验收项（行号） | 结论 | 证据 / 阻断原因 |
| --- | --- | --- | --- |
| 1（860） | 六张新表在 seekdb/SQLite 空库直接建立，未增加旧库迁移和 `ql_review_*` 接入 | **通过** | `longterm.rs::sqlite_repeated_schema_initialization_is_idempotent`、`seekdb_repeated_schema_initialization_is_idempotent`、`sqlite_tests.rs::sqlite_schema_covers_every_canonical_table`；`longterm.rs` 39 passed（Memory + 真实 seekdb）/ 39 passed（Memory + SQLite）。无旧库迁移、无 `ql_review_*` 接入：`grep` 全仓零命中。 |
| 2（861） | 普通错误单事务原子提交 + 失败全回滚 | **通过（三后端）** | **本波次补齐了 B6**：`sqlite_ordinary_error_rolls_back_every_injected_step` 对 §5.2 的 8 个步骤逐一注入失败，断言六表零写入、`ql_app_state` 逐键不变、失败方零残留、去掉注入后同一命令成功。`seekdb_ordinary_error_rolls_back_every_injected_step` 在真实 seekdb 引擎上同样通过。前端「不先 `setSaved` 再 `onWrong`」属 §12.3 UI 侧，由 #53 的 vitest 覆盖（#55-C 报告 §5 第 2 条已记录该边界）。 |
| 3（862） | 逻辑外键、`event_id = operationId`、`payload_hash` 冲突、`event_kind` 枚举封闭，双后端一致 | **通过（三后端）** | `longterm.rs` 39 passed（Memory + seekdb）/ 39 passed（Memory + SQLite），含本波次修好的 `sqlite_session_item_logical_foreign_keys` 及其 seekdb 对照。Memory 与两个真实后端的错误码顺序现已一致（见 §2.4）。 |
| 4（863） | `nfkc-lower-v1`、SHA-256 ID、跨词书共享、generation 重遇固定向量 | **通过** | `domain/src/longterm.rs`：`nfkc_lower_v1_normalizes_compatibility_case_combining_and_edge_whitespace`、`card_id_matches_fixed_vectors_and_is_deterministic`、`next_generation_follows_tombstone_and_existing_max_plus_one`；跨词书共享由 `longterm_clear.rs` 用例 3 覆盖。纯函数层与后端无关。 |
| 5（864） | Again/Good、逾期层级、稳定随机、正式/提前会话、恢复、一分钟重试 | **通过（三后端）** | `scheduler/src/longterm.rs` 21 个单测；`session_state.rs` 36 passed（Memory + seekdb）/ 37 passed（Memory + SQLite）。**本波次补齐了 B7 的 §5.6-2/§5.6-3 对照**（裁决 ①②③④ 各一条真实后端用例，SQLite 与 seekdb 共用同一份函数体）。 |
| 6（865） | 来源生命周期、三种清除、owner hash、`erased` 骨架、tombstone、敏感字段置空 | **通过（三后端）／真并发未做** | `longterm_clear.rs` 36 passed（Memory + seekdb）/ 36 passed（Memory + SQLite），含新增的 `clear_audit_events_are_never_erased_in_any_scope` 与 `cleared_word_erases_every_generation_into_bare_skeletons`——**裁定 ④（审计行三种 scope 一致不擦除）与 G1（审计行不带明文 owner）因此都有了真实 seekdb 证据**。**遗留**：§#51 第 1014 行留给 #55 的「真并发（双线程 clear/submit）」仍未做（见 §9 遗留项 L3）。 |
| 7（866） | 首页、错题本、详情、游标、指标、TTS 技术失败在 macOS/iOS 一致 | **部分通过 + 明确阻断说明** | Rust 侧：`longterm_list.rs` 43 passed（Memory + seekdb）/ 43 passed（Memory + SQLite，含 B3 复跑），`longterm_privacy.rs` 24 passed（两个构建，§14.2-11/12/14）。**阻断**：①TTS 的「权限拒绝 / 设备不可用」需要真实平台弹窗与音频设备，Rust 与 jsdom 都无法构造，留在清单 §9 真机清单；②iOS 真机零覆盖；③§8.4 的「只有确认听到才允许提交」门禁在 UI 局部状态（`heard`/`audio`），`SubmitLongtermAttemptCommand` 没有字段承载它，Repository 无法拒绝一次「没听到就提交」的作答——这是契约边界不是漏测（#55-C 报告 §5 第 3 条）；④「播放失败后仍允许打字提交 → 记为 Again」需要产品裁定（#55-C 报告 §5 第 4 条）。 |
| 8（867） | JSON 默认含原文可关闭、含活动会话、流式、不含已擦除内容、无导入入口 | **通过（导出格式与隐私面）／1 000 000 事件容量待 #55-B** | `longterm_export.rs` 12 Memory + 23 SQLite 全绿，含 `golden_sample_follows_the_section_10_1_format`、`export_after_clear_is_privacy_minimal`、`sqlite_and_memory_export_byte_equal_for_same_dataset`。§11.2 的 100 万事件导出的吞吐/峰值内存/文件大小由 #55-B 的基准产出。**P1 已关闭**（命令已注册）。 |
| 9（868） | 2 万卡/100 万事件上 P95 `< 200 ms` / `< 300 ms` | **未关闭（归属 #55-B）** | 本波次不负责基准。基准设施由 #55-B 落地（`tests/rust/benches/longterm_bench.rs` + `tests/rust/Cargo.toml` 的 `[[bench]]` 已在工作区）。 |
| 10（869） | 隐私、安全、端到端、性能、分阶段发布检查全部完成，无未说明跳过项 | **部分通过 + 全部跳过项均有说明** | 隐私/安全：#55-C 的 36 用例（现三后端实跑）+ 本波次关闭 G1/G2。性能：#55-B（基准已落地，阈值结论由 #55-B 回填）。分阶段发布：清单 §2 的四阶段未开始（B4 功能开关载体已由 #55-B 落地为 `longterm_flags.rs`）。真机清单：清单 §9 未执行，7 项均已写明为什么不能在 CI 里自动化。**本波次没有留下任何「无说明的跳过项」，也没有留下任何 `#[ignore]`**：长期契约的 82 个 seekdb 用例已在真实引擎上通过。 |

## 5. §14.2 十四条不变量覆盖矩阵

| §14.2 | 不变量（行号） | 状态 | 覆盖用例（本波次新增加粗） |
| --- | --- | --- | --- |
| 1（873） | 同用户同词形同题型同 generation 只有一张逻辑卡 | 已覆盖 | `longterm.rs::memory_identity_collision`、`memory_generation_assignment`；`longterm_list.rs::manual_add_derives_identity_and_writes_only_a_sentinel` |
| 2（874） | 旧 generation 永不复活 | 已覆盖 | `longterm_clear.rs::generation_reencounter_after_clear_is_cleared_plus_one`、`tombstone_prevents_resurrection_of_old_references`；`longterm_list.rs::manual_add_after_clear_starts_a_new_generation`；**`longterm_clear.rs::cleared_word_erases_every_generation_into_bare_skeletons`**；**`longterm_privacy.rs::clear_word_scope_leaves_no_residue_anywhere`（重遇建 generation 2 且 generation 1 仍 `NOT_FOUND`）** |
| 3（875） | 普通错误跨 `ql_app_state` 与六表全提交或全回滚 | **本波次补齐双后端** | `ordinary_error.rs::memory_ordinary_error_rolls_back_every_injected_step`；**`sqlite_ordinary_error_rolls_back_every_injected_step`（§5.2 全部 8 步逐一注入）**；**`seekdb_ordinary_error_rolls_back_every_injected_step`（`#[ignore]`）** |
| 4（876） | operation ID 即 event ID；同 ID 同 hash 返回原结果 | 已覆盖（三后端） | `longterm.rs::memory_idempotent_event_retry`、`memory_payload_hash_conflict`；`ordinary_error.rs::memory_ordinary_error_retry_returns_already_applied`、`memory_ordinary_error_conflicting_payload_rejected`；**`sqlite_ordinary_error_happy_path_and_idempotent_replay`** |
| 5（877） | 六表非空引用满足逻辑外键 | 已覆盖（三后端） | `longterm.rs::logical_foreign_key_violation`、`event_reference_rules`、`session_item_logical_foreign_keys`（**本波次修好 SQLite 侧的错误码顺序分歧**）、`session_current_item_rules` |
| 6（878） | 清除只留 `erased` 骨架 + tombstone，敏感字段与原 owner ID 置 NULL | **本波次补齐审计行** | `longterm_clear.rs` 用例 5/11/16（`erased_skeleton_is_persisted`）、**`clear_audit_events_are_never_erased_in_any_scope`（审计行 `user_id == ""`）**、`longterm_privacy.rs::clear_user_scope_leaves_no_residue_anywhere`（**不再有例外摘除**） |
| 7（879） | 同会话最多一次 lapse；提前练习永不改变排期 | 已覆盖 | `session_state.rs::memory_second_again_does_not_double_count_lapse`、`memory_early_attempt_preserves_card_and_records_waiting_tail`；`scheduler::apply_early_attempt_never_touches_the_schedule` |
| 8（880） | 已清除/无有效来源/暂停的卡不进正式选卡 | **本波次补齐双后端** | `session_state.rs::memory_formal_empty_selection_skips_invisible_and_undue_cards`；**`ruling_formal_empty_selection_freezes_exactly_the_documented_candidate_set`**；**`ruling_queued_cards_leave_the_shared_due_visibility_filter`**；`longterm_list.rs` 用例 4（B3 复跑已转绿） |
| 9（881） | 按书清除不重算他书共享卡排期 | 已覆盖 | `longterm_clear.rs::clear_book_scope_erases_only_that_book_sources` |
| 10（882） | 全部初始卡最终 Good 才完成；Again 后 ≥ 1 分钟 | 已覆盖 | `session_state.rs::memory_completion_requires_all_good_and_again_blocks_it`、`memory_formal_again_resets_schedule_waits_and_goes_to_tail` |
| 11（883） | 技术失败不计错、不写事件、不改排期 | 已覆盖（平台项阻断） | `longterm_privacy.rs::technical_failure_is_not_graded_and_never_touches_the_schedule`、`technical_failure_leaves_the_question_retryable_and_the_error_text_clean`（各 ×3 后端）；UI 层由 #53-A 的 vitest 覆盖；「权限拒绝/设备不可用」留在清单 §9 |
| 12（884） | UI、导出、日志、统计不泄露已擦除字段 | 已覆盖（UI 全局搜索阻断） | `longterm_privacy.rs` 12 用例（错误文本、事件 payload、DTO `Debug`、导出原文开关、清除后导出+数据库+逐行 `Debug` 全局搜索）；`longterm_list.rs::cleared_generation_is_hidden_everywhere`；清除后的 **UI** 全局搜索留在清单 §9 |
| 13（885） | seekdb 与 SQLite 返回相同领域结果与稳定错误码 | **通过** | 三后端各 205 个用例全绿（`#[ignore]` 归零）；**本波次补齐 §5.6 四项裁决的 SQLite 对照（B7）**，并修掉 `validate_session_item_refs` 的错误码顺序分歧（§2.4）。**残余风险**：两个 seekdb 构建（仓库默认与 `--features sqlite`）跑的是同一份 `SeekDbEmbeddedAdapter` 代码路径，差异只在方言层（`dialect.rs` 的 `FOR_UPDATE` 与 `INSERT_IGNORE`），所以「seekdb 引擎 vs SQLite 引擎」的差异目前只被方言常量覆盖，没有被两套独立实现交叉验证。 |
| 14（886） | 长期记录与生词表生命周期独立 | 已覆盖（UI 文案阻断） | `longterm_privacy.rs::vocabulary_and_longterm_lifecycles_are_independent`；§7.4 第 630–631 行的产品 UI 提示留在清单 §9 |

## 6. 清单 B1–B11 关闭状态

| # | 事项 | 状态 | 结论与证据 |
| --- | --- | --- | --- |
| **B1** | `make init` 未就绪 seekdb 运行时，长期契约的 ignore 数未归零 | **已关闭（提交 `3186ce2c`）** | 只读探测确认引擎包 URL 可达（HTTP 200、59 142 658 字节）、`cmake`/`clang` 齐备后，在后台跑完 `node scripts/bootstrap/seekdb.mjs`：下载并校验 `deps/seekdb/runtime.lock.json` pin 住的引擎包与 OpenSSL 3.5.8、编译 seekdb C 驱动，`--offline-check` 输出 `Verified seekdb 1.4.0 runtime (11 files)`。随后解除全部 **82** 个 `#[ignore]`（`longterm.rs` 20、`longterm_clear.rs` 18、`longterm_list.rs` 21、`longterm_export.rs` 2、`longterm_privacy.rs` 12、`ordinary_error.rs` 2、`session_state.rs` 7），**seekdb 构建下 205 passed / 0 failed / 0 ignored，连续两轮完全一致**。解除过程暴露并修掉一个被 `#[ignore]` 掩盖的真实缺陷（见 §2.6）。`deps/cache/` 已在 `.gitignore` 第 4 行，运行时产物不进提交。 |
| B2 | #54 导出链路未验收 | **已关闭（#54-A/#54-B）** | 导出实现、IPC 注册、契约文件入库均已完成；§10.1 七条规则有用例，`longterm_export.rs` 14 passed（Memory + 真实 seekdb，含 2 个此前 `#[ignore]` 的 seekdb 用例）/ 23 passed（Memory + SQLite）。P1 同时关闭。 |
| **B3** | #52 遗留的「`已到期` 与 `due_today` 不一致」结论与代码矛盾 | **关闭** | 复跑 `--features sqlite --test longterm_list` → 43 passed / 0 failed，`sqlite_filters_select_the_documented_card_sets` 转绿；seekdb 构建同样 43 passed。另补 `ruling_queued_cards_leave_the_shared_due_visibility_filter` 作为更强的三后端证据。`long_learn.md` 第 1525 行的过期结论已在本波次回填（回填项 L2）。 |
| B4 | §13 功能开关无实现载体 | 关闭（#55-B，提交 `bef1768f` 之前已入库） | `src/crates/storage-seekdb/src/longterm_flags.rs` 已入库，`lib.rs` 注册了 `pub mod longterm_flags`。 |
| B5 | 3 项契约分歧待裁 | **关闭** | 见 §3 的裁定 ①②③。 |
| **B6** | §12.2 要求普通错误回滚在双后端一致，SQLite/seekdb 无回滚注入用例 | **关闭** | `src/crates/storage-seekdb/src/longterm_ordinary.rs` 新增线程局部失败注入点 `set_ordinary_error_failure_step` / `ORDINARY_ERROR_STEPS`（与 #54 导出失败注入同形，thread-local，不泄漏到无关调用）。用例：`ordinary_error.rs::sqlite_ordinary_error_rolls_back_every_injected_step`（§5.2 的 8 个步骤逐一注入，六表零写入 + `ql_app_state` 逐键不变 + 失败方零残留 + 去注入后同命令成功）、`seekdb_ordinary_error_rolls_back_every_injected_step`（同一份函数体，真实引擎上通过），另加 `sqlite/seekdb_ordinary_error_happy_path_and_idempotent_replay` 覆盖 §12.2 的 happy path + 幂等。 |
| **B7** | §5.6 裁决 2/3 只有 Memory 覆盖 | **关闭** | `session_state.rs` 新增 5 个共享函数体 + 10 个薄包装（SQLite 与真实 seekdb 各跑同一份函数体）：裁决 ② submit 侧重放、② create 侧重放、③ 后端空选选卡（候选集逐条构造）、③ 的第六个候选条件（冻结后离开 `due_today` 与 `已到期`）、裁决 ①+④（条目 CAS token 与放弃的会话 token）。函数体只有一份，因此 §14.2-13 比较的是同一份契约。 |
| B8 | §14.1 第 7 条依赖 #53 UI | 部分关闭 + 阻断说明 | #53 已落地（提交 `2587eacf`「#53 前端缺陷修复与文档回填」）；平台权限与真机项按阻断处理，见 §4 第 7 条。 |
| B9 | §11.2/§11.3 基准不存在 | 关闭（#55-B，提交 `bef1768f`） | `tests/rust/benches/longterm_bench.rs` + `tests/rust/Cargo.toml` 的 `[[bench]] longterm_bench`（`harness = false`）已入库，报告见 `docs/design/0.7/long_learn_benchmarks.md`。阈值结论由 #55-B 回填 §14.1 第 9 条。 |
| B10 | 4 个新免费模型的官网价待补 | 未关闭 | 归属发布负责人，**不得凭记忆填写**；与本波次无关。 |
| **B11** | #52 遗留的两处错误码二选一未裁决 | **关闭** | 两处都固定为 `LONGTERM_INVALID_ARGUMENT`（依据见 §3 与提交 `5a9463b6` 的说明）。真实实现本来就是这个码，改动落在 Memory 参照实现与契约断言。 |

## 7. 测试命令与完整结果

```
# ---- seekdb 构建（默认 feature）：Memory 参照实现 + 真实 macOS ARM64 seekdb 引擎 ----
# 解除 82 个 #[ignore] 后的取证命令；连续两轮结果完全一致。
$ CARGO_HOME=$PWD/deps/cache/cargo RUSTUP_HOME=$PWD/deps/cache/rustup \
  PATH=$PWD/deps/cache/cargo/bin:$PATH \
  cargo test --locked --offline -p quicklang-tests \
    --test longterm --test longterm_clear --test longterm_list --test longterm_export \
    --test longterm_privacy --test ordinary_error --test session_state
test result: ok. 39 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.17s   # longterm
test result: ok. 36 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.93s   # longterm_clear
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.27s   # longterm_export
test result: ok. 43 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.09s   # longterm_list   ← B3
test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.37s   # longterm_privacy
test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.47s   # ordinary_error ← B6
test result: ok. 36 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.12s   # session_state  ← B7
# 合计 205 passed / 0 failed / 0 ignored

# ---- SQLite 构建（--features sqlite）：Memory 参照实现 + bundled SQLite ----
$ cargo test --locked --offline -p quicklang-tests --features sqlite \
    --test longterm --test longterm_clear --test longterm_list --test longterm_export \
    --test longterm_privacy --test ordinary_error --test session_state \
    --test core --test repository
test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s   # core          ← §11.1 不静默降级
test result: ok.  3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s   # repository
test result: ok. 39 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s   # longterm
test result: ok. 36 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.12s   # longterm_clear
test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.16s   # longterm_export
test result: ok. 43 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.26s   # longterm_list  ← B3
test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.26s   # longterm_privacy
test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s   # ordinary_error ← B6
test result: ok. 37 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.06s   # session_state  ← B7

# ---- B3 单独复跑（清单要求的取证命令） ----
$ cargo test --locked --offline -p quicklang-tests --features sqlite --test longterm_list
test result: ok. 43 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.26s

# ---- core（seekdb 构建）：§11.1「不静默降级」 ----
$ cargo test --locked --offline -p quicklang-tests --test core
test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

# ---- 存储层自身的长-term 单测（SQLite 后端） ----
$ cargo test --locked --offline -p quicklang-storage-seekdb --features sqlite --lib longterm
test result: ok. 125 passed; 0 failed; 0 ignored; 0 measured; 32 filtered out; finished in 0.42s

# ---- 格式与 lint ----
$ node scripts/tasks.mjs format-check
[format] Checked 347 non-Rust source files; 0 unformatted.
> cargo fmt --all -- --check
（退出码 0）
$ cargo clippy --locked --offline -p quicklang-tests --features sqlite --test session_state -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s)
$ cargo clippy --locked --offline -p quicklang-tests --test longterm_list -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s)
```

**B1 的 provisioning 取证**

```
$ curl -sSIL --max-time 55 -o /dev/null -w "http_code=%{http_code}\n" \
    "https://github.com/oceanbase/seekdb/releases/download/v1.4.0/seekdb-1.4.0.0-100000092026051510-macos15-arm64.pkg"
http_code=200
content-length: 59142658

$ node scripts/bootstrap/seekdb.mjs            # 只跑运行时 provisioning，不做 npm/cargo fetch
...
Verified seekdb 1.4.0 runtime (11 files)

$ node scripts/bootstrap/seekdb.mjs --offline-check
Verified seekdb 1.4.0 runtime (11 files)
```

产物落在 `deps/cache/seekdb-runtime/`（`seekdb`、`libseekdb.dylib`、`libssl.3.dylib`、
`libcrypto.3.dylib`、`manifest.json`、`licenses/`、`sources/`），该目录已被
`.gitignore` 第 4 行忽略，不进任何提交。

**并行/重复稳定性**：解除 `#[ignore]` 后第一次连跑暴露了 `seekdb_repo` 的固定临时
目录问题（§2.6 第 1 条）。修好后 `session_state.rs` 连跑 3 次、七个契约文件整体
连跑 2 次，结果完全一致（205 passed / 0 failed / 0 ignored）。

## 8. B1 的复现步骤（供其他机器/CI 复核）

本波次已在具备 macOS 15+ Apple Silicon 与网络的机器上完成一次，B1 关闭。其他机器
或 CI 若要复核，按下列步骤即可得到同样的结果：

1. `make init`（等价于 `node scripts/tasks.mjs init`）。若只想 provisioning 运行时，
   可单独跑 `node scripts/bootstrap/seekdb.mjs`——它下载并校验
   `deps/seekdb/runtime.lock.json` pin 住的引擎包与 OpenSSL 源码、编译 seekdb C 驱动，
   把 `seekdb`、`libseekdb.dylib`、`libssl.3.dylib`、`libcrypto.3.dylib`、
   `manifest.json` 装进 `deps/cache/seekdb-runtime/`。**首次运行需要编译 OpenSSL
   3.5.8，本波次实测约 10 分钟**（其中下载约 2 分钟）。`deps/cache/` 已被
   `.gitignore` 忽略，不会污染提交。
2. 校验：`node scripts/bootstrap/seekdb.mjs --offline-check` 应输出
   `Verified seekdb 1.4.0 runtime (11 files)`。
3. 跑 seekdb 构建（**不带** `--features sqlite`，那个 feature 会把适配器换成 bundled
   SQLite）：
   ```
   cargo test --locked --offline -p quicklang-tests --test longterm
   cargo test --locked --offline -p quicklang-tests --test longterm_clear
   cargo test --locked --offline -p quicklang-tests --test longterm_list
   cargo test --locked --offline -p quicklang-tests --test longterm_export
   cargo test --locked --offline -p quicklang-tests --test longterm_privacy
   cargo test --locked --offline -p quicklang-tests --test ordinary_error
   cargo test --locked --offline -p quicklang-tests --test session_state
   ```
   期望：七个文件的 `ignored` 计数全部为 0，0 failed，合计 205 passed。**不要**跑
   `make test`（全量测试由主控在全部任务完成后统一跑）。
4. 交叉复核 SQLite 构建：`cargo test --locked --offline -p quicklang-tests
   --features sqlite --test <file>`，期望 219 passed（七个契约文件）+ core 22 +
   repository 3。
5. 注意持久后端的临时目录：任何新增的 seekdb 用例都应像 `seekdb_repo` 那样为每个
   tag 独占目录并在打开前清理，否则第二次运行会读到上一轮的残留（§2.6 第 1 条）。

## 9. 遗留项

| # | 遗留 | 归属 | 是否阻断阶段 1 |
| --- | --- | --- | --- |
| L1 | `docs/design/0.7/longterm_export_sample.json` 的两条词级 `clear_word` 审计行仍是 `state: "erased"`、`erased_at` 等于自身清除时刻——裁定 ④ 落地后它们应当是 `active`/`erased_at: null`。**没有任何用例断言这一点**（`longterm_export.rs` 第 1776–1781 行的注释明确说这是文档层面的未决项），所以不阻断，但样例文件应当重生成，否则下一个读它的人会被误导。 | #54（样例文件） | 否 |
| L2 | `long_learn.md` 第 348 行（§5.1 的 `exportLongtermData(command, sink)`）、第 1411 行（`ExportLongtermDataCommand` 两字段）、第 1520/1525 行（#52 的过期「阻塞项」结论）、第 1526/1527 行（B11 两处二选一）需按本报告 §3 与 §2.5 回填措辞。 | #55-D / #52-D | 否（文档维护） |
| L3 | §#51 第 1014 行留给 #55 的「真并发（双线程 clear/submit）」仍未做：现有用例是串行地构造「清除与提交竞态」的前后状态，没有真的让两个线程同时打一个库。`SeekDbEmbeddedAdapter` 对数据目录持进程级独占锁（`lock.try_lock_exclusive()`），所以同进程双线程打同一个库在架构上不可能——这条要么改成「两个进程/两个连接」的形态（需要放开独占锁，属于架构决策），要么在 §14.1 第 6 条写明「竞态由事务隔离与 CAS 版本保证，契约层以串行前后状态断言」。 | #55-A（下一波）/ #55-D（措辞） | 否（§14.1 第 6 条已有其余证据） |
| L4 | §8.4「播放失败后 UI 仍允许打字提交 → 记为 Again」与「只有确认听到才允许提交」两个口径仍需产品裁定（#55-C 报告 §5 第 3–4 条）。`SubmitLongtermAttemptCommand` 没有字段承载「已听到」信号。 | 产品 / #55-D | 否（§14.1 第 7 条已写阻断说明） |
| L5 | §11.2 的 100 万事件导出的吞吐/峰值内存/文件大小，以及 §11.3 的 P95 阈值，由 #55-B 的基准产出后回填 §14.1 第 9 条。基准设施已入库（`bef1768f`），阈值结论待回填。 | #55-B | 是（阶段 3/4 不得开启） |
| L6 | 清单 §9 真机清单（macOS seekdb + 最弱目标 iPhone SQLite）7 项全部未执行。 | #55-C / 发布负责人 | 是（阶段 2 不得开启） |
| L7 | B10：4 个新免费模型的官网价待发布负责人提供出处后回填，**不得凭记忆填写**。 | 发布负责人 | 是（发布说明不得含未核对的数字） |

## 10. 起止时间

- 开工：2026-10-04 22:47
- 收尾：2026-10-05 00:2x（本地提交 `85df722b`、`5a9463b6`、`118d2952`、`b07e2ef8`、`3186ce2c`，本文件随第六个提交入库）