# 长期学习统一存储 v2 设计

日期：2026-10-05。状态：四表实现已接入整合分支，P6b 在 7e347898 基线上完成验证；最新 main a6b73d06 的学习统计与时区衔接已完成本轮回归，见 docs/analysis/p6c-verification-2026-10-05.md。本文替代此前六表、五表及清除屏障方案。

## 1. 已确认决策

- 保留 opencode 长期复习流程和 local 长期错题本界面，统一重构相关代码。
- 使用全新数据库，不兼容、不保留旧数据库；本轮不实际删除数据库。
- 长期学习不追踪词书/条目来源，删除 source 表、来源接口及按词书清除功能。
- 删除 tombstone 表；删词后不支持查询或重放这个词的旧操作，不额外保存删除事件、清除回执、失效占位行或其他“曾经删除”记录。
- 仅保留 card、session、session_item、event 四张长期表，不新增 operation 表。

## 2. 分层与职责

opencode ReviewSession 与 local Notebook UI → 统一 client / 会话协调器 → application commands / queries → domain / scheduler 与 repository 事务 → 已验证 seekdb native driver / SQLite driver。

组件负责展示，协调器负责用户生命周期和请求状态；纯规则负责排期和队列；repository 负责 owner、引用、版本和原子性；driver 负责连接与执行。保留 opencode 已验证驱动，不整体引入 local 的失败 native 路径。代码规范与重构边界见整合规划第 12 节。

## 3. 四张长期表

| 表 | SQL 索引投影与 payload | 职责 |
|---|---|---|
| ql_longterm_card | card_id/user_id/normalized_spelling/due_at/updated_at/last_error_at/mastered_at/error_count + Card JSON payload | 独立卡片及当前排期；payload 包括 displaySpelling、scheduleStep、intervalDays、lapseCount、version 等 |
| ql_longterm_session | session_id/user_id/session_kind/state + Session JSON payload | 正式/提前会话；payload 保存冻结选择时间、进度、当前项、版本和创建回执身份 |
| ql_longterm_session_item | session_item_id/session_id/card_id/queue_order + Item JSON payload | 冻结队列、retryNotBefore、attemptCount、firstAgainCounted、done、version |
| ql_longterm_event | event_id/user_id/card_id/session_id/event_kind/occurred_at/first_attempt/attempt_result + Event JSON payload、私有 payload_hash/result_json | 当前保留卡片的公开历史及有限生命周期操作回执 |

物理 SQL 列承担筛选、排序、唯一性和聚合；类型化 payload 保存完整业务记录，两者在同一事务中更新。当前仅独立拼写卡片，唯一约束为 `(user_id, normalized_spelling)`，没有 exercise_kind 列；不宣称已实现多题型身份。公开 DTO 与内部 SQL 列有意分离。
卡片不依赖词书条目出题，保存复习必要词形和题型。同用户 normalized spelling 唯一，普通拼写错误与手动添加共用卡片。行为类型可以区分普通错误、手动添加、正式/提前作答，但不携带来源身份。

上游 `ql_user_documents`、词库和 settings 不属于这四张长期表，继续存在。普通错误在同一事务中更新长期卡片/事件和 portable user document，CAS 使用文档 revision；不再把同一 owner 学习状态写进重复 app-state 记录。前端 epoch 与 storage worker epoch guard 阻止旧用户环境的命令/回读覆盖新状态。

## 4. 身份与一致性

card_id 首次创建时使用一次明确动作冻结的随机唯一 UUID 候选，重新添加同一个单词使用新 UUID。取消基于词形固定 cardId 的方案，删除 generation、incarnation、scope_epoch、owner_hash 清除骨架及其协议。当前词形去重依赖 `(user_id, normalized_spelling)` 唯一约束，不依赖固定 ID 或尚未实现的题型列。

旧查询和作答只引用 card_id/session/item，目标不存在即返回明确 NotFound；更新不允许 upsert。重试不允许从词形搜索另一张卡片并转移到它。

正式/提前各最多一个 active session；创建、作答和删除通过 owner 事务协调。保留实际需要的 card/item/session row version 校验；正式改变排期，提前不改变排期。UTC 毫秒使用 checked i64，IPC 检查 JS 安全整数。

## 5. 排期与统计

沿用 opencode 正式 Good 的 1/3/7/14/30 天及随后倍增、3650 天封顶规则；Again 重置、首次计 lapse、移到队尾并至少等待 60 秒；提前不推进排期。保留首次达到 30 天的 mastery 规则。

手动新增立即到期，普通错误新增按原业务次日到期；已有卡手动添加不增加错误数、不改排期、不增加生词表记录。初始队列与选择时间持久化，恢复不重选。

四项 dashboard 及累计错误口径沿用已约定规则。删除卡片时删除它的事件，因此历史统计只统计当前保留数据；不为维持过去数字保留已删除单词的事件或删除标记。该变化需更新文案和测试。

## 6. 直接删除语义

只支持删除单词和删除全部长期学习记录；不按词书删除。

一次 owner 事务内：

1. 检查删除权限并定位实际卡片。
2. 删除卡片事件、作答快照、私有操作回执，以及其他载荷中引用该卡片的数据。
3. 删除相关 session_item；为避免会话创建回执/冻结队列残留已删除单词，删除受影响的整个 session、其全部队列项和会话回执。其他单词卡片及排期保留；其历史事件若保留，必须移除失效 session/item 引用及任何包含已删卡片的私有载荷。
4. 删除 card。不写删除事件、tombstone、清除 receipt 或失效占位行。
5. commit 后前端刷新列表/统计/会话，清除该词详情、答案、选词与内存 pending 命令；受影响复习需重新开始，不保留被删会话进度。

重复删除不存在 card_id 可返回“目标已不存在”，这是对当前数据的即时判断，不能声称确认原删除时间或原操作结果。全量删除直接删除该用户四表数据，不影响普通背诵进度、生词表或其他用户。

删除与作答竞争：先作答则后续删除一并移除结果；先删除则作答 NotFound，不能重建卡片。旧回执查询与重放同样不可用，目标检查必须先于回执返回。

新的一次手动添加或普通错误允许重新收录，生成新 card_id。没有删除记录就不能无限期区分旧创建请求与新创建请求，因此删除前的添加/普通错误请求不得自动重放：前端取消 pending；创建使用预先冻结的新候选 card_id，未知响应先查候选 ID，目标不存在时要求新的明确动作，而非自动执行创建重试。不承诺删除后的全局 exactly-once，也不以暗藏日志或保留旧 UUID 实现该承诺。此限制需覆盖响应丢失和跨用户/页面生命周期测试。

## 7. 回执与查询

卡片仍存在期间，可在主事件中保存私有提交回执，并以 operation_id 唯一约束实现相同载荷的有限重试；不复制到公开历史和导出。session 创建回执仅在 session 存在时可用。删除后回执随目标移除，不保存“已删除/已失效”回执。

列表、详情、事件按 owner 有界 keyset 分页；删除后旧 card 游标返回 NotFound，列表游标依据现存数据继续或重新读取，不能依赖清除纪元。到期选择保留完整候选排序语义，不能先 LIMIT 再随机。

主要索引：card(user_id, normalized_spelling) 唯一；card(user_id,due_at,card_id)；session(user_id,session_kind,state)；item(session_id,queue_order)；item(card_id,session_id)；event(user_id,card_id,occurred_at,event_id)；event_id 主键承载操作身份，不新增 operation_id 列。导出有 card/session/event 的 owner+ID 索引；统计有 owner/event_kind/first_attempt/occurred_at/attempt_result 索引。实际 DDL 见 `src/crates/storage-seekdb/src/sqlite_schema.sql` 和 `src/schema/ql_longterm_*.sql`。

## 8. 导出与词形导入

采用 export v2，公开投影仅来自当前四表，不包含来源、删除记录、旧卡片占位、payload_hash 或 result_json。includeRawAnswers 默认 false，此时事件 answerRaw 输出 null；当前 SQL 仍读 payload 后清空答案，不承诺从查询起省略答案；删除后新导出不含该词。已由用户保存的外部文件不属于数据库删除范围。

保留一致快照、有界页、native picker、取消与安全发布。同一存储 worker 串行执行导出和本地删除，导出保持读取事务快照。不要把后发删除描述为已撤回先前保存的文件；owner/页面生命周期取消通过原生 gate 生效。完整格式与发布保证见 longterm-export.md。

P5.1 已实现词形导入，接受 UTF-8 TXT 一行一词、标准 export v2 的 cards.displaySpelling，以及 compact words v1 的 words 数组。文件与实际 UTF-8 内容限制 32 MiB，去重前 1–10,000 词；trim 后非空且最多 256 Unicode code points，前后端都检查规范化后不超过 256 code points。前端预览 NFKC + lowercase 去重，后端再次按当前 owner 规范化去重；不接受 CSV、旧格式或 portable user backup。arrayBuffer 读取严格解码原始 UTF-8；File.text 兼容回退只校验解码后的文本，不能声称拒绝所有原始非法编码。

目标用户由当前 profile 决定，文件 owner 不授权。读取、预览和确认绑定 owner/epoch，确认前冻结每词 operationId/candidateId；worker epoch guard 拒绝替换数据前的迟到命令。已有卡不更新排期、版本或事件；新卡立即到期，使用初始排期及新 UUID，不修改已有会话队列。不恢复文件中的 card ID、会话、排期、答案或旧历史。

全部 entry 在一个事务中校验和提交，后半部失败撤销前半部新增。每个新增词复用单词 Add 的事件/私有回执，哈希针对该词的 Add 载荷，绝不保存完整导入批次载荷。card/event 全局主键拒绝跨用户身份冲突；现存词及重复词也检查输入身份。删除词时清除该词回执，其他词回执不包含被删词；四表结构不变，无批次、source、tombstone 或删除回执表。传输未知不自动重试创建，先刷新核对，再由用户明确放弃并重新选择文件。

## 9. 实施与验收

四表合同、删除规则和统一 UI 已实现；P6b 已完成默认测试、真实 seekdb/SQLite 合同、macOS 原生导出与桌面 Debug 构建。P6c 已通过规范桌面/iOS simulator Debug、设备架构 check、原生专项和最新基线回归；iOS picker 实际点击交互仍因缺少 Simulator UI 应用阻塞。按聚焦阶段重构，不用旧 DTO/mock 证明新模型正确。

必须验证：

- 删除后 card/event/相关 item/session/回执与 JSON 快照无残留；不产生删除事件或标记。
- 旧查询/作答/回执均不可用；同词重新添加使用新 ID，旧请求不能更新新卡。
- 删除和作答并发两种顺序；添加响应丢失后不自动重建已删卡片。
- 删除结束受影响会话，其他卡片排期保留；正常完成/Again 等待与提前不改排期。
- 删除更新统计、分页、详情和导出；普通进度与生词表不受影响，owner 隔离正确。
- 真实 seekdb 与 SQLite 同合同；已知完成恢复、播放门槛、缺表修复故障回归。

当前代码使用新四表 schema，验收使用隔离 fresh 数据；没有删除用户原数据库。最新 main rebase 后已有本轮 UI 932、真实 seekdb 17、SQLite 19、两后端各 25 合同与规范 Debug 构建证据；iOS 实际目录选择交互仍未通过。

## 10. 最新 main 的学习活动与奖励衔接

本轮 rebase 保留上游中文背诵/中文复习、AnswerCheer 和 Session.earned。本轮跨日设计：ordinary 冻结本地 UTC offset，服务以 now + offset 计算活动日期，事件与排期继续使用 UTC；实现和跨日/重试回归已通过。英文普通错误原子事务写 `learning-activity` 的 spell 计数，同时把有效旧 `spell-activity` 总数放入 legacyDays，不能继续增加旧字段或把旧总数虚构为各模式历史。首次试题按 counted 去重，复习重试不再次计今天背诵；earned 记录跨复习轮次累计正确数，错误保留已有值，旧会话从 correct + retryHistory 正确数初始化。

中文 ASR 错误和超时遵守上游规则：不增加学习统计，不写长期错词；正常英文 review 保留原 onWrong 行为。上述 Rust/UI 衔接属于本轮变更，以本轮 UI 932、native/SQLite 事务回归为通过证据，不能用此前 P6b 773 测试代替。

## 11. 验证边界

P6b 详情见 docs/analysis/p6b-verification-2026-10-05.md：86 文件 773 UI 测试、两后端 25 合同、真实 seekdb 14 存储用例、SQLite 56 用例，以及 macOS Debug 构建。布局验收经用户许可使用隔离 WKWebView 和 mock read model；macOS picker 使用独立 native harness，均不能证明完整生产 iOS 链路。iOS picker 端到端、文件提供者权限和真机仍需验收。百万事件基准为 Dev/SQLite、五次样本、counting sink，未测磁盘 I/O 或峰值内存，不给 P95 保证。
