# 0.7 长期学习性能基准报告与发布开关载体（#55-B）

> 权威依据：`docs/design/0.7/long_learn.md` §11.2（数据规模，第 782–789 行）、
> §11.3（指标，第 793–800 行）、§6.1（正式到期选卡）、§8.2（错题本与详情）、
> §8.3（统计口径）、§5.2（普通错误原子事务）、§5.6-3（正式选卡由后端执行）、
> §10.1（JSON 导出）、§13（分阶段发布与开关，第 845–854 行）。
> 配套：`docs/design/0.7/long_learn_release_checklist.md` §8（基准报告口径）、
> §1 阻断项 **B4**（功能开关无载体）与 **B9**（无基准设施）、§2.0（开关矩阵）。
>
> 本文件由 #55-B 产出，只新增、不修改 `long_learn.md`。它是清单 §8 与 §1 B4/B9
> 的落地证据；清单位置本身的勾选由 #55-D/#55 汇总时回填。

## 1. 交付物

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `tests/rust/benches/longterm_bench.rs` | 2153 | `harness = false` 自定义基准：固定种子数据集生成器 + 16 项测量 + markdown 数字表 |
| `src/crates/storage-seekdb/src/longterm_flags.rs` | 630 | §13 本地功能开关的存储载体 + 门控 API + 11 个单测（清单 B4） |
| `tests/rust/Cargo.toml` | +9 | 只追加 `rusqlite` dev-dependency 与一个 `[[bench]]` 块 |
| `src/crates/storage-seekdb/src/lib.rs` | +3 | 只追加 `pub mod longterm_flags;` 及其注释 |

`tests/rust/Cargo.toml` 与 `src/crates/storage-seekdb/src/lib.rs` 都是并行代理的共享
热点，本次只做**追加**，未改动任何既有条目（无重排、无删除、无重命名）。

## 2. 数据集构造方式与规模

### 2.1 可复现性

- **种子**：`QUICKLANG_BENCH_SEED`，默认 `5500550`。
- **随机源**：文件内自带的 SplitMix64（`Rng`，`tests/rust/benches/longterm_bench.rs`
  的 `mod bench` 段），不依赖 `rand` 或任何第三方 crate，因此跨机器、跨 crate
  版本逐字一致。
- **注入时钟**：`BENCH_NOW = 1_800_000_000_000`。所有业务时间都是这个固定瞬时或其
  偏移，**不读系统当前日期**（§11.1 第 789 行"所有业务测试使用注入时钟和固定随机
  输入，不依赖系统当前日期"）。
- **规模可缩放**：`QUICKLANG_BENCH_CARDS` / `QUICKLANG_BENCH_EVENTS` / `QUICKLANG_BENCH_ITER`。
  默认即 §11.2 要求的 2 万卡 / 100 万事件 / 200 次迭代；冒烟规模按同一构成等比
  缩放，且**事件行总数精确等于**请求值（`mix_counts` 用 `i128` 吸收舍入误差，
  `assert_eq!(total, events)` 锁死，冒烟规模 `events` = 2000/5000/20000/100000
  与默认 1000000 均已实测通过）。

### 2.2 播种方式与其边界

100 万条事件**不经** `LongtermStorage::write_event` 写入：那条路径每条事件要付
6 条语句的幂等检查与 §4.7 逻辑外键校验（#47 契约不允许跳过），那样测的是写入而
不是查询。播种走 `rusqlite` 的**绑定参数**批量 `INSERT`，逐字段复刻
`src/crates/storage-seekdb/src/longterm.rs` 的 `*_insert_sql` 编码与
`src/crates/storage-seekdb/src/longterm_clear.rs` 的擦除语句形态。**所有被测操作
仍走真实 Repository 入口**；播种只保证数据集自洽，不参与任何性能口径。

播种连接用 `PRAGMA synchronous=OFF`（只造数据），被测写事务走 Repository 自己的
连接（`synchronous=FULL`），所以 §13 各阶段的持久性口径不受影响。

### 2.3 §11.2 四条"缺一不可"的落点

| §11.2 要求 | 数据集里的落点 |
| --- | --- |
| 单用户 2 万张当前卡片 | `cards=20300`：2 万张当前可见 + 300 张清除后擦除骨架 |
| 多来源共享卡、暂停/删除来源、多 generation | 40 460 条来源、每卡 1–3 个；5% 删除、10% 暂停；8% 卡片无有效来源（§4.2 保留历史但不进选卡）；300 张卡片是 §3.3 清除后 generation 重遇（当前 generation 2，generation 1 为擦除骨架 + 墓碑） |
| 100 万条事件，含普通错误、正式/提前评分和清除边界 | `events=1000000`，构成见 §2.4；`ClearWord`/`ClearBook`/`ClearUser` 三类构成清除边界 |
| 足够的活动/完成会话及 session item | 9 000 个会话（7 000 正式 + 2 000 提前），其中 1 个 active 正式会话供 §6.4 恢复路径读取，300 个被放弃；160 000 条 session item |

事件时间**均匀分布在最近 400 天**（`HISTORY_DAYS`），对任何窗口都不做偏置。于是任一
30 日窗口恰好含 7.5% 的事件 = 75 000 条——这是 `get_metrics` 的真实工作量。

### 2.4 事件构成（合计恰好 1 000 000）

| `event_kind` | 条数 | 说明 |
| --- | --- | --- |
| `ordinary_error` | 617 170 | §5.2 普通背诵错误 |
| `formal_attempt` | 180 000 | §6.2 正式评分 |
| `early_attempt` | 70 000 | §6.2 提前练习评分 |
| `manual_add` | 40 000 | §8.2 手动加入 |
| `source_link` | 30 000 | §4.2 来源关联 |
| `source_unlink` | 30 000 | §4.2 来源解除 |
| `lifecycle_pause` | 15 000 | §7.1 来源暂停 |
| `lifecycle_resume` | 15 000 | §7.1 来源恢复 |
| `clear_book` | 2 000 | §7.2 按书清除（已擦除审计行） |
| `session_abandon` | 300 | §6.4 会话放弃（每个被放弃会话恰好一条） |
| `clear_word` | 300 | §7.2 按词清除（已擦除审计行，每张被按词清除的卡片一条） |
| `clear_user` | 200 | §7.2 按用户清除（已擦除审计行） |

后两类计数由数据集规模本身推导而非固定比例（`plan_counts` 与 `skeletons`），差额
由普通错误吸收，因此上表合计精确等于 1 000 000。

### 2.5 自洽性断言（防止测了一份坏数据）

播种后、任何计时之前，`verify_dataset` 用真实 Repository 断言：错题本能填满一页
50 行；`due_today > 0`；`30 日易错 > 0`；`mastered_count > 0`；热卡详情能解析、
来源非空、时间线 ≤ 50 条；热卡的会话作答非空。任一条不成立即 panic，基准失败。

## 3. 基准数字

### 3.1 阈值与判定口径

- 查询类（首页指标、错题本首屏/翻页、详情、时间线、会话作答）：§11.3 第 1 条
  P95 `< 200 ms`。
- 提交类（正式选卡、普通错误、正式/提前评分）：§11.3 第 2 条 P95 `< 300 ms`。
- 导出：§11.3 第 4 条**无交互式阈值**，报告吞吐、峰值内存、文件大小。
- p50/p95 用最近秩法（§11.2 只要求 p50/p95，未规定插值口径）。
- 计时边界（§11.3 第 795–796 行）：计时器包住 Repository 调用本身——从业务层
  调用开始到事务提交并形成响应结束，不含 TTS 播放与 UI 动画。
- 报告 p50/p95/最小/最大/均值与迭代数，**不只报最快一次**（§11.2 第 789 行）。

### 3.2 运行顺序（影响数字，必须与复现一致）

查询全部先跑，提交后跑，导出再跑，最后才是会改写数据集的压力变体。原因：

1. 提交类基准会新增行（正式选卡每次留一个被放弃的会话，普通错误每次推进
   `ql_app_state` 版本并重置卡片排期），先跑查询可以得到未被写路径扰动的读数字。
2. 数据集里那个 active 正式会话在提交基准开始前被放弃——否则 §6.4 的 resume
   语义会让"正式选卡"退化成纯读取，测不到 §6.1 的候选加载。
3. 导出必须在压力变体之前：压力变体会把所有活跃事件的 `occurred_at` 压进最近
   30 日，改写数据集。

`正式选卡` 的计时区只含"候选加载 + `select_due_cards` + 冻结写入"；紧随其后的
`abandon` 是让下一轮能重新选卡的准备动作（§6.4 至多一个 active 正式会话），**不
计入**该项。`submit_longterm_attempt` 用**显式选组**创建会话，把 §6.1 的候选加载
成本排除在评分口径外——它由上一项单独测量。

### 3.3 数字表

下表即基准程序直接输出的 markdown（`QUICKLANG_BENCH_REPORT` 写出的内容原样内联，
因为 `build/` 被 `.gitignore` 忽略，报告必须自带数字才能追溯）。

<!-- BENCH_TABLE_START -->

### 基准数字（§11.2 第 789 行报告口径）

| # | 操作 | 口径 | 迭代 | p50 (ms) | p95 (ms) | 最小 (ms) | 最大 (ms) | 均值 (ms) | 阈值 (ms) | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | get_metrics（首页指标，全量重算 2 万卡） | §8.3 四字段 + §8.1 今日到期；热缓存，30 日窗口占数据集 7.5% | 200 | 167.32 | 191.48 | 159.25 | 207.90 | 170.47 | < 200 | 达标 |
| 2 | list_cards 首屏 · 最近答错 | 全部筛选，limit=50，无游标 | 200 | 21.51 | 23.87 | 20.65 | 36.63 | 21.78 | < 200 | 达标 |
| 3 | list_cards 翻页 · 第 100 页 · 最近答错 | 全部筛选，limit=50，keyset 游标已在约 4950 张之后 | 200 | 20.17 | 23.37 | 19.47 | 36.05 | 20.83 | < 200 | 达标 |
| 4 | list_cards 首屏 · 到期时间 | 全部筛选，limit=50，无游标 | 200 | 20.67 | 22.50 | 19.89 | 36.02 | 20.92 | < 200 | 达标 |
| 5 | list_cards 翻页 · 第 100 页 · 到期时间 | 全部筛选，limit=50，keyset 游标已在约 4950 张之后 | 200 | 19.54 | 23.04 | 18.38 | 38.24 | 20.18 | < 200 | 达标 |
| 6 | list_cards 首屏 · 错误次数 | 全部筛选，limit=50，无游标 | 200 | 1922.13 | 2065.46 | 1837.99 | 2172.46 | 1937.15 | < 200 | 未达标 |
| 7 | list_cards 翻页 · 第 100 页 · 错误次数 | 全部筛选，limit=50，keyset 游标已在约 4950 张之后 | 200 | 2784.86 | 2895.39 | 2708.94 | 3094.36 | 2796.92 | < 200 | 未达标 |
| 8 | list_cards 首屏 · 已到期筛选 | §6.1 可见性：active 卡 + 至少一个 active 来源 + 不在 active 正式会话 | 200 | 21.19 | 24.65 | 19.96 | 27.16 | 21.62 | < 200 | 达标 |
| 9 | get_card_detail（时间线 50 条 + 全部来源） | 轮换 64 张卡片；每轮 3 条语句（卡片 / 来源 / 时间线） | 200 | 0.21 | 0.33 | 0.16 | 5.61 | 0.28 | < 200 | 达标 |
| 10 | card_session_answers（热卡 · 8 个会话条目） | §8.2 相关会话作答；每个条目 3 条语句（会话 / 条目 / 该条目作答） | 200 | 0.74 | 0.81 | 0.73 | 1.03 | 0.75 | < 200 | 达标 |
| 11 | list_card_events 翻页（热卡 · limit=50） | §8.2 时间线游标；`occurred_at DESC, event_id ASC` | 200 | 0.09 | 0.09 | 0.09 | 0.12 | 0.09 | < 200 | 达标 |
| 12 | 正式选卡（候选加载 + select_due_cards + 冻结写入） | §6.1 空选：4 条候选语句与候选卡数无关，取组大小 20；放弃不计入 | 200 | 35.24 | 39.57 | 32.90 | 47.79 | 35.77 | < 300 | 达标 |
| 13 | record_ordinary_error（跨 ql_app_state 与六表单事务） | §5.2 全原子提交；轮换 64 张卡片，app-state 版本逐轮推进 | 200 | 0.44 | 0.53 | 0.39 | 10.01 | 0.55 | < 300 | 达标 |
| 14 | submit_longterm_attempt · Formal · Good | §6.2/§6.3 条目 CAS + 排期推进 + 事件写入同一事务；每组 5 条 | 200 | 0.50 | 0.68 | 0.45 | 8.43 | 0.66 | < 300 | 达标 |
| 15 | submit_longterm_attempt · Early · Good | §6.2/§6.3 条目 CAS + 排期推进 + 事件写入同一事务；每组 5 条 | 200 | 0.40 | 0.46 | 0.36 | 7.72 | 0.51 | < 300 | 达标 |
| 16 | get_metrics · 压力变体（30 日窗口灌满全部活跃事件） | 不是 §11.2 固定数据集；30 日易错=652701，db 799928320 → 813424640 字节 | 30 | 1813.10 | 1927.89 | 1784.68 | 2046.68 | 1828.58 | < 200 | 未达标 |

### 数据集、种子与环境

| 项 | 值 |
| --- | --- |
| 数据生成种子 | `5500550`（SplitMix64） |
| 用户 | `bench-user`（§11.2 单用户） |
| 卡片行 | 20300（当前可见 generation 卡片 20000 + 清除后擦除骨架 300） |
| 来源行 | 40460（多来源共享卡、5% 删除、10% 暂停、8% 卡片无有效来源） |
| 会话 | 9000（1 个 active 正式会话供恢复，其余完成/放弃） |
| session item | 160000 |
| 事件 | 1000000 |
| 墓碑 | 300（词级 generation 1 → §3.3 重遇到 generation 2） |
| 数据库字节 | 797290496 |
| 播种耗时 | 47.78 s |
| 到期候选池 | 7013 张 |
| 注入时钟 | `1800000000000`（业务时间不读系统日期，§11.1） |
| 每项迭代数 | 200 |
| 缓存状态 | 热（重复迭代，OS 页缓存已填充）。冷缓存需 `sudo purge` 后单跑，未在本表计入（§报告 §冷/热） |
| 指标校验 | due_today=7008 mastered=2340 30 日易错=49096 7 日首次正确率=Some(0.8045571245186136) |
| 墙钟总时长 | 1431.8 s |

### 导出（§11.3 第 4 条：流式、可取消、内存有界）

| 项 | 值 |
| --- | --- |
| 状态 | 成功 |
| 六表计数 | cards=20300 sources=40460 events=1000767 sessions=9274 session_items=164370 tombstones=300 |
| 耗时 | 3.51 s |
| 文件大小 | 756554541 字节 |
| 吞吐 | 285031 事件/秒 |
| 导出前 RSS | 751248 KiB |
| 导出峰值 RSS | 751648 KiB |
| 导出增量峰值 | 400 KiB |

<!-- BENCH_TABLE_END -->

### 3.4 环境

| 项 | 值 |
| --- | --- |
| 设备 | Apple M2 Max（12 核，64 GiB） |
| 架构 | `aarch64-apple-darwin` |
| 系统 | macOS 27.0.1（Build 26A434） |
| 工具链 | `rustc 1.93.1 (01f6ddf75 2026-02-11)`，LLVM 21.1.8 |
| 构建配置 | `--release`（bench profile），`quicklang-tests --features sqlite` |
| 后端 | SQLite（`rusqlite 0.37` bundled）；**seekdb 运行时未就绪，见 §6** |
| 缓存状态 | **热**（重复迭代，OS 页缓存已填充） |
| 数据库体积 | 797 290 496 字节（约 760 MiB） |

### 3.5 冷/热缓存（§11.2 第 789 行要求报告，此处是未说明项）

上表是**热缓存**数字。冷缓存数字**未采集**：macOS 上驱逐页缓存需要
`sudo purge`，本次基准运行没有该权限，因此不伪造冷缓存数字。可复现命令：

```text
sudo purge && <上面的 cargo bench 命令，且 QUICKLANG_BENCH_ITER=1>
```

`QUICKLANG_BENCH_ITER=1` 是必要的：purge 之后第一次读会重新填充页缓存，只有
单次迭代的数字才是冷缓存口径。这一点在 §14.1 第 10 条"无未说明的跳过项"下属
**已说明的未采集项**，不是未说明的跳过项。

## 4. 与 §11.3 阈值的对比结论

<!-- VERDICT_START -->
**总判定：§11.3 的查询类阈值 16 项中 14 项达标，2 项未达标；提交类 4 项全部达标；
导出无交互式阈值，流式与内存有界已达标。**

| 类别 | 项数 | 达标 | 未达标 | 说明 |
| --- | --- | --- | --- | --- |
| 查询（§11.3 第 1 条，P95 < 200 ms） | 12 | 10 | **2** | 两项都是 `list_cards` 的 `ErrorCount` 排序 |
| 提交（§11.3 第 2 条，P95 < 300 ms） | 4 | 4 | 0 | 正式选卡 p95 39.57 ms；普通错误 0.53 ms；正式评分 0.68 ms；提前评分 0.46 ms |
| 导出（§11.3 第 4 条） | 1 | 1 | — | 3.51 s / 756 554 541 字节 / 285 031 事件每秒 / 峰值 RSS 增量 **400 KiB** |

**未达标项（唯一的确证瓶颈）**

| 项 | p50 | **p95** | 阈值 | 超标倍数 |
| --- | --- | --- | --- | --- |
| `list_cards` 首屏 · 错误次数 | 1922.13 ms | **2065.46 ms** | < 200 ms | **10.3×** |
| `list_cards` 翻页 · 第 100 页 · 错误次数 | 2784.86 ms | **2895.39 ms** | < 200 ms | **14.5×** |

翻页比首屏更贵（1.40×），因为 keyset 谓词里第三次重复了同一个错误次数子查询——
见 §5.1 的取证与优化建议。**这一项按 §11.3 第 800 行"不得靠漏写事件、异步化要求原子的
事务或改变统计口径达标"处理：本次没有为了让它达标而改动任何实现，而是先查索引、
查询计划与批量读取，把瓶颈定位到具体子句并给出可执行的优化方案。**

**贴边但达标的一项（需在真机复测时重点关注）**

`get_metrics`（首页指标）p95 **191.48 ms**，阈值 200 ms —— **余量只有 4.3%**，且最大值
207.90 ms 已经越过阈值。这项在 §11.2 固定数据集上判定为达标，但：
- 它是唯一随**事件总量**线性增长的查询（30 日窗口占数据集 7.5% = 7.5 万条）；
- §11.3 第 793 行要求的最弱目标 iPhone 会比这台 M2 Max 慢得多，**iPhone 一侧几乎
  可以确定不达标**；
- §5.2 的压力变体显示斜率：30 日窗口装下全部 100 万事件时 p95 达 1927.89 ms。

建议把这一项视为**条件达标**，与 `ErrorCount` 一并纳入 #55 的收尾工作，并在清单
§9 的最弱目标 iPhone 真机清单里把"首页指标"单列为必测项。

**与 issue #55 验收标准第 3 条的关系**

issue #55 要求"性能基准达到文档阈值，无随数据量失控的查询"。当前状态：
- 提交路径全部达标且**无随数据量失控的查询**——四项提交在 2 万卡/100 万事件下都是
  亚毫秒到几十毫秒量级，正式选卡的候选加载是 4 条与卡数无关的语句（§6.1 的设计
  意图在数字上得到验证：200 次迭代 p95 稳定在 39.57 ms，没有随已冻结会话数增长）。
- **查询侧尚有 2 项未达标**，因此 §14.1 第 9 条与 issue #55 第 3 条**不能按"已
  达标"关闭**，应记为"有明确阻断说明 + 优化方案已给出"（§5.1 首选方案可把该项拉回
  20 ms 量级，有一个数量级的余量）。


<!-- VERDICT_END -->

## 5. 瓶颈与优化建议

### 5.1 `list_cards` 的 `ErrorCount` 排序 —— **未达标，且是唯一的确证瓶颈**

这是本次基准唯一的一类 P95 超阈值项，且**严重超阈值**：首屏 p95 2065 ms（10.3×）、
深页 p95 2895 ms（14.5×），见 §3.3 数字表的第 6、7 行。
§11.3 第 800 行要求"不达标先查索引、查询计划和批量读取"，下面是按这个顺序做的取证。

**取证方法**：在同一数据集上用 `EXPLAIN QUERY PLAN` 与逐条消融计时，把成本拆到
具体子句。先在 2 万卡 / 10 万事件上定位（迭代快、斜率已经暴露），再在完整的
2 万卡 / **100 万事件**上复核。

**(a) 查询计划**——`ErrorCount` 的排序键是一个相关标量子查询，SQLite 无法用索引
满足 `ORDER BY`，因此退化为临时 B 树全排序：

```text
|--SEARCH c USING INDEX idx_longterm_card_mastered (user_id=?)
|--CORRELATED SCALAR SUBQUERY 2   -- 墓碑 guard
|  `--SEARCH t USING COVERING INDEX idx_longterm_tombstone_card (...)
|--CORRELATED SCALAR SUBQUERY 3   -- 错误次数（ORDER BY 的 rank 半）
|  `--SEARCH e USING INDEX idx_longterm_event_card (user_id=? AND card_id=? AND generation=?)
|--CORRELATED SCALAR SUBQUERY 4   -- 错误次数（ORDER BY 的 key 半）
|  `--SEARCH e USING INDEX idx_longterm_event_card (...)
|--CORRELATED SCALAR SUBQUERY 1   -- 错误次数（投影）
|  `--SEARCH e USING INDEX idx_longterm_event_card (...)
`--USE TEMP B-TREE FOR ORDER BY
```

计划本身是健康的：三个事件子查询都走了 `idx_longterm_event_card`，墓碑 guard 走了
覆盖索引，**没有全表扫描，也没有缺索引**。§11.3 第 800 行要求的"先查索引"这一步的
结论是：**索引不是瓶颈**。

**(b) 逐条消融计时（完整 1M 事件数据集，`sqlite3` CLI，同一台机器）**

| 变体 | 排序键 | 耗时 | 相对线上 |
| --- | --- | --- | --- |
| A | 相关子查询 ×3（**线上形态**） | 1.84 / 1.86 s | 1.0× |
| G | CTE 预聚合 + 完整三次重复形状 | 1.51 / 1.53 s | 0.82× |
| M | 同形状、排序键换成**存储列** `lapse_count` | 0.02 / 0.02 s | **0.011×** |
| N | 存储列 + 深页 keyset 谓词 | 0.02 / 0.02 s | **0.011×** |

M 与 N 保留了 §8.2 的完整排序形状（`CASE WHEN … THEN 1 ELSE 0 END` 的 rank 半 +
`COALESCE(-…)` 的 key 半 + `(card_id, generation)` 兜底键），只把排序键从子查询换成
一列。

**结论**：**把排序键物化成列 → 1.84 s 降到 0.02 s，92 倍**，首屏与深页都回到阈值
内且有一个数量级以上的余量。成本几乎全部来自"排序键不是存储列"，而不是来自重复
次数——三次重复相对一次只贵约 1.4×（10 万事件下 0.18 s → 0.25 s）。

根因是 `ll_error_count_expr`（`src/crates/storage-seekdb/src/longterm_list.rs`
第 533–541 行）不是列：`ORDER BY` 用不了
`idx_longterm_card_due (user_id, state, due_at, card_id, generation)`，只能
`USE TEMP B-TREE FOR ORDER BY` 对全部 2 万行排序，排序过程中**每行**都要跑一次
相关子查询。

**(c) 随数据量的斜率（这是 issue #55 "无随数据量失控的查询" 的直接反证）**

| 事件总量 | 相关子查询内层触碰行数 | 每卡平均事件数 | 该项 p95 |
| --- | --- | --- | --- |
| 10 万 | 61 451 | 3.07（最多 11） | 约 250 ms |
| 100 万 | 617 201 | 30.86（最多 58） | **2065 ms** |

内层触碰行数与事件总量**精确 10 倍**，耗时也近似 10 倍——成本与数据量**线性**而非常数。
翻页比首屏贵 1.40×（p95 2895 ms vs 2065 ms），因为 keyset 谓词里第三次重复了同一个
子查询。

**优化建议（按 §11.3 第 800 行"先查索引、查询计划和批量读取"，逐条对应）**：

1. **首选：物化排序键。** 给 `ql_longterm_card` 增加一列（例如 `error_count`），
   在**写入路径**递增维护——与 `lapse_count` 完全同构（`lapse_count` 已经是
   §6.3 维护的物化计数器，见 §4.1）。消融变体 M/N 已在**完整 1M 数据集**上实测：
   同样的 `ORDER BY` 形状 + 同样的深页 keyset 谓词都是 0.02 s，**92 倍差距**。
   口径不变（仍是"本 generation 的 `ordinary_error` 计数 + `lapse_count`），
   不违反 §11.3 第 800 行的红线。
   - 代价：`ql_longterm_card` 多一列，六表 DDL 需同步（§4.8 的 DDL 落地映射），
     `record_ordinary_error` 与 `submit_longterm_attempt` 各加一次递增。
   - 风险点：清除（§7.2）擦除卡片时该列必须一并归零/置 `NULL`，否则擦除后的计数
     可能通过墓碑外的路径泄漏；这条要写进 #51 的擦除断言。
   - 另一处要检查：`get_metrics` 的 `thirty_day_error_count` 是**有窗口**的口径，
     与这个**无窗口**的排序键不是同一个数，不能互相复用；物化列只服务 §8.2 的排序。
2. **次选（不改 DDL 的过渡方案）：预聚合 + 回表连接。** 把错误次数先算成每
   `(card_id, generation)` 一行的临时结果再连接：
   `WITH ec AS (SELECT card_id, generation, COUNT(*) n FROM ql_longterm_event WHERE … GROUP BY card_id, generation)`。
   **注意：在 10 万事件下它看起来很有效（0.00–0.16 s），但在完整 1M 数据集上只有
   1.51 s（线上 1.84 s 的 0.82×）——几乎无效**，因为聚合本身要扫 61.7 万行事件，
   而 `USE TEMP B-TREE FOR ORDER BY` 的 2 万行排序一分没省。
   **结论：这一条单独做不足以达标**，价值只在于给方案 1 争取时间，并顺带证明
   "批量读取"这一路的天花板就在 1.5 s 量级。
3. **不建议：加索引。** 计划已确认三个子查询都命中 `idx_longterm_event_card`，
   再加索引对"排序阶段每行求一次计数"这个形态无效。§11.3 第 800 行的"查索引"
   这一步已经做完，结论是索引不是瓶颈。
4. **不建议：改口径或改默认值。** 例如把 `ErrorCount` 排序改成"30 日窗口计数"或
   只按 `lapse_count` 排，都会触碰 §8.2/§8.3 的口径与 #52 的游标稳定性论证
   （清单 §6.3 第 2 项尚未裁定），且属于 §11.3 第 800 行明令禁止的"改变统计口径
   达标"。方案 1 不需要任何口径改动，因此是唯一推荐路径。

**旁证**：`DueAt` 与 `LastErrorAt` 两种排序在同一数据集上都是 20 ms 量级
（p95 22.50 / 23.37 ms），因为它们的排序键是存储列，`ORDER BY` 能走索引、无临时
B 树排序。这反证了瓶颈定位：只有 `ErrorCount` 一条排序的键不是列。

`DueAt` 与 `LastErrorAt` 两种排序**天然达标**（上表 20 ms 量级），因为它们的排序键
是存储列，`ORDER BY` 能走索引、无临时 B 树。这也反证了瓶颈定位：只有
`ErrorCount` 一条排序的键不是列。

### 5.2 `get_metrics` 的 30 日窗口扫描斜率 —— §11.2 固定数据集内达标，但斜率已贴边

`get_metrics`（§8.3）在 §11.2 固定数据集上 p95 191.48 ms，判定达标，但余量只有
4.3%（见 §4）。上表第 16 行另外给了一个**压力变体**作为规模化暴露：把全部活跃事件的
`occurred_at` 压进最近 30 日（30 日窗口装下 100 万条事件，而不是 400 天均匀分布下的
7.5 万条），此时 p50 1813.10 ms、p95 **1927.89 ms**——**约 10 倍**。

这**不是** §11.2 要求的数据集，报告它是为了暴露斜率而不是为了宣称失败：
`mm_window_events`（`src/crates/storage-seekdb/src/longterm_metrics.rs` 第 438–446 行）
把窗口内的每一行 `ordinary_error` / `formal_attempt` 全量物化成
`Vec<MetricEvent>` 再交给纯函数 `mm_metrics` 聚合，成本与窗口内事件数线性相关。
真实用户的历史会自然向最近 30 日堆积，所以这条曲线的斜率比它的截距更值得关心。

**优化建议（不改口径）**：两个窗口的聚合都可以下推到 SQL——`ordinary_error` 的
30 日计数是一条 `COUNT(*)`；首次正确率按 §8.3 是"每个
`(session_id, card_id, generation)` 在 7 日窗口内的第一次 `formal_attempt` 中 good
的比例"，可以由
`GROUP BY session_id, card_id, generation` 取 `MIN(occurred_at)` 对应的那一行的
`attempt_result` 得到。这两条都不改变 §8.3 的口径定义，因此不触碰 §11.3 第 800 行
的红线；纯函数 `mm_metrics` 保留作为口径的可执行规范与回归基线（固定数据集测试
继续直接调用它），只在 Repository 加载层换成聚合查询。**建议 #55-A 按此方向开一个
子项**，并保持 `mm_metrics` 的现有单测不变以证明口径没动。

### 5.3 `card_session_answers` 的 N+1（观察项，未超阈值）

`ll_card_session_answers`（`src/crates/storage-seekdb/src/longterm_list.rs`
第 990 行起）对每个会话条目发 3 条语句（会话 / 条目 / 该条目作答）。本数据集的热卡
有 8 个条目，p95 0.81 ms，远在阈值内。但**条目数与该卡历史会话数成正比**，而热卡的
上限没有被任何 §11.2 约束：本数据集刻意让卡片**均匀**分布（每卡平均 50 条事件、
最多 58 条）以贴近真实用户，而 §12.2 的"跨词书共享 + 反复出错"场景会造出条目数高
一个数量级的卡片。按当前 0.1 ms/条目的斜率，100 个条目约 10 ms、1000 个条目约
100 ms——**在 §11.2 数据集上不构成风险，属于需要真机用例确认的观察项**。

**优化建议**：把"该卡参与的会话"一次性取回后，用 `GROUP BY session_id` 的聚合
替代逐条目查询；或者给 `ql_longterm_session_item` 的
`uk_longterm_session_item_identity (session_id, card_id, generation)` 加一条
`(card_id, generation)` 前缀索引，让"取该卡的全部条目"变成一次索引扫描而非每会话
一次。建议在 #55 的真机环节（清单 §9）用"单卡 100+ 会话"的人工用例复测后再决定
是否需要改。

### 5.4 导出（§11.3 第 4 条）—— 流式与内存有界已达标

见上表导出段。要点：

- **流式**：`ex_export_longterm_data` 按 `EX_BATCH_ROWS` 分批取行，写入同目录
  临时文件后 `fsync` + 原子改名（§10.1-④/⑤）。本次实测 3.51 s / 756 554 541 字节 /
  285 031 事件每秒。
- **可取消**：§10.1 的失败注入钩子（`set_export_failure_stage`）由 #54 的契约
  `tests/contract/longterm_export.rs` 覆盖，不在本次基准范围内。
- **内存有界**：导出前 RSS 751 248 KiB → 峰值 751 648 KiB，**增量 400 KiB**。
  这就是"内存有界"的直接证据：导出 100 万条事件（文件 756 554 541 字节 ≈ 722 MiB）
  只让常驻内存涨了 400 KiB，且这个增量**不随事件总数线性增长**（10 万事件规模下
  同样是 400–752 KiB 量级，而事件量涨了 10 倍、文件从 158 MiB 涨到 722 MiB）。
- 峰值 RSS 由一个 20 ms 间隔的采样线程轮询 `ps -o rss=` 得到（macOS 没有
  `/proc/self/status`）。采样间隔对秒级操作足够，但对更短的操作会低估峰值——
  导出是秒级，不受影响。

### 5.5 不改口径的红线遵守情况（§11.3 第 800 行）

本次**没有**为了让数字达标而改动任何实现、任何统计口径、任何事务边界：

- 没有漏写事件：数据集按 §4.7 覆盖 `event_kind` 全枚举，评分事件的每个
  `session_item_id` / `source_id` 都指向真实存在的行（否则 §4.7 校验会拒绝）。
- 没有异步化要求原子的事务：`record_ordinary_error` 仍是一个跨 `ql_app_state` 与
  六表的单事务，计时器包住整个提交。
- 没有改变统计口径：`thirty_day_error_count` 与 `seven_day_first_attempt_good_rate`
  都由 `mm_metrics` 按 §8.3 原样产出；§5.2 的优化建议明确保持口径不变。
- 基准文件不修改任何生产代码路径。

## 6. 后端覆盖与未覆盖项（明确说明，不伪造通过）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| SQLite（iOS 同款） | **已测**，数字见上表 | `--features sqlite`，`rusqlite 0.37` bundled |
| seekdb（macOS 运行时） | **未测**，按 `#[ignore]` 范式预留 | `deps/cache/seekdb-runtime` 未就绪（`make init` 未执行）。清单 B1 同一阻断。基准入口已按 `tests/contract/longterm_list.rs` 的 `seekdb_harness` 范式留好：去掉 `--features sqlite` 后用 `SeekDbEmbeddedAdapter::open_with_runtime` 打开同一份数据集；不伪造通过结论 |
| 最弱目标 iPhone 真机 | **未测** | 需要真机；属清单 §9（#55-C）人工清单范围 |

因此本报告的结论只在 **代表性 Mac + SQLite 后端** 上成立。§11.3 第 793 行要求
"在发布支持的代表性 Mac 与最弱目标 iPhone 上"，iPhone 一侧仍需清单 §9 的真机
复测；seekdb 一侧与 B1 合并处理。

## 7. B4：§13 本地功能开关载体

### 7.1 问题与选型

清单 §0.1 第 28 行记录：`src/**` 对 `feature_flag` / `featureFlag` /
`longterm_enabled` **零命中**，§13 第 847 行的"本地功能开关"没有实现载体。

选型评估：

| 候选 | 结论 |
| --- | --- |
| `ql_user_settings`（既有设置体系） | **不合适**。`setting_identity`（`src/crates/storage-seekdb/src/user_settings.rs` 第 8–33 行）是按用户维度的**用户偏好**（背诵次数、听写间隔、翻译模型），会在 `app_state_list` 里被当作偏好迁移出去。开关是发布控制：§13 的回滚是**全量**决定，不该落在"某个用户的偏好"里 |
| `ql_app_state`（既有应用状态表） | **采用**。owner-scoped key、无 DDL、复用既有事务边界，键名**故意不匹配** `setting_identity` 白名单，因此不会被迁移进偏好表（有单测锁死） |
| 新建表 / DDL | **拒绝**。`speech_preferences` 的注释已记录 seekdb 重开库时执行 DDL 会卡顿（"seekdb's reopened-database DDL stall"），发布开关不值得为它冒这个险 |

### 7.2 载体与 API

`src/crates/storage-seekdb/src/longterm_flags.rs`，键
`quicklang:user:{user_id}:longterm-release-flags`，值是
`{"longtermWrite":bool,"longtermEntry":bool,"longtermExport":bool}`：

| API | 作用 |
| --- | --- |
| `LongtermReleaseGate::read(user_id)` | 读三个开关；**行不存在 = 默认全开** |
| `LongtermReleaseGate::write(user_id, flags)` | 一个事务里写入，返回已提交的值 |
| `LongtermReleaseGate::clear(user_id)` | 删行，回到默认（§13 阶段 4 保留重新开启的路径） |
| `LongtermReleaseGate::allows_write/entry/export(user_id)` | 三个作用面各自的门控查询 |
| `SeekDbEmbeddedAdapter::longterm_release_flags(user_id)` | `read` 的简写 |
| `LongtermFlags::{stage1,stage2,stage3,rolled_back,fully_off}` | 清单 §2.0 开关矩阵的每个格子 |
| `ReleaseStage` | 由开关组合反推 §13 阶段，让 §2.1–§2.4 的勾选可机械核对 |

开关**互相独立**是刻意的：清单 §4.2 step 1 要求回滚时**先**关
`longterm_entry` 与 `longterm_export`、**再**关 `longterm_write`，"先关入口，避免关闭
期间产生半新半旧数据"。单一枚举阶段表达不了这个顺序，所以是三个独立布尔。

### 7.3 失败策略（为什么不用"读不出来就按默认值"）

存在但解析不出的行返回 `LONGTERM_STORAGE_FAILURE`（不可重试），**不**在两个方向上
猜：

- 猜"已开启"：运维已经关掉的开关会被重新打开，回滚期间继续写长期行。
- 猜"已关闭"：普通背诵会无声地不再记录，用户看不到解释。

§13 第 854 行明确"若长期存储不可用且功能仍开启，必须阻止前进而不是静默降级"，
同样的原则适用于开关本身。响亮失败让两种情况都可见。这与
`speech_preferences` 的"malformed metadata fails closed"先例一致。

`LongtermFlags` 带 `#[serde(deny_unknown_fields)]`：更高版本写入的额外键必须响亮
失败，而不是被静默忽略后按默认值把写入重新打开（有单测锁死）。

**行不存在不是损坏**，它是"未配置"，即 §2.0 的全开默认。

### 7.4 单测（11 个，全部通过）

`cargo test -p quicklang-storage-seekdb --features sqlite longterm_flags`：

| 用例 | 断言 |
| --- | --- |
| `an_absent_row_means_fully_enabled` | 无行 = 全开，三个 `allows_*` 都为 true |
| `each_switch_can_be_closed_on_its_own` | 三个开关各自可单独关闭，且互不影响（§2.0 三行独立） |
| `rollback_closes_entries_before_writes` | §4.2 step 1 的顺序：先关 entry/export，write 仍开；全关后 write 也为 false |
| `switches_are_scoped_per_owner_and_survive_reopen` | 按 owner 隔离；重开数据库后仍生效；未配置的第三个 owner 保持默认 |
| `clearing_the_row_restores_the_default` | 删行回到默认（§13 重新开启路径的中性起点） |
| `an_unreadable_row_fails_loudly_instead_of_guessing` | 损坏行 → `LONGTERM_STORAGE_FAILURE` 且不可重试，`allows_write` 也失败 |
| `an_unknown_field_does_not_silently_enable_a_switch` | 未知字段 → 响亮失败，不静默按默认开写入 |
| `a_blank_owner_is_refused` | 空白 owner → `LONGTERM_INVALID_ARGUMENT` |
| `the_row_is_not_migrated_into_user_preferences` | 键不匹配 `setting_identity` 白名单，不会被迁进 `ql_user_settings` |
| `no_longterm_record_is_produced_while_the_write_switch_is_off` | **B4 关闭判据的回归用例**，见 §7.5 |
| `stage_labels_match_the_documented_matrix` | `stage1..3` / `rolled_back` / `fully_off` 的 `ReleaseStage` 与 §2.0 矩阵一致 |

### 7.5 B4 的回归用例（关闭期间不产生长期记录）

`no_longterm_record_is_produced_while_the_write_switch_is_off` 跑真实适配器与真实
`record_ordinary_error`：

1. **开**：`record_ordinary_error` 提交，卡片与 `ordinary_error` 事件出现
   （`list_cards` 可见 1 张卡，`list_events_for_card` 命中 `ordinary_error`）。
2. **关**：写 `fully_off`，`allows_write` 为 false，走 §13 第 854 行要求的既有路径
   （不进入长期事务）。断言的是**可观察状态**而不是门控返回值：
   - 卡片数不变（没新建卡）；
   - 事件数不变（没写事件）；
   - `ql_app_state` 的 `longterm-snapshot` 逐字节不变（没写 canonical 快照）；
   - `app-state-version` 仍停在开关打开时那一次的值（短期路径没有借长期事务推进
     版本号）。
3. **重新开启**：`clear()` 回到默认后同一命令正常提交，卡片数 +1、版本号 +1
   （§13 阶段 4 保留的重新开启路径）。

### 7.6 未落地的调用点（交 #55-A，附最小 patch 建议）

载体与门控 API 已就位，但**入口判断尚未接线**：`src/app/src/longterm.rs` 是 #53-A /
#54-A 的工作区，本次按并行纪律**没有改**。清单 B4 的关闭判据还差最后一步"关闭后
回到既有路径"，需要三个调用点：

1. `longterm_record_ordinary_error`（`src/app/src/longterm.rs` 第 884 行的 handler，
   实体在同文件第 683 行的 `execute_record_ordinary_error`）：**在进入事务之前**查
   `LongtermReleaseGate::new(db).allows_write(&request.user_id)?`；为 false 时走既有
   的不写长期表路径，并按 §13 第 854 行向用户说明"关闭期间不会产生长期记录"。
   注意 `record_ordinary_error` 需要 `&mut db`，所以门控查询要在拿到可变借用
   **之前**完成（这也是本文件单测里门控反复重新绑定的原因）。
2. `longterm_create_session` / `longterm_list_cards` / `longterm_get_card_detail` /
   `longterm_add_card` / `longterm_get_dashboard`：以 `allows_entry` 决定是否提供
   今日复习、错题本、详情、手动加入与提前练习入口（§2.0 第 2 行：入口隐藏，既有
   长期数据保留可导出）。
3. `longterm_export_json`（第 2942 行）：以 `allows_export` 决定是否提供导出入口
   （§2.0 第 3 行：入口隐藏，不影响读写）。

建议同时把 §7.5 的三条断言复制到 `tests/contract/ordinary_error.rs` 作为双后端
契约用例（seekdb 侧随 B1 一起激活）。

## 8. 复现命令

```text
# 全量（§11.2 固定数据集：2 万卡 / 100 万事件 / 200 次迭代）
cd <worktree>
CARGO_HOME=$PWD/deps/cache/cargo RUSTUP_HOME=$PWD/deps/cache/rustup \
PATH=$PWD/deps/cache/cargo/bin:$PATH \
cargo bench -p quicklang-tests --features sqlite --bench longterm_bench

# 只跑基准、不跑其他测试目标
（上面已用 -p quicklang-tests --bench longterm_bench 限定）

# 冒烟（秒级，用于验证数据集生成器本身）
QUICKLANG_BENCH_CARDS=2000 QUICKLANG_BENCH_EVENTS=5000 QUICKLANG_BENCH_ITER=5 \
  <上面同一条命令>

# B4 单测
CARGO_HOME=$PWD/deps/cache/cargo RUSTUP_HOME=$PWD/deps/cache/rustup \
PATH=$PWD/deps/cache/cargo/bin:$PATH \
cargo test -p quicklang-storage-seekdb --features sqlite longterm_flags
```

环境变量：`QUICKLANG_BENCH_SEED`（默认 `5500550`）、`QUICKLANG_BENCH_CARDS`
（`20000`）、`QUICKLANG_BENCH_EVENTS`（`1000000`）、`QUICKLANG_BENCH_ITER`（`200`）、
`QUICKLANG_BENCH_DIR`（临时目录）、`QUICKLANG_BENCH_KEEP`（保留数据集）、
`QUICKLANG_BENCH_REPORT`（写出 markdown 数字表）。

**注意**：默认全量跑一次约 20–25 分钟，其中绝大部分是播种 100 万事件（~48–65 s）与
`ErrorCount` 排序的 16 项 × 200 次迭代。不带 `--features sqlite` 直接跑会打印
提示并退出（不会误跑一个空基准）。
---

## 9. 复跑确认（收尾阶段第二次完整运行，EXIT=0）

> **本节是本文件的最终权威数字。** §3.3 的表格是 #55-B 交付时的首次运行输出；收尾阶段
> 在全量测试与缺陷修复全部完成之后，本机又跑了一次**完全相同**的完整基准，用于确认
> ①数字可复现 ②收尾阶段的 12 个新提交没有引入性能回归。两次运行的差异与结论见 §9.3。

### 9.1 运行前提（必读，缺参数会拒绝运行）

```text
cargo bench -p quicklang-tests --features sqlite --bench longterm_bench
```

| 项 | 说明 |
| --- | --- |
| **`--features sqlite` 是必需参数** | 基准走 **SQLite 后端**（`rusqlite 0.37` bundled）。缺这个参数时二进制走 `#[cfg(not(feature = "sqlite"))]` 分支，**打印用法并直接拒绝运行**，不会静默跑出一个空基准或用错后端的假数字 |
| 包名是 `quicklang-tests` | 执行报告旧稿 §6.3 曾把包名误写为 `quicklang-contract`，**该包名不存在**，照抄会直接报错（`long_learn_full_test_runbook.md` 的发现 E4 已修正，见执行报告 §9.3 缺陷 #10） |
| 真实 seekdb 后端 | 按 `tests/contract/longterm_list.rs` 的 `seekdb_harness` 范式以 `#[ignore]` **预留**，**本次不伪造 seekdb 的性能结论**（§6 的未覆盖项仍然成立） |
| 运行环境变量 | 与 §8 完全相同（`CARGO_HOME` / `RUSTUP_HOME` / `PATH` 指向 `deps/cache/`），环境变量未改 |

### 9.2 复跑数字（权威）

**墙钟总时长 1477.2 s，EXIT=0。**

#### 9.2.1 数据集、种子与环境（与首次逐项一致 → 数据集可复现）

| 项 | 值 | 与首次对比 |
| --- | --- | --- |
| 数据生成种子 | `5500550`（SplitMix64） | ✅ 一致 |
| 注入时钟 | `1800000000000` | ✅ 一致 |
| 卡片行 | 20300 | ✅ 一致 |
| 来源行 | 40460 | ✅ 一致 |
| 会话 | 9000（+1 active 正式会话） | ✅ 一致 |
| session item | 160000 | ✅ 一致 |
| 事件 | **1000000** | ✅ 一致 |
| 墓碑 | 300 | ✅ 一致 |
| 数据库字节 | **797,290,496** | ✅ 一致（**逐字节同体积**，说明播种完全确定） |
| 播种耗时 | 64.62 s | ⚠️ 47.78 s → 64.62 s（+35%，见 §9.3 说明） |
| 到期候选池 | 7013 张 | ✅ 一致 |
| 每项迭代数 | 200 | ✅ 一致 |
| 缓存状态 | 热（重复迭代，OS 页缓存已填充） | ✅ 一致 |
| 指标校验 | due_today=7008、mastered=2340、30 日错误=49096、7 日首次正确率≈**0.8046** | ✅ 一致 |
| 环境 | Apple M2 Max / macOS 27.0.1 / rustc 1.93.1 / `--release` / SQLite bundled | ✅ 一致 |

#### 9.2.2 测量项（p95 为权威判定值）

| # | 操作 | 口径 | 迭代 | **p95 (ms)** | 阈值 (ms) | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `get_metrics`（首页指标，全量重算 2 万卡） | §8.3 四字段 + §8.1 今日到期；热缓存 | 200 | **208.50**（最大 928.33） | < 200 | ❌ **未达标（略微越线）** |
| 2 | `list_cards` 首屏 · 最近答错 | 全部筛选，limit=50，无游标 | 200 | **21.63** | < 200 | ✅ 达标 |
| 3 | `list_cards` 翻页 · 第 100 页 · 最近答错 | keyset 游标已在约 4950 张之后 | 200 | **23.56** | < 200 | ✅ 达标 |
| 4 | `list_cards` 首屏 · 到期时间 | 全部筛选，limit=50，无游标 | 200 | **20.89** | < 200 | ✅ 达标 |
| 5 | `list_cards` 翻页 · 第 100 页 · 到期时间 | keyset 游标已在约 4950 张之后 | 200 | **24.57** | < 200 | ✅ 达标 |
| 6 | `list_cards` 首屏 · **错误次数** | 全部筛选，limit=50，无游标 | 200 | **2010.12** | < 200 | ❌ **未达标（10.1×）** |
| 7 | `list_cards` 翻页 · 第 100 页 · **错误次数** | keyset 游标已在约 4950 张之后 | 200 | **2887.96** | < 200 | ❌ **未达标（14.4×）** |
| 8 | `list_cards` 首屏 · 已到期筛选 | §6.1 可见性 | 200 | **24.60** | < 200 | ✅ 达标 |
| 9 | `get_card_detail`（时间线 50 条 + 全部来源） | 轮换 64 张卡片 | 200 | **0.23** | < 200 | ✅ 达标 |
| 10 | `card_session_answers`（热卡 · 8 个会话条目） | §8.2 | 200 | **0.75** | < 200 | ✅ 达标 |
| 11 | `list_card_events` 翻页（热卡 · limit=50） | §8.2 时间线游标 | 200 | **0.10** | < 200 | ✅ 达标 |
| 12 | **正式选卡（候选加载 + 选卡 + 冻结写入）** | §6.1 空选：4 条与候选卡数无关的语句；取组大小 20；`abandon` 不计入 | 200 | **39.64** | < 300 | ✅ **达标** |
| 13 | `record_ordinary_error`（跨 `ql_app_state` 与六表单事务） | §5.2 全原子提交 | 200 | **0.60** | < 300 | ✅ 达标 |
| 14 | `submit_longterm_attempt` · Formal · Good | §6.2/§6.3 条目 CAS + 排期 + 事件同一事务 | 200 | **0.72** | < 300 | ✅ 达标 |
| 15 | `submit_longterm_attempt` · Early · Good | 同上 | 200 | **0.46** | < 300 | ✅ 达标 |
| 16 | `get_metrics` · 压力变体（30 日窗口灌满全部活跃事件） | **非** §11.2 固定数据集；30 日易错≈652,701 | 30 | **2168.54** | < 200 | ❌ 未达标（暴露斜率用） |

#### 9.2.3 导出（§11.3 第 4 条：流式、可取消、内存有界）

| 项 | 值 |
| --- | --- |
| 状态 | 成功 |
| 耗时 | **3.68 s** |
| 文件大小 | **756,554,541 字节**（与首次**逐字节相同**） |
| 吞吐 | **271,385 事件/秒** |
| RSS 增量峰值 | **704 KiB** |

> 704 KiB 的增量峰值相对 760 MiB 的数据库体积是 **0.09%**，仍是"内存有界"的直接证据：
> keyset 游标批 512 行流式写入的上界与总数据量无关。两次运行的增量（400 KiB / 704 KiB）
> 差异属于分配器对齐/页级抖动量级，**不改变结论**。

### 9.3 两次运行差异对照

| 测量项 | 首次（1431.8 s） | 复跑（1477.2 s） | 差异 | 判读 |
| --- | --- | --- | --- | --- |
| 墙钟总时长 | 1431.8 s | 1477.2 s | +45.4 s（+3.2%） | ✅ 无回归 |
| 播种耗时 | 47.78 s | 64.62 s | +16.8 s | ✅ 同机同种子、**DB 体积逐字节相同**，属磁盘/页缓存态差异，**不是数据生成器不确定性** |
| 导出文件大小 | 756,554,541 | 756,554,541 | 0 | ✅ **逐字节可复现** |
| 导出吞吐 | 285,031 事件/s | 271,385 事件/s | −4.8% | ✅ 正常波动 |
| RSS 增量峰值 | 400 KiB | 704 KiB | +304 KiB | ✅ 同量级，内存有界结论不变 |
| 列表/详情/时间线 10 项 | 20.17–24.65 ms | 20.89–24.60 ms | ±2 ms 内 | ✅ 全部稳定 < 25 ms |
| 正式选卡 | 39.57 ms | 39.64 ms | +0.07 ms | ✅ **无回归**（`select_due_cards` 的 4 条候选语句仍与卡数无关） |
| 提交类 3 项 | 0.53 / 0.68 / 0.46 ms | 0.60 / 0.72 / 0.46 ms | ≤ +0.07 ms | ✅ 无回归 |
| `get_metrics` p95 | 191.48 ms | **208.50 ms** | **+17.02 ms（+8.9%）** | ⚠️ **由"贴边达标"变为"略微越线"** |
| `get_metrics` 最大值 | 207.90 ms | 928.33 ms | +720 ms | ⚠️ 长尾放大，见下 |
| `get_metrics` 压力变体 p95 | 1927.89 ms | 2168.54 ms | +12.5% | ⚠️ 同向，斜率一致 |
| `ErrorCount` 首屏 p95 | 2065.46 ms | 2010.12 ms | −2.7% | ❌ 仍**未达标**（10.1×） |
| `ErrorCount` 深页 p95 | 2895.39 ms | 2887.96 ms | −0.3% | ❌ 仍**未达标**（14.4×） |

### 9.4 两处未达标（如实记录，不粉饰）

#### 9.4.1 `list_cards` 按**错误次数**排序 —— 未达标（严重）

| 项 | p95 | 阈值 | 超标倍数 |
| --- | --- | --- | --- |
| 首屏 | **2010.12 ms** | < 200 ms | **10.1×** |
| 深页（第 100 页） | **2887.96 ms** | < 200 ms | **14.4×** |

**根因已确证**（取证过程见 §5.1，本次复跑未推翻其中任何一条）：

1. **该排序键不是存储列。** `ll_error_count_expr` 是一个相关标量子查询，
   `ORDER BY` 无法走 `idx_longterm_card_due`，只能 `USE TEMP B-TREE FOR ORDER BY`
   对全部 2 万行排序，排序过程中**每行**都要跑一次该子查询。
2. **消融实验：换存储列 1.84 s → 0.02 s，92×。** 变体 M/N 保留了 §8.2 的完整排序形状
   （`CASE WHEN … THEN 1 ELSE 0 END` 的 rank 半 + `COALESCE(-…)` 的 key 半 +
   `(card_id, generation)` 兜底键 + 深页 keyset 谓词），只把排序键从子查询换成
   `lapse_count` 一列。
3. **内层触碰行数随事件数 10× 线性增长**：10 万事件 → 61,451 行；100 万事件 →
   617,201 行，耗时同比例放大。**成本与数据量线性而非常数。**
4. **索引全部命中**（三个事件子查询都走 `idx_longterm_event_card`，墓碑 guard 走覆盖
   索引，无全表扫描、无缺索引）→ **索引不是瓶颈**，加索引无效。
5. **CTE 预聚合在 1M 下只有 0.82×**（1.51 s vs 1.84 s），**不足以达标**；它在 10 万
   规模上的"看起来很有效"初判已被 1M 数据集推翻并更正。

**用户决策（2026-10-05 00:32 登记）：**

> **记为已知性能缺口 + 92× 优化方案留档；本期不改核心写入路径、不动统计口径。**
> §14.1 第 9 条与 issue #55 第 3 条**不按「已达标」关闭**，按"有明确阻断说明 +
> 优化方案已给出"记录。

首选修法不变：给 `ql_longterm_card` 增加物化列 `error_count`，在**写入路径**按
`lapse_count` 的同构方式递增维护（六表 DDL 同步 + 清除时归零/`NULL` 以免泄漏 +
不与 `get_metrics` 的**有窗口** 30 日计数混用）。口径不变，不违反 §11.3 第 800 行红线。

#### 9.4.2 `get_metrics` —— 未达标（略微越线，按条件达标处理）

| 项 | 首次 | 复跑 | 阈值 |
| --- | --- | --- | --- |
| p95 | 191.48 ms（余量 4.3%） | **208.50 ms（越线 4.3%）** | < 200 ms |
| 最大值 | 207.90 ms | **928.33 ms** | — |
| 压力变体 p95 | 1927.89 ms | **2168.54 ms** | — |

**判读**：191.48 → 208.50 是 **+8.9%** 的同量级波动，**不是**数量级恶化——它在
200 ms 阈值线两侧来回，恰好证明这一项**没有任何余量**。压力变体同向（+12.5%）说明
**斜率本身没变**，变的只是截距。

**处置（条件达标）**：

- 按 **"条件达标"** 记录，**不粉饰为达标**，也不夸大为数量级缺陷。
- **最弱目标 iPhone 几乎确定不达标**：本机是 M2 Max，§11.3 第 793 行要求的最弱
  iPhone 慢数倍，而该项已经是唯一随**事件总量**线性增长的查询（30 日窗口占数据集
  7.5% ≈ 7.5 万条）。真机清单里"首页指标"必须单列为必测项。
- 优化方向（#55-B 已给出，不改口径）：把两个窗口聚合**下推到 SQL**——`ordinary_error`
  的 30 日计数是一条 `COUNT(*)`；7 日首次正确率按 §8.3 可由
  `GROUP BY session_id, card_id, generation` 取 `MIN(occurred_at)` 所在行的
  `attempt_result` 得到。**保留纯函数 `mm_metrics` 作为口径的可执行规范与回归基线**，
  只在 Repository 加载层换成聚合查询。

### 9.5 复跑对 §14.1 第 9 条 / issue #55 第 3 条的影响（不变）

| 判据 | 状态 |
| --- | --- |
| 提交类 P95 < 300 ms（4 项） | ✅ 全部达标，且**无随数据量失控的查询**——正式选卡 200 次迭代 p95 稳定在 39.64 ms |
| 查询类 P95 < 200 ms（16 项） | ❌ **3 项未达标**：`ErrorCount` 首屏、`ErrorCount` 深页、`get_metrics` |
| 导出（无交互式阈值） | ✅ 流式、可取消、内存有界（RSS 增量 704 KiB / 0.09%） |
| **§14.1 第 9 条** | ❌ **不按「已达标」关闭**；记为「有明确阻断说明 + 92× 优化方案已留档」 |
| **issue #55 第 3 条** | ❌ **不按「已达标」关闭**；同上，另附 `get_metrics` 边界波动的条件达标说明 |

**两次运行的结论完全一致**：收尾阶段的 12 个新提交（含解除 82 个 `#[ignore]`、
B3/B6/B7/B11 关闭、基线夹具修复与 app 层测试修复）**没有引入任何性能回归**，
也没有把任何未达标项变成达标项。
