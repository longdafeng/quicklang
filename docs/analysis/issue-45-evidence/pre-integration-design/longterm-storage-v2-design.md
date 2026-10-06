# 长期学习统一存储 v2 设计

日期：2026-10-05。状态：设计，尚未实现。本文替代此前六表、五表及清除屏障方案。

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

| 表 | 主要字段 | 职责 |
|---|---|---|
| ql_longterm_card | card_id, user_id, normalized/display_spelling, exercise_kind, schedule_step, interval_days, due_at, last_error/review/mastered_at, lapse_count, version, created/updated_at | 独立单词卡片及当前排期 |
| ql_longterm_session | session_id, user_id, creation_operation_id/creation_payload_hash, session_kind, state, requested_size, selection_time, random_version, initial/completed_count, current_item_id, version, started/updated/finished_at | 一轮正式/提前复习及恢复状态 |
| ql_longterm_session_item | session_item_id, session_id, card_id, initial/queue_order, state, retry_not_before, attempt_count, first_again_counted, first/completed_event_id, version | 本轮题目、队列与等待 |
| ql_longterm_event | event_id, operation_id, user_id, card/session/item references, event_kind, attempt_result, answer_raw, assistance flags, question/schedule snapshots, occurred_at; 主事件私有 payload_hash/result_json | 当前保留单词的学习历史及有限生命周期内的操作回执 |

卡片不依赖词书条目出题，保存复习必要词形和题型。同用户 normalized spelling + exercise kind 唯一，普通拼写错误与手动添加共用卡片。行为类型可以区分普通错误、手动添加、正式/提前作答，但不携带来源身份。

现有 app-state、词库和 settings 不属于这四张长期表，继续存在。普通错误更新长期卡片与普通学习状态时保持现有原子边界。

## 4. 身份与一致性

card_id 首次创建时由原生生成随机唯一 UUID，重新添加同一个单词使用新 UUID。取消基于词形固定 cardId 的方案，删除 generation、incarnation、scope_epoch、owner_hash 清除骨架及其协议。词形去重依赖 owner/normalized spelling/exercise kind 唯一约束，不依赖固定 ID。

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

主要索引：card(user_id, normalized_spelling, exercise_kind) 唯一；card(user_id,due_at,card_id)；session(user_id,session_kind,state)；item(session_id,queue_order)；item(card_id,session_id)；event(user_id,card_id,occurred_at,event_id)；主事件 operation_id 唯一。最终 DDL/索引按两 backend 的实际支持与测量冻结。

## 8. 导出

采用 export v2，公开投影仅来自当前四表，不包含来源、删除记录、旧卡片占位、payload_hash 或 result_json。includeRawAnswers=false 时从查询起省略答案；删除后新导出不含该词。已由用户保存的外部文件不属于数据库删除范围。

保留一致快照、有界页、native picker、取消与安全发布。并发删除应取消/重新开始仍在生成的旧导出，避免发布包含已删除数据的进行中快照。

## 9. 实施与验收

先冻结四表合同、卡片随机身份、删除与未知提交规则；再实现 codecs/事务，接通复习、错题本、音频与导出。按聚焦阶段重构，不用旧 DTO/mock 证明新模型正确。

必须验证：

- 删除后 card/event/相关 item/session/回执与 JSON 快照无残留；不产生删除事件或标记。
- 旧查询/作答/回执均不可用；同词重新添加使用新 ID，旧请求不能更新新卡。
- 删除和作答并发两种顺序；添加响应丢失后不自动重建已删卡片。
- 删除结束受影响会话，其他卡片排期保留；正常完成/Again 等待与提前不改排期。
- 删除更新统计、分页、详情和导出；普通进度与生词表不受影响，owner 隔离正确。
- 真实 seekdb 与 SQLite 同合同；已知完成恢复、播放门槛、缺表修复故障回归。

这是新的目标设计，尚未修改产品 schema 或执行数据库删除；实施后必须重新运行针对性测试和必要 canonical build。
