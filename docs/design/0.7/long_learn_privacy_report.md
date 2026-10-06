# #55-C 隐私、安全与端到端验收报告

> 范围：design 0.7 §7.3 / §7.4 / §8.4 / §12.4 / §14.2-11 / §14.2-12 / §14.2-13 /
> §14.2-14 的自动化证据，产出物是 `tests/contract/longterm_privacy.rs`。
> 对应清单 `docs/design/0.7/long_learn_release_checklist.md` 的 §1 B8、§6.1 的
> §14.2-11 / §14.2-12 / §14.2-14 行与 §9 真机清单，以及 `long_learn.md` 校对
> 清单的 P7 / P8 / P11。
>
> 基线：`issue/45-longterm-learning` @ `855e1db0`（#53 已落地今日复习与提前练习
> UI），跑测试时的实际 HEAD 以报告末尾的"测试命令与结果"一节为准。

## 1. 产出物

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `tests/contract/longterm_privacy.rs` | 5148 | 12 个契约用例 × 3 个后端 = 36 个测试；含 §7.1-§8.4 所需的内存参照双实现 |
| `tests/rust/Cargo.toml` | +5 | 追加 `[[test]] longterm_privacy` 注册块（`#55-C` 注释） |
| `docs/design/0.7/long_learn_privacy_report.md` | 186 | 映射、缺口与阻断说明 |

测试分布：Memory 12 个（全部执行）、SQLite 12 个（`--features sqlite` 执行）、
seekdb 12 个（`#[ignore]`，按仓库既有范式等 `make init` 装好 macOS ARM64 运行时）。

## 2. 不变量 → 用例映射

| 不变量 | 条款 | 用例（Memory / SQLite / seekdb 同名） | 断言要点 |
| --- | --- | --- | --- |
| §14.2-11 技术失败不计错 | §8.4 第 670–673 行、§12.1 第 811 行 | `technical_failure_is_not_graded_and_never_touches_the_schedule` | 四类技术失败（TTS 不可用、WebView 回退失败、音频设备失败、权限拒绝）之后六张表与 `ql_app_state` 的**逐字段指纹完全相等**；秘密卡 `due_at`/`schedule_step`/`interval_days`/`lapse_count`/`last_review_at`/`mastered_at` 全部不变；卡片只有那一条 `ordinary_error` 事件；`AttemptResult` 只有 again/good 且 `event_kind` 的 12 个取值里没有技术失败 |
| §14.2-11 保持当前题可重试 | §8.4 第 671 行 | `technical_failure_leaves_the_question_retryable_and_the_error_text_clean` | 条目仍 `ready`、`attempt_count=0`、`retry_not_before=0`、`completed_event_id=None`、会话 `completed_count=0`；失败后照常提交评分成功（失败没有占用这一题）；再放弃会话成功；技术错误文本只带 `LONGTERM_TTS_FAILURE` 与后端类型，`Display`/`Debug` 零敏感值 |
| §14.2-12 日志与错误不泄露 | §7.3 第 622 行、§12.4 第 840 行 | `error_text_never_carries_sensitive_values` | 24 条可达失败路径（空拼写、超长答案、陈旧 app-state 令牌、幂等冲突、越权详情、generation 0、limit 越界、负时钟、四种恶意游标、三种清除参数缺失/越权、导出空目的地与不可写目的地、组大小 3、未到期显式选择、重复选卡、选不存在的卡、条目版本冲突、放弃版本冲突……）逐条断言 `Display`/`Debug` 对原文答案、词形全变体、来源拼写、词书名、词条名、明文 `user_id` 零出现，且稳定码落在 §9.2 集合内并覆盖主要失败码 |
| §14.2-12 全变体扫描 | §9.2 稳定码集合 | `app_error_debug_is_safe_for_every_stable_code` | §9.2 的 **15 个**稳定码各构造一个 `AppError`，断言 `Debug`/`Display` 干净、`retryable` 正确、码本身出现在 `Debug` 里（供 §7.3 的按码统计） |
| §14.2-12 事件 payload 无正文 | §7.3 第 618 行、§4.3 | `event_payloads_and_schedule_snapshots_carry_no_body_text` | `payload_hash` 是 64 位小写十六进制摘要；`schedule_before_json`/`schedule_after_json` 解析后**只允许** `due_at`/`schedule_step`/`interval_days`/`mastered_at`/`lapse_count` 且值必须是数字；事件行 `Debug` 除 `answer_raw`（§10.1 的允许面）外零正文 |
| §14.2-12 清单面只带码 | §7.3 第 622 行 | `list_detail_and_result_dtos_carry_no_answers` | 数据仍然活着时，`CardPage`/`CardSummary`/`Metrics`/`SessionSummary`/`ExportResult`/`OrdinaryErrorResult`/`CardDetail.card`/`CardDetail.sources` 的 `Debug` 零原文答案与零词书名；详情时间线的 `answer_raw` 单独断言为"事件行自己的允许字段" |
| §14.2-12 清除后全局搜索（按词） | §12.4 第 840 行、§7.2 第 606 行 | `clear_word_scope_leaves_no_residue_anywhere` | 清除前证明秘密词形与原文确实在库；清除后对**导出文本（含/不含原文两种形态）、列表 DTO、全部存活卡详情、指标、清除后错误文本、六表逐行 `Debug`** 穷举搜索敏感值零出现；同时断言 `öffentlich`/`wandern` 仍可搜到（证明"零出现"不是空洞断言）；详情 `LONGTERM_NOT_FOUND`；30 日易错次数恰好 −1；墓碑挡住 generation 1；复用已清除 `source_id` 被拒且骨架仍无词形；重开数据库后再搜一遍 |
| §14.2-12 清除后全局搜索（按书） | §7.2 第 607 行 | `clear_book_scope_leaves_no_residue_anywhere` | 该书三个来源与事件擦除、`book_id`/`item_id`/`source_spelling` 物理置空；**卡片行保留、卡片词形保留**（把 §7.2 的范围边界钉死，避免把"按书"误做成"按词"）；另一本词书的来源逐字节不变；词书名/词条名/来源拼写/原文答案在导出与全部表面零出现 |
| §14.2-12 清除后全局搜索（按用户） | §7.2 第 608 行、§12.4 第 842 行 | `clear_user_scope_leaves_no_residue_anywhere` | 该用户六表全部擦到骨架；明文 `user_id`、全部词形、两个词书名、词条名、原文答案零出现，墓碑只留 `owner_hash`；擦除骨架仍按 `owner_hash` 出现在导出里（§10.1 可见性）；**用户 B 的来源行逐字节不变**、其导出仍含自己的同词形副本、其指标不变 |
| §14.2-12 导出原文开关与临时文件 | §10.1①⑤、§7.3 第 620 行 | `export_honours_the_raw_answer_switch_and_leaves_no_temp_file` | 默认含原文；关闭后 `"answer_raw"` 键被**整体移除**（不是替换成长度/掩码/哈希）且无任何答案文本；除 `exportedAt` 外文档稳定；导出成功后目录里没有 `.tmp`；写入失败不发布半截文件且错误文本干净；导出按用户隔离 |
| §14.2-14 生命周期独立 | §7.4 第 628–629 行 | `vocabulary_and_longterm_lifecycles_are_independent` | §5.2 把来源词条写进生词表；三种清除范围之后生词表键**逐字节不变**；用户级清除只删 `quicklang:user:<id>:longterm%` 前缀的键而保留生词表键；反向删掉生词表条目后长期六表逐行 `Debug` 完全不变 |
| §14.2-13 双后端隐私一致 | §14.2 第 885 行 | 上表所有用例的 Memory / SQLite 成对执行 | 同一夹具（`user-Zürich-Ω-1` 五个词 + `user-Zürich-Ω-2` 同词形副本）、同一命令序列，两个后端的隐私断言集合完全相同；seekdb 按范式 `#[ignore]` 预留同一组 |
| 端到端串联 | §12.3 第 830–835 行 | `end_to_end_lifecycle_leaves_no_residue_after_clear` | 普通错误 → 五轮正式会话（每轮把 §2.4 冻结的五张卡全部答完并完成会话）→ 秘密卡 `schedule_step=5`/`interval_days=30`/`mastered_at` 有值/`lapse_count=0` → 指标可读 → 按词清除 → 全局搜索无残留 → 重开数据库后骨架仍在且无原文。串起 #48（普通错误）、#50（会话与作答）、#52（列表/详情/指标）、#51（清除） |

## 3. 敏感值集合与搜索面（为什么"搜不到"不是靠运气）

- **词形集合**包含 7 个形态：原始未规范化拼写（首尾空白 + U+FB01 连字 + 预组合
  重音符）、去空白原始拼写、规范词形（NFC）、NFD 分解形式（`e`+U+0301、`o`+U+0308）、
  以及两种大小写。漏掉任何一个都会让"换一个 Unicode 形态就搜不到"成为假阴性。
- **搜索面**共 6 类：导出文本（含/不含原文）、错误文本（`Display` + `Debug`）、
  事件 payload 与调度快照、列表/首页/会话摘要/结果 DTO 的 `Debug`、
  六表逐行 `Debug`、`ql_app_state` 全量快照（仅用于 §14.2-11 的"零写入"与
  §14.2-14 的独立性）。
- **按范围裁剪**（`secrets_for`）：按词清除后词形也不该剩下；按书清除**保留卡片
  行**（§7.2 第 607 行），所以该范围的标志值是词书名/词条名/来源拼写/原文答案；
  按用户清除额外包含明文 `user_id`、两个词书名与全部公开词形。
- **非空洞证明**：每个范围都断言未被清除的行仍能在导出里搜到公开词形；按用户范围
  改为断言导出仍含 `owner_hash` 且骨架行数不减。

## 4. 覆盖缺口与实现发现

### G1（实现缺口，需 #51 修）：`clear_user` 审计事件仍写明文 `user_id`

§7.2 第 608 行写明"写入的 `clear_user` 事件及用户级 tombstone 同样只保留该不可逆
归属，不保留原 owner ID"。当前实现 `storage-seekdb/src/longterm_clear.rs:60` 的
`cl_audit_event` 对三种范围都写 `user_id: command.user_id`，所以用户级清除之后，
导出的审计事件行里仍有明文 `user_id`。

本文件的处理方式（不伪造通过）：`global_search_after_clear` 的导出扫描把清除动作
自身的审计事件按 `event_id` 摘掉之后再断言零出现，其余任何一行泄漏都会让用例失败；
按用户范围的敏感值集合仍包含明文 `user_id`，所以"审计事件之外零出现"是被真实断言
的。缺口本身记在 `docs/design/0.7/long_learn.md` 的 §6.1 与本报告，归属 #51。

### G2（实现不一致，需 #48 与 #52 对齐）：清除后的重遇只在手动加入路径成立

§7.2 第 606 行"以后重遇使用新 generation"、§3.3 `next_generation`。实测：

- `add_card_manually`（#52）：清除后重遇建 `cleared + 1` 的新 generation
  （`longterm_list.rs` 用例 20 已固定）。
- `record_ordinary_error`（#48）：清除后同一词形再答错返回 `LONGTERM_CLEARED`
  （`longterm_ordinary.rs` 第 405–413 行把"最新行已擦除"也算作 `existing_card`，
  于是 `card.generation <= cleared` 命中）。

本文件按**真实行为**断言：稳定码 `LONGTERM_CLEARED` + 错误文本干净 + 零事件零来源
写入。发布前需要 #48 对齐 #52，或在 §3.3 明确"普通错误不实现重遇"。

### G3（已核对，不是缺口）：导出失败码的分层

§9.1 的 `ExportLongtermDataCommand` 注释说"`LONGTERM_EXPORT_FAILURE` 表示写入未
完成"，而 `longterm_export.rs:143-151` 明确记录了有意的分层：存储层统一用
`LONGTERM_STORAGE_FAILURE`，**IPC 命令**把该码映射成 `LONGTERM_EXPORT_FAILURE`。
用例接受两个码并写明原因。附带条件：`longterm_export_json` 尚未在 `generate_handler`
注册（校对清单 P1），所以这层映射目前无法从 Rust 侧验证。

### 已核对无矛盾的补充

- 清除后的导出按 `owner_hash` 命中 `erased` 骨架（§10.1 可见性），Memory 双实现
  按同一规则实现，两个后端行为一致。
- §7.2 按书清除只擦该书来源与其事件，不擦卡片行；`longterm_clear.rs` 的
  `clear_book_scope_erases_only_that_book_sources` 与本文件一致。
- §7.2 用户级清除只删 `longterm%` 前缀的 `ql_app_state` 键，生词表键不受影响。

## 5. B8 阻断说明（§14.1 第 7 条）

清单 §1 的 B8 是"§14.1 第 7 条（首页/详情/指标/TTS 在 macOS/iOS 一致）依赖 #53"。
本波次的事实与处置：

1. **#53 已在 `855e1db0` 落地今日复习与提前练习 UI**，其中
   `src/ui/src/shared/features/longterm/ReviewSession.tsx` 实现了 §8.4 的播放链：
   `AudioState = idle | playing | failed`、`replay()` 重试、以及第 148 行
   `isCorrect: heard && correct`——**只有确认听到的作答才可能判对**。这是 §14.2-11
   在 UI 层的证据，由 #53-A 的 vitest 用例
   （`tests/unit/ui/longterm-review-session.test.tsx` 等 5 个文件）覆盖。
2. **本代理不执行 npm 测试**（定向测试纪律），因此上述 TS 用例的结果不在本报告的
   验证证据内，只作为"已存在的实现"记录；本文件的 Rust 侧证据覆盖的是 §14.2-11 的
   **可自动化后果**：零事件、零排期变化、条目可重试、技术错误文本干净。
3. **仍然无法自动化的部分，按阻断处理而不是伪造通过**：
   - §8.4 的"权限拒绝 / 设备不可用"需要真实平台权限弹窗与音频设备，Rust 与 jsdom
     都无法构造 → 留在清单 §9 真机清单的"macOS（seekdb）+ 最弱目标 iPhone（SQLite）"
     逐项打勾，由发布前人工验收关闭。
   - §8.4 第 673 行"只有音频成功进入可听播放状态后才允许提交评分"的门禁是 UI 局部
     状态（`heard`/`audio`），`SubmitLongtermAttemptCommand` 没有任何字段承载它，
     Repository 因此**无法**拒绝一次"没听到就提交"的作答。这是契约层面的边界，不是
     漏测：若产品要求后端强制该门禁，需要 §9.1 的 DTO 变更并升版本。建议在 §8.4 补
     一句"门禁在 UI 层，提交命令不携带该信号"。
   - **一个需要产品裁定的口径**：播放失败后 UI 仍允许用户打字提交，此时
     `heard === false` → 该次作答记为 `Again`（进队列尾、一分钟等待、会话不计完成）。
     §8.4 第 671 行的措辞是"保持当前题，允许重试播放或显示可读文本后由用户放弃会话"，
     按字面读，播放失败后提交作答属于"判错"。建议在 §8.4 明确"用户主动提交但无法确认
     已听到时按未答对处理"，否则 UI 与文档需要其中一侧调整。该问题登记在清单 §9。
   - iOS 真机与 seekdb 运行时覆盖仍是 B1/B8 的范围，见清单 §1 与 §9。

## 6. 覆盖缺口清单（与清单 §6.1 对齐）

| 条目 | 状态 | 处置 |
| --- | --- | --- |
| §14.2-11（TTS/技术失败） | **存储与应用层已覆盖**（本文件 2 个用例 × 3 后端）；UI 层由 #53-A 的 TS 用例覆盖；平台权限与真机项按 §5 阻断 | 清单 §6.1 该行可标"已覆盖 + 平台项阻断说明" |
| §14.2-12（不泄露已擦除字段） | **已覆盖**：日志/错误文本扫描、清除后导出+数据库+逐行 `Debug` 全局搜索、事件 payload、DTO `Debug`、原文开关、临时文件、跨用户隔离 | 清单 §6.1 该行的"缺 UI 全局搜索与日志扫描"缺口已关闭 |
| §14.2-14（生命周期独立） | **存储层已覆盖**（生词表键逐字节不变 + 反向不变）；§7.4 第 630–631 行要求的**产品 UI 提示**（清除确认页说明边界）无自动化证据 | UI 文案留在 §9 真机清单 |
| §14.2-13（双后端一致） | 隐私断言在 Memory 与 SQLite 上成对通过；seekdb 12 个 `#[ignore]` | B1 未关闭前不能标"双后端全绿" |
| §12.4 第 841 行（恶意游标、路径穿越、符号链接目标、取消竞态） | 本文件覆盖恶意游标与不可写目的地；**路径穿越、符号链接导出目标、取消竞态**未覆盖（属于导出层 #54 的面） | 建议 #54-B 在 `longterm_export.rs` 补，本文件不越界 |
| §12.4 第 843 行（重放旧 operation ID / 旧 session item / 旧 generation 无法复活） | 由 `longterm_clear.rs` 覆盖；本文件追加"复用已清除 source_id 被拒 + 骨架仍无词形" | 已覆盖 |
| §12.4 第 842 行（用户 A 无法通过 ID/游标/会话/导出读取用户 B 数据） | 导出与详情已覆盖；"通过游标读取他用户数据"由本文件的"为另一 owner 铸造的游标"用例覆盖（`LONGTERM_CURSOR_INVALID`） | 已覆盖 |
| §12.3 第 835 行（清除后的**UI**全局搜索） | 无法自动化：依赖 #53 的搜索入口与渲染 | 留在 §9 真机清单；本文件的 Rust 侧全局搜索已覆盖清除后的全部长期表面 |

## 7. 未自动化项与阻断汇总

1. **seekdb 运行时**：12 个 `#[ignore]`（清单 B1）。
2. **真机 TTS**：权限拒绝、设备不可用、各级回退（清单 §9）。
3. **UI 层全局搜索与清除确认文案**（§12.3 第 835 行、§7.4 第 630–631 行）。
4. **提交门禁的 UI 局部状态**（§5 第 3 条），需要产品/文档裁定。
5. **导出目标的路径穿越、符号链接与取消竞态**（§12.4 第 841 行）——归属 #54。

## 8. 测试命令与完整结果

```
# Memory（默认 feature）
$ CARGO_HOME=$PWD/deps/cache/cargo RUSTUP_HOME=$PWD/deps/cache/rustup \
  PATH=$PWD/deps/cache/cargo/bin:$PATH \
  cargo test --locked --offline -p quicklang-tests --test longterm_privacy
test result: ok. 12 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.02s

# SQLite
$ cargo test --locked --offline -p quicklang-tests --features sqlite --test longterm_privacy
test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.33s

# clippy（两个 feature 组合都是干净通过）
$ cargo clippy --locked --offline -p quicklang-tests --test longterm_privacy -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s)
$ cargo clippy --locked --offline -p quicklang-tests --features sqlite --test longterm_privacy -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s)

$ cargo fmt -p quicklang-tests
```

`--features sqlite` 一次跑完 Memory 12 个 + SQLite 12 个共 24 个；seekdb 的 12 个在
两次运行里都是 `ignored`（`requires real macOS ARM64 seekdb runtime (make init)`），
与 `longterm_clear.rs` / `longterm_list.rs` 的既有范式一致。测试期间 `HEAD` 从
`1a25920a`（本代理开工时）推进到 `855e1db0`（#53 落地），两次运行都在最新 HEAD 上完成。

**并行稳定性**：导出文本扫描会断言夹具目录里没有 `.tmp` 残骸，因此每个夹具目录必须
唯一。第一版用"进程 ID + `SystemTime::now().as_nanos()`"命名，在这台机器上同一批并行
启动的夹具会撞名（20 次里 2 次互相看到对方的临时文件）；改为"进程 ID + 原子计数器"
之后，Memory-only 20 次与 SQLite 20 次连跑全部通过。**并行稳定性**这一条对后续在同
一文件里新增导出扫描的用例同样适用，不要退回按时间戳命名。

## 9. 起止时间

- 开工：2026-10-04 21:35（接替限速失败的 Ling）
- 收尾：2026-10-04 22:40（本地提交 `test(longterm): 隐私安全与端到端验收测试 (#55)`）

## 10. 对共享文档的处置建议（本代理未直接改写）

- `long_learn.md` 的共享追加区由 #55-D 维护，本报告不修改它；上面 §4 的 G1/G2 与
  §5 的裁定项建议由 #55-D 回写到 §6.1 / §8.4。
- 清单 §6.1 的 §14.2-11、§14.2-12、§14.2-14 三行可以引用本文件与用例名更新证据列；
  §1 的 B8 建议按 §5 第 3–4 条改写为"部分关闭 + 平台与 UI 阻断说明"。