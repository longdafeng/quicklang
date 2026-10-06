# QuickLang 0.7 长期错题学习记录与长期复习设计

> 目标版本：0.7.0  
> 状态：实施设计  
> 父任务：[#45 0.7.0：长期错题学习记录与长期复习](https://github.com/longdafeng/quicklang_my/issues/45)  
> 子任务：[#46 表结构、领域模型与卡片身份](https://github.com/longdafeng/quicklang_my/issues/46)、[#47 Repository 与跨后端原子事务](https://github.com/longdafeng/quicklang_my/issues/47)、[#48 普通背诵错误接入](https://github.com/longdafeng/quicklang_my/issues/48)、[#49 调度算法与到期选卡](https://github.com/longdafeng/quicklang_my/issues/49)、[#50 会话状态机与 IPC API](https://github.com/longdafeng/quicklang_my/issues/50)、[#51 来源生命周期、清除与隐私擦除](https://github.com/longdafeng/quicklang_my/issues/51)、[#52 错题本、详情、统计与手动加入](https://github.com/longdafeng/quicklang_my/issues/52)、[#53 今日复习与提前练习 UI](https://github.com/longdafeng/quicklang_my/issues/53)、[#54 JSON 导出](https://github.com/longdafeng/quicklang_my/issues/54)、[#55 双后端测试、性能与发布验收](https://github.com/longdafeng/quicklang_my/issues/55)

## 1. 目标与非目标

### 1.1 目标

0.7.0 在现有短期背诵流程之外增加一套长期学习记录和自动复习能力：

- 从功能启用后的新学习行为开始，长期保存普通背诵与长期复习中的错误、作答和调度结果。
- 首版把普通背诵中的拼写错误自动加入长期错题，并提供专用的长期复习会话。
- 按用户合并跨词书的同一词形，以稳定卡片身份维护排期、错误历史、来源和清除代次。
- 在 macOS seekdb 与 iOS SQLite 上提供相同的领域行为、事务语义、查询结果和隐私边界。
- 提供今日复习、错题本、卡片详情、手动加入、提前练习、统计、隐私清除和 JSON 导出。
- 在 2 万张卡片、100 万条事件的目标数据规模下满足交互性能要求。

### 1.2 当前短期错词流程背景

普通背诵当前以一次活动中的即时掌握为目标。答错后，单词继续加入生词表，并沿用“累计答对两次”的短期完成规则。短期会话、`learned`、活动进度和生词表解决当前一轮学习，不提供跨活动、跨词书的长期错误历史和稳定排期。

0.7.0 不替换这条短期链路。普通背诵错误需要在一个业务事务中同时维护既有短期状态和新的长期记录；长期复习使用独立会话和调度规则。两个系统共享错误事实，但完成条件互不替代。

### 1.3 非目标与数据起点

首版明确不做以下事项：

- 不考虑数据库向后兼容或迁移，六张长期学习表在 0.7.0 直接建表。
- 不回填历史答题、旧活动、旧生词表或任何旧数据。
- 不恢复功能启用前已经存在的活动会话，也不把旧活动会话转换为长期会话。
- 不读取、不写入、不复用旧 `ql_review_*` 表或其业务逻辑。
- 不让长期记录清除自动删除生词表，也不让生词表操作自动清除长期记录。
- JSON 首版只导出，不提供导入或恢复。
- 不实现多设备同步；仅保留不影响本地语义的稳定 ID、版本和墓碑字段。
- 不扩展到自由问答、口语评分或其他题型。首版题型固定为“听音到拼写”。

因此，长期记录的时间边界是**功能启用后的新行为**。没有历史记录不表示用户过去从未答错。

## 2. 固定业务规则

### 2.1 卡片粒度

- 卡片按用户和规范词形合并，不按词书分别建卡。
- 题型固定为听音到拼写；同一个用户、同一个规范词形在多个词书中共享一张当前 generation 卡片。
- 来源保留词书及词条关联。卡片展示来源取“最近一次答错的有效来源”；该来源不可用时，取最近仍有效的来源。
- 词条拼写发生变化时视为新词：新拼写按规范化规则计算另一 card ID，旧卡不改名、不搬迁历史。

### 2.2 普通背诵错误

- 保存用户提交的原始答案，不只保存对错或规范化答案。
- 继续执行既有生词表加入逻辑，并保留短期“累计答对两次”规则。
- 一次普通错误必须原子更新：短期 session、`learned`/activity、生词表、长期 card、source 和 event。
- 任一步失败都回滚整次提交并阻止界面前进。客户端可用同一幂等键安全重试。
- 每次会改变排期的错误均以该错误的有效发生时间作为 `last_error_at`，把到期时间重置为 `last_error_at + 24 小时`。

### 2.3 专用长期复习评分

长期复习只暴露 `Again` 和 `Good`：

- 拼写错误、使用提示、揭晓答案或跳过都记为 `Again`。
- 未使用提示且拼写正确才记为 `Good`。
- 正式会话内，同一卡片第一次 `Again` 增加一次 lapse；同一正式会话的后续 `Again` 不重复增加。
- `Again` 把卡片移到当前会话队尾，并保证距本次作答至少 1 分钟后才可再次出现；持久化排期重置为本次错误后 24 小时。
- `Good` 按固定阶梯安排下一次复习：1、3、7、14、30 天，之后每次把上次间隔翻倍，上限 10 年。
- 下一到期时间按本次评分的服务端有效时间加间隔计算，不按客户端显示时间计算。
- 间隔达到 30 天时标记为已掌握。已掌握不是终止状态，之后仍按排期复习，`Again` 可增加 lapse 并重置到期。
- 正式会话创建时选入的全部初始卡片都必须在本会话中最终得到 `Good`，会话才能完成。

固定阶梯以天为日历持续时长单位：1 天等于 24 小时。翻倍序列为 60、120、240 天，继续翻倍并截断到 3650 天。`schedule_step` 保存已经成功到达的阶梯位置；`Again` 把步骤重置到未完成状态，下一次 `Good` 从 1 天开始。

### 2.4 批次、逾期与会话并发

- 正式复习每组默认 20 张，可配置为 5–100 张。
- 到期卡按逾期时长分为 `<1 天`、`1–6 天`、`7–29 天`、`30+ 天`。
- 选卡优先级从逾期最久层到最新层：`30+`、`7–29`、`1–6`、`<1`；层内使用稳定随机顺序，避免永久固定顺序，同时保证恢复后顺序不漂移。
- 稳定随机键为 SHA-256(`session_id || 0x00 || card_id || 0x00 || generation`)；按摘要字节序升序，card ID 和 generation 作为最终稳定 tie-breaker。
- 每个用户最多同时有一个活动正式会话和一个活动提前练习会话；两种会话可并存，不能各自再开第二个。
- 正式会话支持进程重启后恢复，恢复相同初始集合、顺序、等待时间和作答状态。
- 提前练习从错题本中显式选择 1–100 张卡片。所有作答都写事件，但不修改卡片排期、步骤、掌握状态或 lapse。
- 提前练习中的 `Again` 同样移到队尾并至少等待 1 分钟；全部所选卡片最终 `Good` 后完成。
- 放弃任一活动会话必须二次确认。放弃保留已经提交的事件与正式会话中已经提交的排期，不回滚历史。

## 3. 规范词形、卡片身份与 generation

### 3.1 `nfkc-lower-v1`

首版规范化算法版本固定为 `nfkc-lower-v1`：

1. 输入必须是有效 Unicode，界面和导入链路在进入领域层前拒绝空字符串及仅空白字符串。
2. 对原始词形执行 Unicode NFKC 规范化。
3. 对结果执行与语言环境无关的 Unicode lowercase。
4. 不做词干提取、变形还原、变音符号删除、标点删除或语言特有猜测。
5. 前后空白不作为隐式身份差异；领域入口先按 Unicode White_Space 去除首尾空白，再执行 NFKC 和 lowercase。中间空白保留。

算法名随卡片保存。将来改变算法必须使用新版本名，不能在原记录上静默重算。

### 3.2 确定性 card ID

听音到拼写卡片使用以下 UTF-8 字节计算 SHA-256：

```text
"quicklang-longterm-card-v1" 0x00
user_id 0x00
"listening-to-spelling" 0x00
"nfkc-lower-v1" 0x00
normalized_spelling
```

`card_id` 是 32 字节 SHA-256 的 64 个小写十六进制字符表示。用户 ID 进入摘要，因此不同用户不会共享卡片。词书不进入摘要，因此同一用户跨词书共享卡片。

数据库写入时必须重新计算并核对 card ID，不能信任客户端提供的摘要。发生理论哈希冲突，即已有同 card ID 的身份字段不一致时，返回 `LONGTERM_IDENTITY_COLLISION` 并拒绝覆盖。

### 3.3 generation

逻辑身份由 `(user_id, card_id, generation)` 唯一确定：

- 第一次出现使用 generation `1`。
- 清除卡片后保留不含敏感正文的 tombstone，记录已清除的最高 generation。
- 同一 card ID 以后重新遇到时，创建 `max(tombstone.cleared_generation, existing generation) + 1`。
- 新 generation 不继承旧排期、掌握状态、lapse、原始答案、来源内容或统计。
- tombstone 防止被迟到重试或未来同步数据复活；重遇是显式新一代，不是恢复旧记录。

generation 的分配、墓碑检查和新卡创建必须在一个事务中完成。

## 4. 六张全新表

所有时间使用 UTC Unix 毫秒整数；显示时再转换到用户时区。ID 使用小写十六进制摘要或 UUID 字符串，数据库层不依赖平台自增 ID。布尔值在领域层统一为 `0/1`。所有 JSON 扩展字段必须有大小上限并经过 schema 校验。

### 4.1 `ql_longterm_card`

每行表示一代可学习卡片。

| 字段                        | 约束与含义                                      |
| --------------------------- | ----------------------------------------------- |
| `user_id` / `owner_hash`    | 活动归属或清除后的不可逆归属摘要                |
| `card_id`                   | 非空，确定性 SHA-256 十六进制                   |
| `generation`                | 非空正整数                                      |
| `identity_version`          | 固定 `nfkc-lower-v1`                            |
| `exercise_kind`             | 固定 `listening-to-spelling`                    |
| `normalized_spelling`       | 敏感字段；规范词形，擦除时置空                  |
| `display_spelling`          | 敏感字段；最近有效展示拼写，擦除时置空          |
| `state`                     | `active`、`paused` 或 `erased`                  |
| `schedule_step`             | `0` 表示尚未完成第一次 Good；其后为固定阶梯位置 |
| `interval_days`             | 当前正式排期间隔，0–3650                        |
| `due_at`                    | 下一正式到期时间；活动卡必填                    |
| `last_error_at`             | 最近一次会改变排期的错误时间                    |
| `last_review_at`            | 最近一次正式评分时间                            |
| `mastered_at`               | 首次达到 30 天间隔的时间，可空                  |
| `lapse_count`               | 正式会话首次 Again 的累计次数                   |
| `recent_wrong_source_id`    | 最近答错的来源，擦除或来源失效时可空            |
| `version`                   | 从 1 开始的 CAS 版本                            |
| `created_at` / `updated_at` | 创建和最后更新时间                              |
| `erased_at`                 | 隐私擦除时间，可空                              |

由于 `card_id` 摘要已包含用户 ID，且用户级清除后 `user_id` 必须置空，主键固定为 `(card_id, generation)`；Repository 仍把活动逻辑身份校验为 `(user_id, card_id, generation)`。索引至少包括：

- `(user_id, state, due_at, card_id, generation)`，用于正式到期查询。
- `(user_id, updated_at DESC, card_id, generation)`，用于错题本游标分页。
- `(user_id, mastered_at, due_at)`，用于指标与筛选。

清除后不物理删除 card 整行。`erased` 行保留 `(card_id, generation)`、`owner_hash`、状态、版本和清除时间等最小骨架，`user_id`、规范词形、展示拼写及其他敏感正文物理置 `NULL`；同一事务建立 tombstone，保证迟到写入不能复活。

### 4.2 `ql_longterm_source`

记录卡片在哪些词书或手动入口中出现，以及来源生命周期。

| 字段                             | 约束与含义                                   |
| -------------------------------- | -------------------------------------------- |
| `source_id`                      | 主键，来源稳定 ID                            |
| `user_id` / `owner_hash`         | 活动归属或清除后的不可逆归属摘要             |
| `card_id` / `generation`         | 关联卡片                                     |
| `source_kind`                    | `book_item` 或 `manual`                      |
| `book_id` / `item_id`            | 词书来源标识；手动来源可空，擦除时置空       |
| `source_spelling`                | 敏感字段；该来源最近观察到的拼写，擦除时置空 |
| `state`                          | `active`、`paused`、`deleted` 或 `erased`    |
| `last_seen_at` / `last_wrong_at` | 最近遇到和最近答错时间                       |
| `deleted_at` / `erased_at`       | 删除或隐私擦除时间，可空                     |
| `created_at` / `updated_at`      | 生命周期时间                                 |
| `version`                        | CAS 版本                                     |

唯一约束为 `(user_id, card_id, generation, source_kind, book_id, item_id)`；空值需在 Repository 中编码为稳定哨兵，保证 seekdb 与 SQLite 结果一致。索引包括 `(user_id, book_id, state)` 和 `(user_id, card_id, generation, last_wrong_at DESC)`。

来源规则：

- 删除词书把对应来源标为 `deleted`；暂停词书把来源标为 `paused`；恢复词书把仍存在且拼写未变的来源改回 `active`。
- 拼写改变时，旧来源按原词失效，并为新 card ID 建立来源，不移动历史。
- 卡片有任一 active 来源时可正常展示和复习；仅有 paused 来源时卡片暂停选入；没有 active/paused 来源时卡片保留历史但不进入正式选卡。
- 按书清除把该书 source 改为 `erased` 并置空其敏感正文，不重算共享卡片的排期；其他来源仍可继续使用原卡片。
- 展示来源优先取 `recent_wrong_source_id` 指向的有效来源；不可用时按 `last_wrong_at DESC, updated_at DESC, source_id` 选最近有效来源。

### 4.3 `ql_longterm_event`

事件表记录用户行为和调度审计。新事件只追加；清除仅将既有事件的敏感正文字段置 `NULL` 并标记为 `erased`，不改写事件类型、时间、评分结果等非敏感历史事实。

| 字段                                           | 约束与含义                                                    |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `event_id`                                     | 主键；直接等于调用方 UUID `operationId`，也是唯一幂等键       |
| `payload_hash`                                 | 带应用域分隔的规范命令 SHA-256，用于检测同 ID 不同内容        |
| `user_id` / `owner_hash`                       | 活动归属或清除后的不可逆归属摘要                              |
| `card_id` / `generation`                       | 按事件类型关联卡片代次，可空                                  |
| `source_id`                                    | 按事件类型关联来源，可空                                      |
| `session_id` / `session_item_id`               | 作答事件二者必填；放弃事件仅 session 必填；其他事件按类型可空 |
| `event_kind`                                   | 下文穷举的固定枚举                                            |
| `attempt_result`                               | `again` 或 `good`；仅 `formal_attempt`/`early_attempt` 必填   |
| `answer_raw`                                   | 敏感字段；普通错误和作答的原始答案，可空，擦除时置空          |
| `used_hint` / `revealed` / `skipped`           | 作答评分依据                                                  |
| `is_correct`                                   | 判题结果                                                      |
| `schedule_before_json` / `schedule_after_json` | 有界调度快照；提前练习前后相同，擦除时置空其中全部敏感正文    |
| `state`                                        | `active` 或 `erased`                                          |
| `occurred_at` / `created_at` / `erased_at`     | 有效发生、入库和可选擦除时间                                  |

`event_kind` 只允许以下完整集合，不允许后端自行增加值：

- `ordinary_error`
- `formal_attempt`
- `early_attempt`
- `manual_add`
- `source_link`
- `source_unlink`
- `lifecycle_pause`
- `lifecycle_resume`
- `session_abandon`
- `clear_word`
- `clear_book`
- `clear_user`

作答类事件的 `event_id` 直接使用客户端 `operationId`；管理和生命周期事件同样由调用方生成 `operationId` 并直接作为 `event_id`。Repository 先按 `event_id` 查重：`payload_hash` 相同则返回原结果，不同则返回 `LONGTERM_IDEMPOTENCY_CONFLICT`。不再保存第二份 `idempotency_key`。技术失败不写事件。每次清除写入对应的 `clear_word`、`clear_book` 或 `clear_user` 事件并建立 tombstone；清除既有事件时只擦除敏感正文和原 owner ID，不重写其他业务事实。

索引包括 `(user_id, card_id, generation, occurred_at DESC, event_id)`、`(user_id, event_kind, occurred_at DESC)` 和 `(user_id, source_id, occurred_at DESC)`。原始答案默认保留并参与 JSON 导出，但清除后必须为 `NULL`；被擦除的最小事件骨架不进入面向用户的历史、指标或普通导出。

### 4.4 `ql_longterm_session`

保存正式与提前练习会话，可跨进程恢复。

| 字段                                        | 约束与含义                                     |
| ------------------------------------------- | ---------------------------------------------- |
| `session_id`                                | 主键，UUID                                     |
| `user_id` / `owner_hash`                    | 活动归属或清除后的不可逆归属摘要               |
| `session_kind`                              | `formal` 或 `early`                            |
| `state`                                     | `active`、`completed`、`abandoned` 或 `erased` |
| `requested_size`                            | 正式 5–100；提前 1–100                         |
| `selection_time`                            | 到期判断和初始选卡的固定时间                   |
| `random_version`                            | 固定 `sha256-session-card-v1`                  |
| `initial_count`                             | 初始卡片数                                     |
| `completed_count`                           | 已最终 Good 的初始卡片数                       |
| `current_item_id`                           | 当前可展示条目，可空                           |
| `started_at` / `updated_at` / `finished_at` | 生命周期时间                                   |
| `erased_at`                                 | 隐私擦除时间，可空                             |
| `version`                                   | 会话 CAS 版本                                  |

索引为 `(user_id, session_kind, state, updated_at DESC)`。每种 kind 最多一个 active 会话由事务内冲突检查保证；如后端支持等价的部分唯一约束可同时建立，但不能依赖某一后端独有行为。

### 4.5 `ql_longterm_session_item`

冻结会话卡片集合和队列状态。

| 字段                        | 约束与含义                             |
| --------------------------- | -------------------------------------- |
| `session_item_id`           | 主键，UUID                             |
| `session_id`                | 关联会话                               |
| `user_id` / `owner_hash`    | 活动归属或清除后的不可逆归属摘要       |
| `card_id` / `generation`    | 冻结卡片身份                           |
| `initial_order`             | 初始稳定随机顺序                       |
| `queue_order`               | 当前队列顺序的单调序号                 |
| `state`                     | `ready`、`waiting`、`good` 或 `erased` |
| `retry_not_before`          | Again 后至少一分钟的可重试时间         |
| `attempt_count`             | 本会话已提交次数                       |
| `first_again_counted`       | 正式会话是否已为该卡增加 lapse         |
| `first_event_id`            | 本条目第一次成功作答事件，可空         |
| `completed_event_id`        | 使本条目最终 Good 的作答事件，可空     |
| `version`                   | 条目 CAS 版本                          |
| `created_at` / `updated_at` | 时间                                   |
| `erased_at`                 | 隐私擦除时间，可空                     |

唯一约束为 `(session_id, card_id, generation)`。索引包括 `(session_id, state, retry_not_before, queue_order)`。队尾移动通过分配大于当前最大值的 `queue_order` 完成；读取时跳过 `retry_not_before > now` 的条目，并返回最早可用倒计时。所有条目为 `good` 才能把会话改为 `completed`。

### 4.6 `ql_longterm_tombstone`

记录清除边界、防复活代次和未来同步所需的最小非敏感事实。

| 字段                 | 约束与含义                                                         |
| -------------------- | ------------------------------------------------------------------ |
| `tombstone_id`       | 主键，UUID                                                         |
| `owner_hash`         | 非空；带 `quicklang-longterm-owner-v1` 域分隔的 owner SHA-256 摘要 |
| `scope`              | `word`、`book` 或 `user`                                           |
| `card_id`            | 词级清除必填                                                       |
| `cleared_generation` | 词级清除的最高代次                                                 |
| `book_id_hash`       | 书级清除使用带应用域分隔的不可逆摘要，不保留书名或原始 book ID     |
| `cleared_at`         | 服务端清除时间                                                     |
| `event_id`           | 对应清除事件 ID，同时是调用方 `operationId`                        |
| `version`            | 墓碑版本，供未来同步冲突比较                                       |

活动实体的 `owner_hash` 为 `NULL`。任何清除事务都先对 UTF-8 字节 `"quicklang-longterm-owner-v1" || 0x00 || user_id` 计算 SHA-256，得到 64 个小写十六进制字符；所有受影响的 `erased` 最小骨架行将原 `user_id` 物理置 `NULL` 并写入该 `owner_hash`。按用户清除时这一规则覆盖该用户的全部六表行。tombstone 从创建起只保存 `owner_hash`，从不保存原 `user_id`。不得物理删除整个 card、source、event、session、session_item 或 tombstone 实体行。

唯一约束至少包括 `(owner_hash, event_id)`；词级防复活查询索引为 `(owner_hash, card_id, cleared_generation DESC)`。Repository 接到活动 `user_id` 后使用同一域分隔算法计算 owner hash，再查询 tombstone。墓碑不得保存规范词形、展示拼写、原始答案、书名、词条正文或可逆来源标识。

### 4.7 Repository 逻辑外键

六表关系全部由 Repository 在同一事务中强制，不依赖数据库物理外键或 `ON DELETE CASCADE`：

- source → card：`ql_longterm_source.(card_id, generation)` 必须指向同一活动 `user_id` 的 card；清除后则必须具有相同 `owner_hash`。
- event → card/source/session/session_item：所有非空引用必须与事件具有相同活动 `user_id` 或相同清除后 `owner_hash`，card 和 item 引用还必须具有相同 generation。`ordinary_error`、`manual_add`、`source_link`、`source_unlink` 必须引用 card/source；`formal_attempt`、`early_attempt` 必须引用 card/source/session/session_item；`session_abandon` 只要求 session，card/source/item 必须为空；`lifecycle_pause`、`lifecycle_resume` 必须引用其 card/source；`clear_word` 必须引用 card，`clear_book` 和 `clear_user` 的 card/source/session/session_item 均为空。
- session.current_item_id → session_item：非空时必须指向同一 session、同一活动 `user_id` 或同一 `owner_hash` 的 item；终态或擦除时显式置空。
- session_item → session/card/first_event/completed_event：item 的 session 和 card 必须属于相同活动 `user_id` 与 generation，清除后必须具有相同 `owner_hash`。非空 `first_event_id`、`completed_event_id` 必须指向该 item 的 `formal_attempt` 或 `early_attempt`；`completed_event_id` 还必须是 `attempt_result = good`。
- card.recent_wrong_source_id → source：非空时必须指向同一活动 `user_id`、同一 card ID 和 generation 的 source；source 进入 `deleted`/`erased` 后，业务事务必须将该引用置空或原子切换到固定回退规则选出的有效来源。

Repository 在每次写入、CAS、恢复和清除时验证这些逻辑外键。来源软删除、实体擦除、会话条目失效和反向引用清理由业务事务显式维护，不交给数据库隐式级联。禁用物理 cascade 是固定方案：清除后仍需保留最小骨架、事件审计和 tombstone 防复活事实，而且 seekdb 与 SQLite 的级联能力和错误时机不能成为领域行为差异。

### 4.8 DDL 落地映射（#46 实现记录）

规范 DDL 位于 `src/schema/ql_longterm_{card,source,event,session,session_item,tombstone}.sql`（MySQL/OceanBase 语法，由 `storage-seekdb/build.rs` 自动收录）；iOS SQLite 的语义等价 DDL 位于 `storage-seekdb/src/sqlite_schema.sql`，由 `sqlite_tests.rs::sqlite_schema_covers_every_canonical_table` 校验覆盖。字段类型按后端映射如下，范围、唯一性、排序和事务结果两端一致：

| 领域类型 | MySQL/OceanBase 列类型 | SQLite 列类型 |
| --- | --- | --- |
| 用户/来源/会话/事件/墓碑 ID | `VARCHAR(128/64) COLLATE utf8mb4_bin` | `TEXT COLLATE BINARY` |
| 时间（UTC Unix 毫秒） | `BIGINT` | `INTEGER` |
| 计数、天数、阶梯、版本 | `INT` / `BIGINT UNSIGNED` | `INTEGER`（`generation >= 1`、`interval_days BETWEEN 0 AND 3650` 加 CHECK） |
| 布尔（0/1） | `TINYINT(1) UNSIGNED NOT NULL DEFAULT 0` | `INTEGER NOT NULL DEFAULT 0` |
| 枚举（state/kind/scope 等） | `VARCHAR(8..32) COLLATE utf8mb4_bin` | `TEXT COLLATE BINARY` |
| 原始答案 | `VARCHAR(1024)`（Repository 校验上限，不静默截断） | `TEXT` |
| 调度快照 JSON | `TEXT`（Repository 校验大小上限与 JSON schema） | `TEXT` |

落地约定：

- 索引命名两端一致：主键/唯一约束/索引分别使用 `PRIMARY KEY`、`UNIQUE INDEX uk_longterm_*`（MySQL）与 `CREATE UNIQUE INDEX uk_longterm_*`（SQLite），普通索引 `idx_longterm_*`；SQLite 端不使用匿名 `UNIQUE` 表约束，避免生成 `sqlite_autoindex_*` 匿名索引导致两端索引清单不一致。
- `ql_longterm_card.due_at` 在两端均为 `NOT NULL`：active 卡必有到期时间，paused 卡保留原排期，erased 最小骨架保留非敏感事实。
- 六表均无物理外键、无 `ON DELETE CASCADE`（§4.7 固定方案）。
- 领域身份（`nfkc-lower-v1`、card ID、owner hash、generation 规则）与全部枚举、错误码常量落地在 `quicklang-domain::longterm`，纯逻辑无 I/O，双后端共享。

## 5. Repository 与事务边界

### 5.1 平台中立 Repository

业务层依赖平台中立接口，不暴露 SQL、seekdb 句柄或 SQLite 类型：

- `recordOrdinaryError(command)`
- `createOrResumeFormalSession(command)`
- `createOrResumeEarlySession(command)`
- `submitLongtermAttempt(command)`
- `getActiveSession(query)` / `abandonSession(command)`
- `listCards(query)` / `getCardDetail(query)` / `getMetrics(query)`
- `addCardManually(command)`
- `changeSourceState(command)`
- `clearLongtermData(command)`
- `exportLongtermData(command)`（#54-A 已落地：目的地由 `command.output_path` 承载，"Repository 是唯一知道临时路径、flush/sync 点与原子重命名的组件"；流式出口是 Repository 内部的写盘实现，不是调用方传入的 sink）

macOS seekdb 和 iOS SQLite 必须通过同一套 Repository 契约测试。排序、空值、分页、事务回滚、唯一冲突、时间精度和错误映射不得因后端不同而改变。

### 5.2 普通错误原子事务

当前普通背诵的 session、`learned`、activity 和 vocabulary 都位于 `ql_app_state` 的用户域 JSON 键中。0.7.0 必须新增一个 native Repository 事务入口承载 `recordOrdinaryError`；前端不得继续先调用 `setSaved` 提交 session/进度，再通过 `onWrong` 独立写生词表或长期记录。

`recordOrdinaryError` 在同一个底层数据库事务中执行：

1. 以 `event_id = operationId` 查重并比较 `payload_hash`；已有相同请求则返回原结果，同 ID 不同内容则报冲突。
2. 读取并校验 `ql_app_state` 中当前用户的普通背诵 session、`learned`、activity 和 vocabulary JSON，核对当前题及请求携带的 expected version/snapshot token。
3. 计算短期错误状态、`learned`/activity 进度和生词表变更，保持累计答对两次规则，但尚不对外发布。
4. 规范化词形，读取墓碑并选择当前或新 generation。
5. upsert `ql_longterm_card` 和 `ql_longterm_source`，按逻辑外键验证来源。
6. 写入 `event_id = operationId`、包含原始答案和 `payload_hash` 的 `ordinary_error` 事件。
7. 把 card 的 `last_error_at` 和 `due_at` 更新为本次错误时间及其后 24 小时，重置步骤，更新最近答错来源并增加版本。
8. 在同一事务中写回上述 `ql_app_state` 相关键和六表变更；任一步失败都整体回滚。
9. 提交后返回由 Repository 重新读取或事务结果构造的 canonical app-state snapshot、事件和 card 摘要，前端只用该 snapshot 更新界面并前进。

UI 在失败时保持当前题并显示可重试错误。禁止先 `setSaved`、再 `onWrong`，也禁止先提交 `ql_app_state` 后异步“尽力写入”长期记录。

### 5.3 幂等、CAS 与时间

- 每个改变状态的 API 都要求 UUID `operationId`；凡写事件的调用直接将其作为唯一 `event_id`，不另设 `idempotency_key`。
- 同一 operation ID、相同 `payload_hash` 返回原结果；同 ID 不同规范化命令返回 `LONGTERM_IDEMPOTENCY_CONFLICT`。
- card、source、session、session_item 使用 `version` 做 CAS；普通错误还必须校验 `ql_app_state` snapshot token。版本不符返回当前版本摘要，不自动覆盖。
- 领域层使用注入时钟。客户端时间可作为诊断字段，但排期、清除顺序和事件有效时间以本地业务服务时钟为准。
- 数据库忙可做有界退避重试；唯一冲突必须重新读取后按幂等或 CAS 规则处理，不能盲目重复累加。

### 5.4 Repository 契约与事务原语落地（#47 实现记录）

`storage-api::longterm` 定义平台中立契约，`storage-seekdb::longterm` 在 seekdb（`native.rs`）与 SQLite（`sqlite.rs`）上给出同一套实现；行锁片段取自 `dialect.rs` 的 `FOR_UPDATE`（seekdb 为 ` FOR UPDATE`，SQLite 为空串），两个后端共用同一段代码。唯一键冲突不在语句层吞掉：所有插入先在事务内读回，撞主键按 `LONGTERM_STORAGE_FAILURE` 或幂等规则判定，避免两端对冲突时机的理解差异。

**契约分层**

- `LongtermRepository`（§5.1 业务方法）：本次只定义签名，方法体返回 `LONGTERM_STORAGE_FAILURE`，message 形如 `list_cards not implemented until #52`，可被 IPC 稳定处理且不含后端细节。遗留归属：#48 `recordOrdinaryError`；#50 正式/提前会话创建、作答提交、活动会话查询与放弃；#51 来源状态变更与清除；#52 列表、详情、指标与手动加入；#54 JSON 导出。
- `LongtermStorage`（本次实现的 17 个原语）：`writeEvent`、`readEvent`、`listEventsForCard`、`readCard`、`upsertCard`、`readSource`、`upsertSource`、`createSession`、`readSession`、`createSessionItem`、`readSessionItem`、`readTombstoneGeneration`、`casUpdateCard`、`casUpdateSource`、`casUpdateSession`、`casUpdateSessionItem`、`transaction`。
- §4.7 校验器是 trait 默认方法，双后端共享同一逻辑：`validateEventRefs`、`validateSourceRefs`、`validateCardRefs`、`validateSessionRefs`、`validateSessionItemRefs`（及其 `validateAttemptEventRef` 尾部）。原语在写入前调用，因此 Memory、SQLite 与 seekdb 的外键判断逐字一致。

**事务运行器（§5.2）**

`LongtermStorage::transaction(closure)` 是复合写入的唯一边界。底层 `Native::transaction` 维护连接级嵌套深度：嵌套调用直接并入外层事务，只有最外层负责提交或回滚，计数在成功、错误和 unwind 三条路径上都会归零。于是 `recordOrdinaryError` 可以把 `upsertSource`、`upsertCard`、`writeEvent`、`casUpdateCard` 与 `ql_app_state` 写入拼成一个原子单元，任一步失败都不留半张卡片或孤立历史。Memory 后端用快照复制实现同一语义。

**payload_hash 字节布局（§4.3）**

`SHA-256("quicklang-longterm-event-v1" || 0x00 || <canonical_command_json>)`，输出 64 位小写十六进制；域分隔符常量 `PAYLOAD_HASH_DOMAIN` 位于 `storage-seekdb::longterm`。固定向量：`payload_hash(r#"{"event_id":"evt-1"}"#)` = `2d9e06971605ab38b6db537f08adb1dd627ecb52596eedc8bca1f30aae2d5548`。哈希由调用方（#48 起的业务方法）基于规范命令 JSON 计算后写入事件行，`writeEvent` 只负责比对。

**NULL 哨兵与 owner_hash（§4.2、§4.6）**

手动来源没有 `book_id`/`item_id`，两个后端都写入常量 `__quicklang_null__`（`NULL_SENTINEL`）并在读取时还原为 `None`，保证唯一键 `(user_id, card_id, generation, source_kind, book_id, item_id)` 两端语义一致——MySQL 允许唯一索引中出现多个 `NULL`，哨兵消除了这一差异。活动行的 `owner_hash` 一律为 `NULL`；`readTombstoneGeneration` 在读取时按 `owner_hash(user_id)` 求 `MAX(cleared_generation)`，不预写摘要。

**generation 指派（§3.3）**

`upsertCard` 先重算 `card_id = cardId(user_id, normalized_spelling)`，不匹配返回 `LONGTERM_IDENTITY_COLLISION`；再读墓碑与 `MAX(generation)`：`generation <= cleared` 返回 `LONGTERM_CLEARED`，新建行必须恰好等于 `next_generation(cleared, max)`，否则 `LONGTERM_INVALID_ARGUMENT`。行已存在时校验 `user_id` 与 `normalized_spelling` 一致后按合并行整体更新。

**稳定排序与输入边界（§4.3、§4.8）**

`listEventsForCard` 固定 `ORDER BY occurred_at DESC, event_id ASC`：主键是事件时间，最终 tie-breaker 是 `event_id`，同时间戳的分页与导出不会重复或丢行；`limit` 只接受 `1..=500`，越界返回 `LONGTERM_INVALID_ARGUMENT` 而不是静默截断。`answer_raw` 超过 1024 字符同样在存储边界拒绝，不截断原文。

**错误映射（§9.2）**

| 后端信号 | 稳定错误码 | 可重试 |
| --- | --- | --- |
| 锁等待超时/死锁（MySQL 1205、1213 → `DB_LOCKED`） | `LONGTERM_STORAGE_BUSY` | 是 |
| 语句执行失败（`EVENT_CONFLICT`、`DB_QUERY_FAILED`、`DB_IO_FAILED`、`DB_INVALID_RESULT` 等） | `LONGTERM_STORAGE_FAILURE`，message 不含 SQL、路径与后端原文 | 否 |
| 事务 begin/commit 失败 | 仅 `DB_LOCKED` → `LONGTERM_STORAGE_BUSY`，其余原样透传 | 视错误而定 |
| 同 `event_id` 不同 `payload_hash` | `LONGTERM_IDEMPOTENCY_CONFLICT` | 否 |
| CAS 版本不符 | `LONGTERM_VERSION_CONFLICT` | 是 |
| CAS/按 ID 读取的行不存在，或引用行对当前用户不可见 | `LONGTERM_NOT_FOUND` | 否 |
| 必填引用缺失、禁用引用出现、终态仍持 `current_item_id`、两行字段互相矛盾 | `LONGTERM_INVALID_ARGUMENT` | 否 |
| 身份重算不匹配（§3.2） | `LONGTERM_IDENTITY_COLLISION` | 否 |
| generation 已被墓碑覆盖（§3.3） | `LONGTERM_CLEARED` | 否 |
| 建会话/会话项时主键已存在 | `LONGTERM_STORAGE_FAILURE` | 否 |
| 后端结果无法解析 | `LONGTERM_STORAGE_FAILURE` | 否 |

事务边界只翻译锁信号，`LONGTERM_*` 与其他仓储的错误码一律原样透传，避免 #48 在同一事务中写 `ql_app_state` 时被改写。

**契约测试（§12.2）**

19 个共享用例同时跑在三套后端上：幂等重试、`payload_hash` 冲突、CAS 版本冲突、逻辑外键违规、事件引用规则（必填/禁用/`attempt_result`）、`event_kind` 枚举封闭、身份冲突、generation 指派、事务注入失败回滚、事务整体提交、NULL 哨兵往返、稳定事件排序、会话 CRUD、会话项 CRUD、会话项外键、`current_item_id` 规则、墓碑 generation、来源 CRUD、`answer_raw` 1024 字符上限。SQLite 与 seekdb 侧各另加一次重复建库初始化幂等。

```bash
cargo test -p quicklang-storage-api --offline
cargo test -p quicklang-storage-seekdb --offline --lib longterm
cargo test --locked --offline -p quicklang-tests --test longterm               # Memory
cargo test --locked --offline -p quicklang-tests --test longterm --features sqlite
```

本机 `make init` 未能拉取 seekdb 运行时（github.com 下载超时，`deps/cache/seekdb-runtime` 为空），20 个 seekdb 用例保持 `#[ignore]`，由 #55 在具备运行时的机器上补齐。

**后续 issue 的接口用法**

- #48：在 `recordOrdinaryError` 的同一个 `transaction` 中先 `upsertSource` 再 `upsertCard`（`recent_wrong_source_id` 校验要求来源已存在），最后 `writeEvent`；`payload_hash` 由业务侧计算后传入。
- #50：`createSession` 与全部 `createSessionItem` 必须在同一 `transaction` 中完成（§6.1）；终态会话先用 `casUpdateSession` 清空 `current_item_id`，再置 `Completed`/`Abandoned`，否则返回 `LONGTERM_INVALID_ARGUMENT`。
- #51：清除需要写入墓碑与 `erased` 行；本 issue 只提供 `readTombstoneGeneration` 与 CAS，写入面留给 #51，但清除后旧 generation 的 `upsertCard` 已会被 `LONGTERM_CLEARED` 拦截。
- #52：卡片列表的排序与游标本 issue 未实现；事件侧的稳定序 `listEventsForCard` 已就绪，可直接用于详情与导出。
- #54：导出按 `listEventsForCard` 的稳定序，并用 `transaction` 取一致快照。

### 5.6 跨代理契约分歧裁决（波次 2.5）

#50、#48 与 #51 的并行实现对同一批契约给出互不兼容的读法，且其中两条在真实链路上必然失败。本节按本文件原文裁决并固定实现要求；上文 §5.3、§6.1、§6.2、§9.1、§14.2 为唯一依据。

#### 5.6.1 `submit_longterm_attempt` 的 `expected_version` 比对哪一行

**裁决：会话条目（`ql_longterm_session_item.version`）。**

依据：

- §6.2 第 1 步把该转移的 CAS 明确写作"幂等检查和 **session/item** CAS"；§6.3 全程未出现 card CAS。
- §4.5 定义条目 `version` 为"条目 CAS 版本"，§4.4 定义会话 `version` 为"会话 CAS 版本"，§4.1 的 card `version` 只是"从 1 开始的 CAS 版本"，不带调用方语义。
- §6.4 把"session 当前版本"明确指派给**放弃**命令；§9.1 规定一个状态更新只有一个 `expectedVersion`。若 submit 用 card 版本，会话版本将无调用方，而会话版本恰恰是 abandon 的 token；若 submit 同时要求两者，UI 必须在一次作答里维护两个 token，与 §9.1 冲突。
- 卡片行是被**改写**的行，不是调用方观测到的行：§6.2 第 3–4 步用"从当前 `schedule_step` 选择下一阶梯"推进排期，`expectedVersion` 没有对应的可观测对象（§9.1 的响应只回 item/session 摘要与 card 摘要，UI 手上的"当前条目"是 item）。
- §5.3 只要求四张表各自"使用 `version` 做 CAS"，并要求"唯一冲突必须重新读取后按幂等或 CAS 规则处理"。这由 Repository 内部完成：卡片行与会话行都用**事务内读到**的版本做 `cas_update_*`，并发改写整笔回滚。

实现要求：三层一致——`SubmitLongtermAttemptCommand::expected_version` 是条目版本；`sr_submit_attempt` 比对 `item.version`；IPC 的 `LongtermCurrentItem::version` 即该 token。放弃命令不变，仍用会话版本。提前练习不再有"只校验不写"的例外（条目版本每次提交都会推进，提前练习同样推进）。

#### 5.6.2 幂等哈希与服务端打戳

**裁决：服务端打戳字段不进哈希，其余字段全进。**

依据：§5.3 同时要求"领域层使用注入时钟……事件有效时间以本地业务服务时钟为准"与"同一 operation ID、相同 `payload_hash` 返回原结果"；§14.2-4 把两者写成同一条不变量。若 `payload_hash` 覆盖 `occurred_at`，application 每次调用重新打戳后，时钟一前进，同一命令的重放就会落到 `LONGTERM_IDEMPOTENCY_CONFLICT`——客户端没有改任何参数却被判为"同 ID 不同命令"，与 §5.3 第一条直接冲突。§5.3 还明确"客户端时间可作为诊断字段"，诊断字段因此不属于命令身份。

实现要求：

- `submit_longterm_attempt`：`occurred_at` 置零后参与哈希；事件行仍写真实有效时间，`retry_not_before = occurred_at + 60_000` 仍由服务端时钟推导（§6.3）。
- `create_or_resume_formal_session` / `create_or_resume_early_session`：`selection_time` 同理不参与身份判定；重放只比对调用方真正拥有的字段（`requested_size` 与显式 `card_ids`）。重放检查必须**先于**任何选卡工作，否则时钟推进后重新选卡会得到不同集合并误报冲突。
- 回归：同命令、时钟前进 60 s 重放 → `already_applied`；同 `operation_id` 换答案或换 token → `LONGTERM_IDEMPOTENCY_CONFLICT`。

#### 5.6.3 正式到期选卡由谁执行

**裁决：后端，且在创建事务内。**

依据：§6.1 把"按逾期层级优先级和稳定随机键排序，取请求组大小"写成后端责任，并规定"创建 session 与全部 session_item 在同一事务完成"；候选条件依赖来源状态、墓碑与"是否已在另一个 active 正式会话"，这些只有存储层看得见。§2.4 规定组大小 5–100 可配置，§8.1 规定真正创建使用服务端当前 UTC 时刻。

实现要求：`formal` 且 `card_ids` 为空 → 加载候选（`active`、`due_at <= selection_time`、至少一个 active 来源、无覆盖该 generation 的墓碑、不在其他 active 正式会话）→ 调 #49 `select_due_cards(candidates, 确定性 session_id, selection_time, requested_size)` → 冻结选卡集。`early` 仍须显式 1–100 张。候选为空返回 `LONGTERM_NOT_FOUND`（§9.2：没有可复习的可见对象），不得冻结空会话，也不得用未到期卡凑数（§14.2-8）。

#### 5.6.4 IPC 必须经过 application 层

**裁决：`longterm_create_session` / `longterm_get_active_sessions` / `longterm_submit_attempt` / `longterm_abandon_session` 一律经 `quicklang_application::longterm::*`。**

依据：§5.2 要求前端不得绕过 Repository；§9.1 规定"UI 不计算身份、排期、统计或会话完成条件"；§5.3 与 §6.1 要求排期与有效时间来自本地业务服务时钟；§9.2 的 `LONGTERM_SESSION_EXISTS` 语义（打开既有会话）需要 application 层的活动会话兜底；§2.3 的评分复核需要 `grade_attempt` 在边界再执行一次。

实现要求：IPC 只做 DTO 校验、可选的活动会话版本守卫与响应渲染；`selection_time` / `occurred_at` 由注入时钟（`storage.rs` 的 `WallClock`）给出，客户端同名字段仅作诊断。`longterm_record_ordinary_error` 在 #48 的 application 入口落地前仍直连 Repository——它是唯一例外，且不得据此推广。五个命令的 DTO 键名、错误映射与 `payload` 结构对前端保持不变。

#### 5.6.5 留给 #53 / #55 的契约

- #53：`longterm_submit_attempt` 的 `expectedVersion` 必须原样取 `longterm_get_active_sessions` 返回的 `currentItem.version`；`longterm_abandon_session` 的 `expectedVersion` 取 `session.version`。`occurredAt` 可继续透传客户端时间作诊断，不得用于排期。
- #53：正式复习入口**不传** `cardIds`，由后端按 §6.1 选卡；提前练习必须传 1–100 张。无到期卡时收到 `LONGTERM_NOT_FOUND` 属正常空态，不应作为错误弹窗。
- #55：§14.2-13 的双后端一致性核对需覆盖本节四项；`select_due_cards` 的选卡输入现在由后端构造，seekdb 与 SQLite 必须给出同一集合。

## 6. 调度、选卡与会话状态机

### 6.1 正式到期选卡

候选必须同时满足：

- 属于当前用户和当前 generation。
- card 为 active，`due_at <= selection_time`。
- 至少有一个 active 来源。
- 不存在覆盖该 generation 的词级或用户级墓碑。
- 未出现在另一个 active 正式会话中。

按逾期层级优先级和稳定随机键排序，取请求组大小。创建 session 与全部 session_item 在同一事务完成。若已有正式 active session，则返回该会话而不是重选。

首页“今日到期”以用户本地日界线显示 `due_at` 已到期的数量，但真正创建会话使用服务端当前 UTC 时刻，不把明日卡提前算入。时区变化只影响“今日”展示边界，不重写已保存 UTC 排期。

### 6.2 Good 状态转移

正式 Good 在一个事务中：

1. 幂等检查和 session/item CAS。
2. 确认没有提示、揭晓、跳过，且判题正确。
3. 从当前 `schedule_step` 选择下一阶梯；步骤 0 的下一间隔为 1 天。
4. 更新 `interval_days`、`due_at`、`last_review_at`；首次达到 30 天时设置 `mastered_at`。
5. 追加 `event_kind = formal_attempt`、`attempt_result = good` 的事件及前后调度快照。
6. 首次作答时设置 item 的 `first_event_id`，把本事件写入 `completed_event_id`，将 item 标为 good，并更新会话完成数和下一条目。
7. 全部初始 item 均 good 时完成 session。

### 6.3 Again 状态转移

正式 Again 在一个事务中：

1. 把错误、提示、揭晓或跳过统一映射为 Again。
2. 追加 `event_kind = formal_attempt`、`attempt_result = again` 的事件，保留原始答案及评分依据；首次作答时设置 item 的 `first_event_id`。
3. 把 card 步骤重置为 0，间隔设为 1 天，`last_error_at = now`、`due_at = now + 24h`。
4. 若 item 的 `first_again_counted = false`，card 的 `lapse_count + 1` 并把标志设为 true。
5. item 改为 waiting，`retry_not_before = now + 1 分钟`，移到队尾。

提前练习执行相同队列动作并写 `event_kind = early_attempt`，由 `attempt_result` 区分 `again`/`good`，但 card 的 schedule、mastered、lapse 和版本不因评分改变。Good 设置 `completed_event_id`，第一次已提交尝试设置 `first_event_id`。来源删除或隐私清除仍可使提前会话中的条目失效；失效条目标记为 `erased` 并记录非敏感原因，不物理删除。

### 6.4 状态机与恢复

```text
无活动会话 → active → completed
                    ↘ abandoned
```

- `completed` 和 `abandoned` 为终态。
- 创建、提交、放弃使用 CAS；终态后的新提交返回 `LONGTERM_SESSION_FINISHED`。
- 恢复读取 session 和 items，不重新选卡、不重新随机、不清零一分钟等待。
- API 返回 `nextAvailableAt`。若所有未完成条目都在等待，UI 显示最早倒计时并禁用评分，不用忙轮询。
- 放弃要求客户端先展示二次确认，再发送带 session 当前版本和 `operationId` 的命令；后端在同一事务写入 `session_abandon` 事件并把 session 改为 `abandoned`，不能仅靠界面确认保证安全。

### 6.5 调度算法落地记录（#49 实现）

长期调度已落地为纯函数模块 `src/crates/scheduler/src/longterm.rs`（`quicklang_scheduler::longterm`），无 I/O、无数据库访问、不读取系统实时时钟；所有函数接受 `now`/`effective_at_ms` 参数，随机性仅来自输入 `session_id` 的哈希，可注入时钟并完整回放。旧 SM-2 调度器（`quicklang-sm2-v1`）保持独立、未改动。

**阶梯计算伪代码**（`interval_for_step(step)`，单位天；1 天 = 24 小时 = 86_400_000 ms）：

```text
interval_for_step(step):
  step == 0        → 0（尚无成功的 Good）
  1..=5            → 固定阶梯 [1, 3, 7, 14, 30][step - 1]
  6..=11           → 30 × 2^(step - 5)（即 60、120、240、480、960、1920）
  step >= 12       → 3650（30 × 2^7 = 3840 截断到 10 年上限）
```

- `next_good(state, effective_at_ms)`：`next_step = schedule_step + 1`，`interval_days = interval_for_step(next_step)`，`due_at = effective_at_ms + interval_days × 24h`（按服务端有效时间，不按客户端显示时间）。当 `interval_days >= 30` 且此前未掌握时返回 `mastered_at = Some(effective_at_ms)`（首次达到 30 天时写入），否则返回 `None`（不重写已有 `mastered_at`；已掌握不是终止状态）。step 0 的下一间隔为 1 天。
- `next_again(state, effective_at_ms)`：`next_step = 0`、`interval_days = 1`、`last_error_at = effective_at_ms`、`due_at = effective_at_ms + 24h`。当前阶梯与间隔不参与重置；`mastered_at` 不在结果中——`Again` 不清除掌握状态，由调用方保留已有值。同一重置规则也适用于普通背诵错误写入长期卡（§2.2、§5.2）。

**逾期分层边界**（`classify_overdue(due_at, now)`，`overdue = now - due_at`）：

| 层          | 精确边界                                             |
| ----------- | ---------------------------------------------------- |
| `<1 天`     | `0 <= overdue < 1 天`（含 0，不含 86_400_000 ms）     |
| `1–6 天`    | `1 天 <= overdue < 7 天`（含 86_400_000，不含 604_800_000） |
| `7–29 天`   | `7 天 <= overdue < 30 天`（含 604_800_000，不含 2_592_000_000） |
| `30+ 天`    | `overdue >= 30 天`（含 2_592_000_000）               |

`due_at > now`（未到期）返回 `None`。选卡优先级为 `30+ → 7–29 → 1–6 → <1`。

**稳定随机键字节布局**（`stable_random_key`）：SHA-256 摘要输入为 UTF-8 字节拼接 `session_id || 0x00 || card_id || 0x00 || generation`，其中 `generation` 为其**十进制 ASCII 字符串表示**（如 `"1"`、`"42"`），与 §3.2 的字符串式域分隔布局保持一致；输出为 32 字节原始摘要。排序按摘要字节序升序，tie-breaker 依次为 `card_id`（字节序）与 `generation`（数值）。相同输入（含 `session_id`、候选集、`limit`）必然产生相同输出，不使用系统随机源。

**今日计数的时区规则**（`count_due_today(candidates, now_ms, local_timezone_offset_minutes)`）：`offset_ms = offset_minutes × 60_000`（东经为正，如 UTC+8 = +480、UTC-5 = -300，合法范围 ±840 分钟）；`local_now = now_ms + offset_ms`，按本地日界线统计 `due_at + offset_ms < 本地明日 00:00` 的可见卡片（含今日稍后到期与历史逾期卡片，不含明日及以后）。时区偏移只移动展示边界，不重写已保存 UTC 排期；创建会话必须使用服务端当前 UTC 时刻并按 `due_at <= selection_time` 严格过滤，因此"今日稍后到期"的卡片不会提前进入会话。计数与到期选卡共用同一非时间可见性过滤（active 卡、至少一个 active 来源、无覆盖该 generation 的词级/用户级墓碑、未出现在另一 active 正式会话）。

**实现记录**：

- `CardScheduleState`（`schedule_step`/`interval_days`/`mastered_at`）为纯输入快照，由 #47 Repository 从 `ql_longterm_card` 行构造，并把 `GoodSchedule`/`AgainSchedule` 的结果回写；`GoodSchedule`/`AgainSchedule` 字段名与 §4.1 卡片列一致（`next_step`→`schedule_step`、`interval_days`、`due_at`、`last_error_at`）。
- `select_due_cards(candidates, session_id, selection_time, limit)` 返回有序 `card_id` 列表；`limit` 为正式组大小，默认 20、可配置 5–100，越界（如 0、101）返回 `LONGTERM_INVALID_ARGUMENT`。候选可见性由调用方（#47）保证，本函数仍按 §6.1 条件复核。
- `apply_formal_attempt(state, effective_at_ms, result)` 按 `AttemptResult` 分派 `next_good`/`next_again`；`apply_early_attempt(state, effective_at_ms, result)` 返回**原样不变**的排期（提前练习不修改排期、步骤、掌握状态或 lapse），仅计算归属 #50 会话状态机的队尾/1 分钟等待辅助量（`retry_not_before`、`retry_not_before_again`）。"同会话只增一次 lapse""队尾移动"由 #50 状态机拥有，本模块不实现。
- 单元测试位于模块内 `#[cfg(test)]`（21 个）：阶梯 1/3/7/14/30、翻倍 60/120/240/480/960/1920、3650 上限、30 天掌握标记与不重写；Again 24 小时重置与 step 归零；逾期层级 1/6/7/29/30 天整点边界；稳定随机固定向量与摘要序排序、组大小 5/20/100 与 limit 校验（0/101 等拒绝）；相同输入重复调用结果完全一致；今日到期跨日界线与时区偏移。
- 验证命令与结果：`cargo test -p quicklang-scheduler --offline`（21 passed）、`cargo clippy -p quicklang-scheduler --all-targets --offline -- -D warnings`（通过）、`cargo fmt -p quicklang-scheduler`（已应用）。

## 7. 来源生命周期、清除与隐私

### 7.1 删除、暂停与恢复

- 首次关联词书或手动来源时写 `source_link`；解除关联或删除词书时写 `source_unlink`，并把对应 source 标为 `deleted`。共享卡片的排期、步骤、lapse 和其他来源不重算。
- 暂停词书时写 `lifecycle_pause` 并把 source 标为 `paused`。没有其他 active 来源的卡片停止进入正式选卡，但历史和原排期保留。
- 恢复词书时写 `lifecycle_resume`，仅恢复仍对应相同规范词形的 source；拼写变化按新词处理。
- 来源状态改变及对应事件必须在同一事务提交，使列表、详情、选卡和活动会话看到一致状态。
- 最近答错来源失效后，展示查询按固定回退规则选择其他有效来源，不把历史事件改写成来自另一词书。

### 7.2 清除范围

提供按词、按书、按用户三种操作，均保留 `erased` 最小骨架、写入对应清除事件并建立 tombstone，不物理删除整个实体行：

- **按词**：把指定 card ID 当前及历史 generation 的 card、source、相关事件和会话条目标记为 `erased`，敏感正文物理置 `NULL`，写 `clear_word` 事件并建立词级 tombstone。以后重遇使用新 generation。
- **按书**：把该书 source 及只依赖该来源的可识别关联标记为 `erased`，敏感来源字段物理置 `NULL`，写 `clear_book` 事件并建立书级 tombstone。跨词书共享 card 的排期不重算；仍有其他有效来源时卡片继续存在。只由该书支持的卡片变为无有效来源，不再选入。
- **按用户**：把该用户所有长期 card、source、event、session 和 session_item 标记为 `erased`，敏感正文与原 `user_id` 物理置 `NULL`，仅保留带域分隔 SHA-256 `owner_hash` 的最小骨架；写入的 `clear_user` 事件及用户级 tombstone 同样只保留该不可逆归属，不保留原 owner ID。

清除操作原子、幂等，活动会话中的受影响条目同时失效。每次清除只擦除既有业务事件的敏感正文和原 owner ID，不改写其事件类型、时间、评分结果等非敏感事实；清除动作自身由新的 `clear_word`、`clear_book` 或 `clear_user` 事件审计。**清除审计事件在任何范围下都不被擦除**（`state` 保持 `active`、`erased_at` 保持 `NULL`），因为它们不是"既有业务事件"；归属去标识与内容擦除是两件事——按用户清除仍会把该用户名下全部审计行的原 `user_id` 物理置 `NULL` 并改写为 `owner_hash`，所以审计行同样不保留明文 owner ID（裁定见 `long_learn_acceptance_report.md` §3 ④）。清除与答题并发时使用用户/卡片版本和事务锁定：要么答题先提交后被清除，要么清除先提交且答题因墓碑或版本冲突失败，不存在清除后重新写回敏感字段的窗口。

### 7.3 敏感字段擦除

必须覆盖：

- card 的规范词形和展示拼写。
- source 的原始拼写、词书/词条可识别信息。
- event 的原始答案、调度快照中可能包含的正文。
- 活动 session_item 通过 card/source 可恢复的显示缓存。
- JSON 导出临时文件和尚未完成的导出缓冲。

日志、指标和错误不得记录原始答案、完整词形、词书名或导出正文。日志可记录 operation ID、哈希前缀、计数、耗时和错误码。备份/系统快照的保留遵循平台数据策略，产品界面必须清楚说明本地清除无法追溯擦除用户自行复制的旧导出文件。

### 7.4 生词表独立

生词表和长期记录仅在普通错误事务中同时写入，生命周期仍然独立：

- 清除长期记录不移除生词表。
- 从生词表删除不清除长期事件或排期。
- 手动加入长期错题不自动加入生词表。
- 产品 UI 在清除确认页明确说明该边界。

## 8. 查询、UI 与统计

### 8.1 首页与今日复习

首页展示：

- 今日已到期数量。
- 当前活动正式会话的进度和“继续复习”。
- 最近 7 日正式复习首次正确率。
- 最近 30 日易错次数。

没有到期卡时显示明确空状态，并提供进入错题本和提前练习的入口。首页计数与创建会话使用同一可见性过滤；计数允许短缓存，但清除、来源状态改变和提交评分后必须失效。

### 8.2 错题本和详情

错题本支持：

- 全部、已到期、已掌握、暂停/无有效来源筛选。
- 最近答错、到期时间、错误次数排序。`错误次数` 是**无窗口**的累计值（该卡名下全部 `ordinary_error` 事件数加 `lapse_count`），因为排序键要进不透明游标，窗口计数会随服务时钟前移而使同一页内的键值前后不一致；需要"最近 30 日易错次数"请看首页指标（§8.3，那是窗口函数）。裁定见 `long_learn_acceptance_report.md` §3 ②。
- 多选 1–100 张进入提前练习。
- 手动加入听音到拼写卡片；与自动记录共用身份和 generation 规则，写 `manual_add` 事件，不伪造一次普通错误。

列表使用不透明游标分页。游标至少编码查询版本、排序字段值、card ID、generation 和筛选摘要，并带完整性校验；默认页大小 50，允许 10–100。排序必须有 `(card_id, generation)` 最终 tie-breaker，翻页不因相同时间值重复或遗漏。筛选/排序改变后旧游标返回 `LONGTERM_CURSOR_INVALID`。

详情展示规范词形、当前展示来源、所有有效来源状态、到期时间、阶梯、是否掌握、lapse、错误/复习时间线和可解释的统计。已擦除字段不显示占位原文，不允许通过搜索建议、错误信息或统计分组恢复。

### 8.3 指标定义

- **7 日正式首次正确率**：过去连续 7×24 小时内，在正式会话中每个 `(session_id, card_id, generation)` 的第一次已提交 `formal_attempt` 里，`attempt_result = good` 的数量除以第一次尝试总数。提前练习和普通背诵不计；分母为 0 时显示 `--`，不显示 0%。
- **30 日易错次数**：过去连续 30×24 小时内的 `ordinary_error`，加正式会话中每卡每会话第一次 `attempt_result = again` 的 `formal_attempt`。同一正式会话后续一分钟重试 Again 不重复计数，提前练习不计。

统计窗口以服务时钟 UTC 毫秒计算，UI 可按本地日期解释范围。清除后统计立即按剩余可见事件重算或使缓存失效。

### 8.4 TTS 与技术失败

听音到拼写优先使用来源已有音频；不可用时使用平台原生 TTS，再按平台能力回退到受支持的 WebView TTS。语音、音频设备、权限或播放失败属于技术失败：

- 不判错、不写 Again、不增加 lapse、不改变排期。
- 保持当前题，允许重试播放或显示可读文本后由用户放弃会话。
- 记录不含词形正文的技术错误码和后端类型。
- 只有音频成功进入可听播放状态后才允许提交拼写评分；无法可靠确认时宁可不计错。

macOS 和 iOS 的 TTS 实现可以不同，但评分与失败语义必须一致。

## 9. 平台中立 API 契约

### 9.1 DTO 原则

IPC/API 使用版本化、平台中立 DTO：

- ID、枚举、整数毫秒、布尔和有界 UTF-8 字符串。
- 不传数据库 rowid、SQL 类型、seekdb 特有对象或 iOS 平台对象。
- 所有列表请求包含用户上下文、limit、cursor、filter、sort。
- 所有命令包含 `operationId`；状态更新包含 `expectedVersion`。
- 响应包含新的 version、事件 ID、会话摘要和可安全重试标志。
- 未知枚举和超出限制的输入在领域边界拒绝，不静默截断原始答案。

平台中立 IPC 命令名称固定如下，macOS 与 iOS 不得使用别名或平台专有名称：

```text
longterm_record_ordinary_error
longterm_get_dashboard
longterm_list_cards
longterm_get_card_detail
longterm_add_card
longterm_create_session
longterm_get_active_sessions
longterm_submit_attempt
longterm_abandon_session
longterm_change_source_state
longterm_clear
longterm_export_json
```

`longterm_record_ordinary_error` 必须调用 5.2 的 native Repository 原子事务，并返回 canonical app-state snapshot。UI 不计算身份、排期、统计或会话完成条件，只渲染 API 结果。

### 9.2 稳定错误码

| 错误码                          | 含义与客户端行为                               |
| ------------------------------- | ---------------------------------------------- |
| `LONGTERM_INVALID_ARGUMENT`     | 输入、范围、枚举或大小非法；修正后重试         |
| `LONGTERM_NOT_FOUND`            | card/source/session 不存在或不可见             |
| `LONGTERM_IDENTITY_COLLISION`   | card ID 与身份字段不一致；停止写入并记录告警   |
| `LONGTERM_IDEMPOTENCY_CONFLICT` | 同 operation ID 参数不同；不得自动重试         |
| `LONGTERM_VERSION_CONFLICT`     | CAS 失败；刷新对象后由用户动作决定             |
| `LONGTERM_SESSION_EXISTS`       | 同类活动会话已存在；打开已有会话               |
| `LONGTERM_SESSION_FINISHED`     | 会话已完成或放弃；刷新导航                     |
| `LONGTERM_ITEM_NOT_READY`       | 一分钟等待未结束；使用返回的 `nextAvailableAt` |
| `LONGTERM_SOURCE_UNAVAILABLE`   | 来源已暂停、删除或清除                         |
| `LONGTERM_CURSOR_INVALID`       | 游标与查询不匹配或已失效；从首页重查           |
| `LONGTERM_CLEARED`              | generation 已被墓碑覆盖；不得重放旧写入        |
| `LONGTERM_STORAGE_BUSY`         | 有界重试后仍忙；保留当前 UI 状态               |
| `LONGTERM_STORAGE_FAILURE`      | 原子事务失败；不前进、不声称已保存             |
| `LONGTERM_TTS_FAILURE`          | 技术播放失败；不计错                           |
| `LONGTERM_EXPORT_FAILURE`       | 导出读取或文件写入失败；清理临时文件           |

底层 seekdb/SQLite 错误映射到这些稳定码，默认不把 SQL 文本或文件路径发给 UI。

## 10. JSON 导出与未来同步边界

### 10.1 导出格式

导出顶层格式固定带版本：

```json
{
  "format": "quicklang-longterm-export",
  "version": 1,
  "exportedAt": 0,
  "identityAlgorithm": "nfkc-lower-v1",
  "options": {
    "includeRawAnswers": true
  },
  "cards": [],
  "sources": [],
  "events": [],
  "sessions": [],
  "sessionItems": [],
  "tombstones": []
}
```

- 默认包含原始答案，导出确认界面明确提示；用户可关闭 `includeRawAnswers`，关闭后字段省略而不是输出可逆替代值。
- 包含活动会话及其 item，使导出忠实反映当前数据库；这不表示首版支持导入或恢复。
- 每个数组按稳定主键顺序输出。时间为 UTC Unix 毫秒，枚举使用公开稳定字符串。
- 导出使用一个一致读快照。无法维持完整快照时返回错误，不拼接不同时间点的数据。
- 以流式编码写入同目录临时文件，成功 flush、同步并原子重命名；取消、失败或清除竞态时删除临时文件。
- 导出不把 100 万事件整体载入内存；事件和会话条目使用固定大小批次读取。
- 已擦除内容不得出现。导出进行中发生清除时，要么导出在清除前获得的一致快照并由 UI 明确其开始时间，要么取消重试；清除提交后新导出不得读取旧内容。

首版不提供 JSON 导入、合并、云上传或分享。导出文件由用户选择位置后脱离应用控制，界面提示其中可能包含敏感原始答案。

### 10.2 未来同步预留

稳定 card ID、generation、event ID、operation ID、CAS version 和 tombstone 可作为未来同步输入，但 0.7.0 不定义远端协议、设备时钟冲突、事件压缩或墓碑保留期。不得为了“预留同步”引入后台网络请求或改变本地优先事务。

## 11. 双后端一致性、容量与性能

### 11.1 一致性要求

- macOS 使用 seekdb，iOS 使用 SQLite。
- 两端从空库直接创建相同六表语义，不执行旧 schema 迁移。
- 字段类型可以按后端映射，但范围、唯一性、外键、排序、时间精度和事务结果一致。
- seekdb 不支持的部分索引或约束由 Repository 事务实现，并由并发契约测试证明等价。
- SQL 查询必须绑定参数；游标、limit 和排序字段来自白名单。
- 所有业务测试使用注入时钟和固定随机输入，不依赖系统当前日期。

### 11.2 数据规模

性能验收固定数据集至少包含：

- 单用户 2 万张当前卡片。
- 多来源共享卡、暂停/删除来源和多 generation 卡片。
- 100 万条事件，其中包含普通错误、正式/提前评分和清除边界。
- 足够的活动/完成会话及 session item，用于恢复和导出。

测试报告记录设备、系统、后端版本、冷/热缓存、数据生成种子、运行次数及 p50/p95，不能只报告最快一次。

### 11.3 指标

在发布支持的代表性 Mac 与最弱目标 iPhone 上：

- 首页指标、到期选卡、错题本首屏/翻页和详情查询 P95 `< 200 ms`。
- 普通错误原子提交、正式/提前评分提交 P95 `< 300 ms`。
- 指标从业务层调用开始，到事务提交并形成响应结束；不含 TTS 播放和 UI 动画。
- 100 万事件 JSON 导出不设交互式 300 ms 限制，但必须流式、可取消、内存有界，并报告吞吐、峰值内存和文件大小。

若目标设备不达标，应先检查索引、查询计划和批量读取；不得通过漏写事件、异步化要求原子的事务或改变统计口径来达标。

## 12. 测试策略

### 12.1 纯领域测试

- `nfkc-lower-v1`：兼容字符、大小写、组合字符、首尾空白、非拉丁文本和算法版本固定样例。
- card ID 固定向量、跨词书共享、跨用户隔离、拼写修改新卡、冲突拒绝。
- Good 阶梯 1/3/7/14/30、后续翻倍、3650 天上限和 30 天掌握。
- Again 24 小时重置、同会话只增一次 lapse、队尾和一分钟等待。
- 逾期层级边界、稳定随机、5/20/100 组大小。
- 正式与提前练习的排期差异、完成条件和放弃状态机。
- 7 日首次正确率和 30 日易错次数固定数据集。

### 12.2 Repository 双后端契约

同一套测试分别运行于 seekdb 和 SQLite：

- 空库建表及重复初始化。
- 六表约束、Repository 逻辑外键、索引查询结果、空值和稳定排序。
- 普通错误在 `ql_app_state` 与六表之间每一步注入失败后的完整回滚，并核对返回的 canonical app-state snapshot。
- `event_id = operationId` 幂等重试、`payload_hash` 内容冲突、CAS 并发、两个客户端同时提交及完整 `event_kind` 枚举拒绝未知值。
- 一个正式加一个提前会话限制及恢复。
- 来源删除/暂停/恢复、拼写变化、跨词书共享。
- 按词/书/用户清除、重复清除、清除与提交竞态、generation 重遇，以及 `erased` 最小骨架、owner hash 和 tombstone 防复活。
- 游标分页在相同排序值和并发更新下不重复；快照边界按 API 约定验证。
- 导出 schema、稳定顺序、Unicode、活动会话、大事件集和 I/O 失败清理。

### 12.3 集成与 UI

- 普通背诵答错后，`ql_app_state` 中的 session/activity/learned/vocabulary 与长期六表在同一 native Repository 事务提交后同时可见；任一存储失败时全部回滚且 UI 不前进。
- 验证前端不再先 `setSaved` 再 `onWrong`，只消费 `longterm_record_ordinary_error` 返回的 canonical app-state snapshot。
- 正确、跳过、提示、揭晓、重复点击、断电式重启和恢复。
- 首页到期数量、继续会话、错题本筛选/详情、手动加入和提前练习完整链路。
- TTS 各级回退、权限拒绝、设备不可用和播放失败均不计错。
- 清除确认文案、生词表独立提示、原始答案导出开关和隐私擦除后的全局搜索。
- macOS 与 iOS 的键盘、触控、前后台切换、可访问性标签和动态字体。

### 12.4 隐私与安全

- 数据库、导出、日志、错误、崩溃信息中搜索已清除词形和原始答案。
- 恶意游标、超长答案、非法 Unicode、路径穿越、符号链接导出目标和取消竞态。
- 用户 A 无法通过 ID、游标、会话或导出读取用户 B 数据。
- 清除后重放旧 operation ID、旧 session item 和旧 generation 均无法复活内容。

## 13. 分阶段发布与观测

发布由本地功能开关控制，默认阶段如下：

1. **内部写入影子阶段**：只对测试账户启用新表和普通错误原子写入；不展示入口。核对回滚、错误率和短期流程延迟。
2. **内部完整闭环**：开放今日复习、错题本、清除和导出，运行双后端固定数据集及真机验收。
3. **小比例启用**：逐步开放给新产生的数据，不回填历史。监控事务失败、版本冲突、TTS 技术失败、查询/提交 P95 和恢复成功率。
4. **0.7.0 全量**：达到验收门槛后默认启用；保留关闭入口的回退开关，不删除已有长期数据。

观测只记录计数、耗时、状态和稳定错误码，不记录词形、原始答案或词书正文。回退时停止新入口和新写入，短期普通背诵保持可用；由于普通错误要求跨短期与长期原子提交，若长期存储不可用且功能仍开启，必须阻止前进而不是静默降级。运营决定关闭功能开关后，普通背诵恢复不写长期表的既有路径，并向用户说明关闭期间不会产生长期记录。

## 14. 验收标准与关键不变量

### 14.1 发布验收

- [ ] 六张新表在 seekdb/SQLite 空库直接建立，未增加旧库迁移和 `ql_review_*` 接入。
- [ ] 普通错误通过固定 IPC 在一个 native Repository 事务中原子更新 `ql_app_state` 的 session/learned/activity/vocabulary 与长期 card/source/event，失败全部回滚且不前进。
- [ ] 六表逻辑外键、`event_id = operationId`、`payload_hash` 冲突检测和完整 `event_kind` 枚举在双后端行为一致。
- [ ] `nfkc-lower-v1`、确定性 SHA-256 ID、跨词书共享和 generation 重遇通过固定向量测试。
- [ ] Again/Good、逾期层级、稳定随机、正式/提前会话、恢复和一分钟重试通过领域与集成测试。
- [ ] 来源删除/暂停/恢复、三种清除、owner hash、`erased` 最小骨架、tombstone 和敏感字段置空通过双后端及竞态测试。
- [ ] 首页、错题本、详情、游标分页、指标和 TTS 技术失败行为在 macOS/iOS 一致。
- [ ] JSON 默认含原始答案且可关闭，包含活动会话，流式导出且不含已擦除内容；没有导入入口。
- [ ] 2 万卡/100 万事件数据集上查询 P95 `< 200 ms`、提交 P95 `< 300 ms`。
- [ ] 隐私、安全、端到端、性能和分阶段发布检查全部完成，无未说明的跳过项。

### 14.2 不变量

1. 同一用户、同一规范词形、同一题型、同一 generation 只有一张逻辑卡；词书不分裂卡片。
2. 清除后的旧 generation 永不复活；重遇只能创建更高 generation。
3. 普通错误对 `ql_app_state` 和长期六表的写入要么全部提交并返回 canonical snapshot，要么全部回滚。
4. 每个 operation ID 就是唯一 event ID；同 ID 同 payload hash 返回原结果，同 ID 不同内容必须冲突。
5. 六表所有非空引用满足 Repository 逻辑外键的同 owner、同 card generation 约束，不依赖物理 cascade。
6. 清除只保留带不可逆 owner hash 的 `erased` 最小骨架和 tombstone，敏感正文及原 owner ID 置 `NULL`，不物理删除整个实体行。
7. 每个正式会话的同一卡片最多增加一次 lapse；提前练习永不改变正式排期、步骤、掌握状态或 lapse。
8. 已清除、无有效来源或暂停的卡片不进入正式选卡。
9. 按书清除不重算仍由其他来源共享的卡片排期。
10. 正式会话只有全部初始卡最终 Good 才能完成；Again 后至少一分钟才可重试。
11. 技术失败不计错、不写事件、不改变排期。
12. UI、JSON 导出、日志和统计不得泄露已擦除敏感字段。
13. macOS seekdb 与 iOS SQLite 对相同命令返回相同领域结果和稳定错误码。
14. 长期记录和生词表生命周期独立，任何一方的清除都不隐式清除另一方。

## 15. 实施拆分

1. [#46 建立长期学习表结构、领域模型与卡片身份](https://github.com/longdafeng/quicklang_my/issues/46)：落地六表、`nfkc-lower-v1`、SHA-256 card ID、generation 和双后端建表。
2. [#47 实现长期学习 Repository 与跨后端原子事务](https://github.com/longdafeng/quicklang_my/issues/47)：统一 Repository、幂等、CAS、错误映射和事务故障注入。
3. [#48 将普通背诵错误接入长期学习记录](https://github.com/longdafeng/quicklang_my/issues/48)：新增 native Repository 事务入口，原子更新 `ql_app_state` 中的 session/activity/learned/vocabulary 与长期 card/source/event，并让前端改为消费 canonical snapshot。
4. [#49 实现长期复习调度算法与到期选卡](https://github.com/longdafeng/quicklang_my/issues/49)：实现 Again/Good、固定阶梯、逾期分层、稳定随机和到期查询。
5. [#50 实现长期复习会话状态机与 IPC API](https://github.com/longdafeng/quicklang_my/issues/50)：正式/提前会话、恢复、倒计时、放弃确认和平台中立 API。
6. [#51 实现来源生命周期、清除与隐私擦除](https://github.com/longdafeng/quicklang_my/issues/51)：来源状态、三种清除、墓碑、generation 和敏感字段擦除。
7. [#52 实现错题本、详情、统计与手动加入](https://github.com/longdafeng/quicklang_my/issues/52)：游标分页、详情、7/30 日指标、展示来源和手动加入。
8. [#53 实现今日复习与提前练习 UI](https://github.com/longdafeng/quicklang_my/issues/53)：首页指标、今日复习、提前选卡、TTS 回退及 macOS/iOS 交互。
9. [#54 实现长期学习记录 JSON 导出](https://github.com/longdafeng/quicklang_my/issues/54)：版本化格式、原始答案开关、活动会话、一致快照和流式原子写入。
10. [#55 完成双后端测试、性能基准与分阶段发布验收](https://github.com/longdafeng/quicklang_my/issues/55)：2 万卡/100 万事件基准、隐私和端到端测试、灰度与发布门槛。

推荐顺序为 #46；随后并行 #47 和 #49；再推进 #48、#50、#51；之后并行 #52 和 #54；完成 #53，最后由 #55 汇总验收。每个任务关闭前必须满足本文件对应契约，不以仅通过编译替代行为、隐私和双后端验证。

### #48 实现与验收记录

**契约测试**：`tests/contract/ordinary_error.rs` 是 `record_ordinary_error` 的平台中立契约，Memory 双实现先行（`LongtermStorage` 六表原语 + `LongtermRepository::record_ordinary_error`），`--features sqlite` 时对齐 `SeekDbEmbeddedAdapter`，seekdb 运行时就绪后按 `tests/contract/longterm.rs` 范式以 `#[ignore]` 激活。

**用例矩阵（Memory，11 个）**

| 用例 | 覆盖验收项 | 关键断言 |
| --- | --- | --- |
| `memory_ordinary_error_records_card_source_event_and_snapshot` | 错误可在历史与卡片中查询 | 事件行 `ordinary_error`/`is_correct=false`/`payload_hash` 逐字节一致；card `step=0,due_at=occurred+24h,last_error_at=occurred,recent_wrong_source_id=source`；version CAS 递增；`app_state` vocabulary/activity 写回 |
| `memory_ordinary_error_retry_returns_already_applied` | 重复 IPC / 失败重试 | 同 operationId 同 payload 返回 `already_applied=true`，事件/卡片 version/`app_state_version` 均不变 |
| `memory_ordinary_error_conflicting_payload_rejected` | 同 ID 不同内容 | `LONGTERM_IDEMPOTENCY_CONFLICT`，事件行与卡片保持首次结果 |
| `memory_ordinary_error_unexpected_app_state_version_rejected` | expectedVersion 不匹配 | `LONGTERM_VERSION_CONFLICT`，六表与 `ql_app_state` 零写入 |
| `memory_ordinary_error_unknown_event_kind_rejected` | 未知 event_kind 拒绝 | 持久化边界解码未知值 → `LONGTERM_INVALID_ARGUMENT` |
| `memory_non_error_outcomes_write_no_event` | 正确/跳过/取消不误记 | 三种 outcome 不进入 record 路径：事件表空、卡片表仅种子行、`app_state_version` 不变；所有落库事件 `is_correct=Some(false)` |
| `memory_ordinary_error_rolls_back_every_injected_step` | 任一步失败完整回滚 | 在 §5.2 第 1/2/4/5/6/7/8 步逐一注入失败：六表 + `ql_app_state` 零部分提交，`operationId` 不被占用，清除注入后同命令成功 |
| `memory_identity_collision_rejected` | card_id 不匹配 | `upsert_card` → `LONGTERM_IDENTITY_COLLISION` |
| `memory_tombstoned_generation_rejected` | generation <= cleared | `upsert_card` 与 record 路径均 `LONGTERM_CLEARED`，无部分写入 |
| `memory_ordinary_error_answer_over_limit_rejected` | 原始答案边界 | >1024 字符 → `LONGTERM_INVALID_ARGUMENT` 且无落库 |
| `memory_ordinary_error_updates_existing_card` | 同卡二次错误 | generation 不变、version +1、`due_at=最新 occurred+24h`、两条事件按 `occurred_at DESC, event_id ASC` 枚举 |

**契约决策**

- `payload_hash` 字节布局沿用 #47 文档固定：`payload_hash(canonical_command_json)`，规范 JSON 取 `serde_json::to_string(&RecordOrdinaryErrorCommand)`（字段声明顺序、无多余空白）。
- 幂等命中只读返回原 `EventReceipt(already_applied=true)` + 当前 card 摘要 + 当前 `app_state_version`，不做任何写入；payload 冲突在任何版本校验之前返回。
- version/snapshot token 不匹配 → `LONGTERM_VERSION_CONFLICT`（可重试）；来源归属他卡 → `LONGTERM_INVALID_ARGUMENT`；来源身份（kind/book/item）变更 → `LONGTERM_IDENTITY_COLLISION`。
- 普通错误排期规则复用 §2.2 的 Again 重置：`schedule_step=0, interval_days=1, due_at=occurred_at+24h, last_error_at=occurred_at`；`lapse_count` 不变（正式会话 Again 的 lapse 记账由 #50 负责）。
- card 先以 `recent_wrong_source_id=None` upsert、再 upsert source、最后 CAS 挂 `recent_wrong_source_id`，满足 §4.7 双向校验顺序。
- 正确/跳过/取消不调用 `record_ordinary_error`：契约层断言 Memory 后端在这些 outcome 下事件表为空、版本不变。

**遗留项**

- `SeekDbEmbeddedAdapter::record_ordinary_error` 由 #48-A 并行落地；在其实现 `LongtermRepository` 之前，`--features sqlite` 构建该测试目标会因缺少 trait 实现而失败，Memory 契约为权威断言。
- seekdb 运行时用例待 #55 机器（`make init` 成功）后按 ignore 范式开启。
- `ql_app_state` 的 canonical snapshot token 的键位/版本语义以 #48-A 最终实现为准，本测试将其抽象为 `app_state_version` 参数断言语义。

### #51 实现与验收记录

本节固定 #51 的清除/来源契约测试矩阵、§7.3 隐私最小保留清单与遗留项。测试文件 `tests/contract/longterm_clear.rs`（注册名 `longterm_clear`，`tests/rust/Cargo.toml`），与 #47 的 `tests/contract/longterm.rs` 同范式：一套契约 × Memory / SQLite / seekdb（`#[ignore]`）三后端。

**契约入口**：`LongtermRepository::clear_longterm_data`（§7.2 三 scope）与 `LongtermRepository::change_source_state`（§7.1 来源生命周期），实现在 `SeekDbEmbeddedAdapter` 上；测试内的 Memory 参照实现是可执行规格，不是桩。断言全部经 `LongtermStorage` 原语（`read_*`、`cas_update_*`、`write_event`、`read_tombstone_generation`、`list_events_for_card`、`transaction`）与 `quicklang-scheduler::longterm::select_due_cards`（#49）完成，不触碰实现内部。

**用例矩阵**（每行在 Memory / SQLite / seekdb 三后端各跑一次，seekdb 按范式 `#[ignore]`）

| # | 用例 | 覆盖的验收项 |
| --- | --- | --- |
| 1 | `clear_word_scope_erases_only_the_target_word` | 按词清除：该 card ID **全部 generation** 的 card/source/event/session_item 标记 `erased` 并置空敏感正文；同用户其他词、另一用户同词形逐字节不变；写 `clear_word` 事件并建词级墓碑 |
| 2 | `clear_word_invalidates_session_items_and_selection` | 活动会话条目 `→ erased`，未受影响条目仍 `ready`；清除后该卡不进入 `select_due_cards`（#49 集成断言），会话行本身保留 |
| 3 | `clear_book_scope_erases_only_that_book_sources` | 按书清除：仅该书 source 与其事件被擦除；他书 source 与历史不变；跨词书共享 card 排期（step/interval/due/lapse）**不重算不擦除**；只剩无有效来源的卡不再选入；书级墓碑不阻断 generation 重遇 |
| 4 | `clear_user_scope_erases_every_row_of_that_user_only` | 按用户清除：六表全部 `erased`，`user_id` 置空、`current_item_id` 置空；他用户 card/source/event 逐字节不变；`clear_user` 事件不带任何实体引用（§4.7） |
| 5 | `erased_skeleton_nulls_every_sensitive_field` | 原始答案与调度快照在 `read_event` 中恒为 `None`；被擦除事件不再出现在 `list_events_for_card` 分页；清除前先断言答案确实落库，避免空断言通过 |
| 6 | `repeated_clear_is_idempotent_and_never_consumes_generation` | 重复清除：同 `operation_id` 返回 `already_applied=true` 且 payload hash 不变；异 `operation_id` 重放要么幂等成功要么返回稳定错误码，**墓碑 `cleared_generation` 恒为 2**，已擦除骨架不被重写 |
| 7 | `clear_failure_leaves_no_partial_state` | 中途失败：参数非法/越权清除不留墓碑与审计事件；清除形态的事务在第二步失败后**整单元回滚**（card 逐字节复原、事件可重新写入、墓碑仍为 `None`） |
| 8 | `clear_and_attempt_race_has_no_partial_state` | 清除与提交竞态两种确定顺序（见下"竞态口径"）；被拒的答题不落地、不改写已擦除骨架；横跨已擦除 card 与存活 source 的"撕裂写"整体被拒 |
| 9 | `generation_reencounter_after_clear_is_cleared_plus_one` | 清除后重遇：`generation ≤ 墓碑` → `LONGTERM_CLEARED`；重遇取 `cleared+1=3` 且恢复 active；跳号仍 `LONGTERM_INVALID_ARGUMENT`；读卡不移动墓碑 |
| 10 | `tombstone_prevents_resurrection_of_old_references` | 旧 `operation_id` 重放幂等且不复活内容；已擦除 session_item/source/card 的 CAS 全部被拒；指向已擦除 card 的新 source 被拒且不落库 |
| 11 | `owner_hash_scope_isolates_clears_between_users` | 墓碑按域分隔 `owner_hash` 隔离：同词形的另一用户查不到墓碑、卡片不被阻断；`owner_hash` 命中 §4.6 固定向量且不等于原 owner ID；书级哈希同样不可逆、互不相同 |
| 12 | `source_lifecycle_transitions_write_matching_audit_events` | `active→paused` 写 `lifecycle_pause`、`paused→active` 写 `lifecycle_resume`、`→deleted` 写 `source_unlink`（写 `deleted_at`）；暂停后该卡退出正式选卡、恢复后回到选卡；解除关联不重算排期、不改写历史事件的来源 |
| 13 | `source_lifecycle_rejects_illegal_transitions` | 陈旧 `expected_version` → `LONGTERM_VERSION_CONFLICT`；越权 → `LONGTERM_NOT_FOUND`；`erased` 不可由生命周期 API 到达；`deleted` 不可回到 active/paused；清除后来源无生命周期；所有拒绝均不写事件、不改状态、不可重试 |
| 14 | `resume_only_restores_the_same_normalized_spelling` | 恢复只恢复仍对应相同 `nfkc-lower-v1` 词形的来源（`"  HELLO  "` 可恢复）；拼写变化（`"Hello!"` vs `hallo`）按新词处理，恢复被拒且保持 `paused` |
| 15 | `recent_wrong_source_falls_back_to_another_valid_source` | 最近答错来源失效后按 `last_wrong_at DESC, event_id DESC` 原子切换到另一有效来源；历史事件不改写来源、不被擦除；候选耗尽后指针为 `None`，不留悬挂引用 |
| 16 | `erased_skeleton_is_persisted`（SQLite/seekdb）/ `..._has_no_persistent_store`（Memory） | 关闭并重开同一数据库后，已擦除行逐字节相同：拼写/词书身份/原 owner ID 仍为空、`answer_raw` 仍为 `None`、墓碑仍在，证明 NULL 落盘而非仅在内存隐藏 |

**竞态口径**（§7.2 "要么答题先提交后被清除，要么清除先提交且答题因墓碑或版本冲突失败"）

- 顺序 A（答题先提交）：`formal_attempt` 已落库后再清除 → 该事件整体被擦除（`state=erased`、`answer_raw=None`、调度快照置空），但 `event_kind`、`attempt_result`、`occurred_at` 保留（§7.2 不改写非敏感事实）。
- 顺序 B（清除先提交）：随后针对旧 generation 的 `formal_attempt` 必须失败且**不落地**；已擦除骨架逐字节不变，不存在"清除后把敏感字段写回"的窗口。
- 错误码容差：存储层可在 `LONGTERM_CLEARED` / `LONGTERM_NOT_FOUND` / `LONGTERM_INVALID_ARGUMENT` 中择一表达"边界拒绝写入"（按 owner 作用域读取已擦除行的实现会先报 `NOT_FOUND`）。测试断言**错误码属于该集合且行未落地**，不锁定单一码值，以免把实现细节固化成契约。

**§7.3 隐私最小保留清单**（`erased` 最小骨架：保留字段在、敏感字段物理 `NULL`，不物理删除整行）

| 表 | 物理置 `NULL`（敏感） | 保留（非敏感最小骨架，供审计与防复活） |
| --- | --- | --- |
| `ql_longterm_card` | `user_id`、`normalized_spelling`、`display_spelling`、`recent_wrong_source_id` | `card_id`、`generation`、`identity_version`、`exercise_kind`、`state=erased`、`schedule_step`、`interval_days`、`due_at`、`last_error_at`、`last_review_at`、`mastered_at`、`lapse_count`、`created_at`、`updated_at`、`erased_at`；`owner_hash` 写不可逆摘要 |
| `ql_longterm_source` | `user_id`、`source_spelling`、`book_id`、`item_id` | `source_id`、`card_id`、`generation`、`source_kind`、`state=erased`、`last_seen_at`、`last_wrong_at`、`deleted_at`、`created_at`、`updated_at`、`erased_at`；`owner_hash` |
| `ql_longterm_event` | `user_id`、`answer_raw`、`schedule_before_json`、`schedule_after_json` | `event_id`、`payload_hash`、`card_id`、`generation`、`source_id`、`session_id`、`session_item_id`、`event_kind`、`attempt_result`、`used_hint`、`revealed`、`skipped`、`is_correct`、`state=erased`、`occurred_at`、`created_at`、`erased_at`；`owner_hash` |
| `ql_longterm_session` | `user_id`、`current_item_id` | `session_id`、`session_kind`、`state=erased`、`requested_size`、`selection_time`、`initial_count`、`completed_count`、`started_at`、`updated_at`、`finished_at`、`erased_at`；`owner_hash` |
| `ql_longterm_session_item` | `user_id` | `session_item_id`、`session_id`、`card_id`、`generation`、`initial_order`、`queue_order`、`state=erased`、`retry_not_before`、`attempt_count`、`first_again_counted`、`first_event_id`、`completed_event_id`、`created_at`、`updated_at`、`erased_at`；`owner_hash` |
| `ql_longterm_tombstone` | 从不保存原 `user_id` | `owner_hash`、`scope`、`card_id`、`cleared_generation`、`book_id_hash`、`cleared_at`、`event_id`、`version` |

- 清除动作自身由新的 `clear_word` / `clear_book` / `clear_user` 事件审计，该事件**不被擦除**（`erased_at=NULL`），其 `tombstone_id` 与 `event_id` 同为调用方 `operationId`。
- 活动 `session_item` 的显示缓存按 §7.3 必须清除：六表 DTO 未落地显示缓存字段，此项由 #50 的会话快照构造负责（`longterm_active_session_snapshot` 不得从已擦除 card/source 回填显示文本），并在用例 2、4 中通过"条目 `erased` + 会话不参与选卡"间接验证。
- 生词表独立（§7.4）不在本文件断言范围：长短期存储分属不同表，#51 的清除事务只触及 `ql_longterm_*` 六表，用例 1/3/4 以"范围外数据逐字节不变"覆盖该边界。

**验证命令与结果**

```text
cargo test --locked --offline -p quicklang-tests --test longterm_clear
cargo test --locked --offline -p quicklang-tests --test longterm_clear --features sqlite
cargo clippy -p quicklang-tests --all-targets --offline -- -D warnings
cargo fmt -p quicklang-tests
```

- 默认后端：**16 passed / 0 failed / 16 ignored**（16 个 seekdb 用例按范式 `#[ignore]`）。
- `--features sqlite`：**32 passed / 0 failed / 0 ignored**（16 Memory + 16 SQLite 全绿）。Memory 参照实现与真实 SQLite 适配器对 §7.1-§7.3 的行为完全一致，满足 §14.2-13。
- `cargo clippy -p quicklang-tests --test longterm_clear --offline -- -D warnings` 与加 `--features sqlite` 的同命令：**通过**，零告警（本文件 3496 行）。
- `cargo fmt -p quicklang-tests`：已应用。
- 注（2026-10-04 波次 2.5 复核）：上文"`--all-targets` 被 `session_state.rs` 的 `dead_code` 阻断"的记录**不成立**。按目标粒度实测 `cargo clippy -p quicklang-tests --test session_state --offline -- -D warnings` 与加 `--features sqlite` 的同命令均**通过、零告警**：`fixture_source`（该文件 1494 行）在同 crate 的 `seed_card_and_source`（1481 行）里被无条件调用，不是死代码。若 `--all-targets` 仍失败，阻断项来自同工作区其它并行任务的新测试文件，与本文件无关。

**本契约测试在并行实现中发现并已修复的缺陷**

- `sqlite_tombstone_prevents_resurrection_of_old_references` 首次运行即失败：清除某词后，仍可把一个**全新** source 以旧 generation（`upsert_source` 指向已擦除的 card 行）写入成功，违反 §4.7「source → card 必须指向同一活动 card」与 §14.2-2「清除后的旧 generation 永不复活」——用户可以借此把旧代次重新挂回来源而绕过 `next_generation`。修复后该用例通过：`upsert_source` 现在对已擦除/被墓碑覆盖的 card generation 返回稳定错误码。
- `sqlite_resume_only_restores_the_same_normalized_spelling` 首次运行发现：拼写变化后的来源恢复被拒，但错误码是 `LONGTERM_IDENTITY_COLLISION` 而非本测试最初假设的 `LONGTERM_INVALID_ARGUMENT`。两者都是 §9.2 的稳定码且语义一致（"来源不再复算出该 card 的词"），契约只要求"被拒且保持 paused、不写事件"，因此测试改为接受该码集合，不把实现细节固化成契约。

**遗留项**

- 已擦除行的**行级** `owner_hash` 目前无读取入口：`LongtermStorage` 只提供 `read_tombstone_generation`（按 owner hash 作用域查询，已由用例 11 断言其隔离性与固定向量），DTO 亦无 `owner_hash` 字段。因此用例只断言"原 `user_id` 物理为空 + 墓碑按 `owner_hash` 命中"。若需在行级直接核对 `owner_hash`，需要 #51-B 增加一个审计读入口或原始 `SELECT` 帮助函数。
- `read_card` 对已擦除行返回 `NOT_FOUND` 还是按 §4.7 的 `owner_hash` 解析出 `erased` 骨架，两种实现都满足隐私要求；`assert_card_erased` 因此同时接受两者，但**任一分支都断言拼写/owner ID 为空**，不得出现活卡。
- §7.1 来源状态机与 §7.2 清除语义的实现入口已确认：`SeekDbEmbeddedAdapter` 实现 `LongtermRepository::change_source_state`（#51-A，`longterm_source.rs`）与 `clear_longterm_data`（#51-B，`longterm_clear.rs`），`quicklang_domain::longterm::book_id_hash`（与 `owner_hash` 同层同风格）由实现侧提供，本测试直接引用同一函数构造 `ClearLongtermDataCommand::book_id_hash`，使书级清除的输入与墓碑写入使用同一域分隔摘要。
- 来源状态转移表以 #51-A 落地的闭机为准：`active → paused` = `lifecycle_pause`、`paused → active` = `lifecycle_resume`、`active|paused → deleted` = `source_unlink`、`deleted → active` = `source_link`（重新关联同一词条行），**no-op 与 `erased` 均为非法**；§7.1 的"只恢复相同规范词形"同时约束 `lifecycle_resume` 与 `source_link`。用例 13 据此断言。
- 展示来源回退的固定规则以 #51-A 落地为准：`last_wrong_at DESC, updated_at DESC, source_id ASC`，候选限于 `state='active' AND erased_at IS NULL`，`NULL` 的 `last_wrong_at` 排在最后（两端 SQL 的 `NULL` 序一致，满足 §11.1）。用例 15 逐步走完 `s-wrong-b → s-wrong-c → s-wrong-d → NULL` 四步，锁定该顺序而非某一列。
- 直接 `SELECT ... IS NULL` 的物理级断言受限于 `LongtermStorage` 未暴露原始 SQL 通道（`lt_execute` 为 `pub(crate)`），当前以"DTO 读 + 关闭重开数据库后逐字节一致"（用例 16）间接证明落盘；若 #55 需要字节级证明，可为测试开放只读 SQL 帮助函数。
- 清除与提交的真并发（两个线程同时 `clear_longterm_data` 与 `submit_longterm_attempt`）未在本文件用线程实现：用例 8 以两种确定提交顺序覆盖"无部分状态"这一不变量，真并发与故障注入钩子留给 #55 的压力/竞态批次。
- seekdb 运行时用例待 `make init` 成功 provisioned macOS ARM64 运行时后按 `#[ignore]` 范式解除。

### #50 实现与验收记录

**契约测试**：`tests/contract/session_state.rs` 是会话状态机的平台中立契约（设计 §6.1–§6.4 与 §2.4），Memory 参照实现（六表 `LongtermStorage` 原语 + `LongtermRepository` 会话五方法）先行；`--features sqlite` 时对齐 `SeekDbEmbeddedAdapter`（#50-B WIP 已落地三方法签名，本测试目前全绿）；seekdb 运行时用例按 `tests/contract/longterm.rs` 范式以 `#[ignore]` 激活。

**状态机转移表（本契约锁定）**

```text
无活动会话 → active → completed
                    ↘ abandoned
```

| 当前状态 | 触发操作 | 结果码 / 新状态 |
| --- | --- | --- |
| `-`（无活动会话） | `create_or_resume_*` | 新建 `active`（同 kind 已有 active → 直接返回既有会话） |
| `active` | `submit_longterm_attempt` | 事件落库 + 条目 good/waiting；全部 good → `completed` |
| `active` | `abandon_session` | `abandoned` + `session_abandon` 事件（同一事务） |
| `completed`/`abandoned`/`erased` | `submit_longterm_attempt` | `LONGTERM_SESSION_FINISHED` |
| `completed`/`abandoned`/`erased` | `abandon_session` | `LONGTERM_SESSION_FINISHED` |
| 任意态条目 | `submit` 非匹配 `session_item_id` | `LONGTERM_NOT_FOUND`（条目不属于该 session/用户） |
| 条目 `good` | `submit` | `LONGTERM_INVALID_ARGUMENT` |
| 条目 `erased`/card 已擦除/来源非 active | `submit` | `LONGTERM_SOURCE_UNAVAILABLE` |
| 条目 `waiting` 且 `retry_not_before > occurred_at` | `submit` | `LONGTERM_ITEM_NOT_READY`（消息携带可再出现时间） |
| 条目与 `card_id`/`generation` 不一致 | `submit` | `LONGTERM_INVALID_ARGUMENT` |
| `expected_version`（submit 为条目 / abandon 为会话）不匹配 | `submit` / `abandon` | `LONGTERM_VERSION_CONFLICT`（`retryable=true`） |
| 同 `operation_id` 同 payload | `create`/`submit`/`abandon` | 原路返回 `already_applied=true` |
| 同 `operation_id` 不同 payload | `create`/`submit`/`abandon` | `LONGTERM_IDEMPOTENCY_CONFLICT` |
| 正式 `card_ids` 为空 | `create_or_resume_formal_session` | 后端按 §6.1 选卡（5..=100 张到期卡）；无到期候选 → `LONGTERM_NOT_FOUND` |

**用例矩阵（Memory，21 个；SQLite 3 个；seekdb 2 个 ignore）**

| 用例 | 覆盖验收项 | 关键断言 |
| --- | --- | --- |
| `memory_create_formal_session_freezes_order_and_items` | created：冻结初始集合与顺序 | 5 张卡一次事务入 session+items+head；`state=active`、`queue_order=0..4`、`current_item_id=最低 queue_order` |
| `memory_create_twice_returns_existing_active_per_kind` | 幂等 create / 正式与提前并存限制 | 同 kind 不开第二会话，直接回既有；formal 与 early 可并存，各至多一个 active |
| `memory_create_replay_returns_stored_session` | 幂等 create / 恢复一致性 | 同 operation_id+同选卡 → 原会话；同 operation_id+异选卡 → `IDEMPOTENCY_CONFLICT` |
| `memory_create_formal_validates_due_and_source` | §6.1 选卡条件 | 未到期卡 → `INVALID_ARGUMENT`；early 不校验到期（§2.4） |
| `memory_create_formal_requires_active_source` | §6.1 选卡条件 | 无 active source → `SOURCE_UNAVAILABLE` |
| `memory_create_size_bounds` | 批次上限 | formal `requested_size` 须 5..=100；early 须 1..=100；重复选卡/空选卡 → `INVALID_ARGUMENT` |
| `memory_formal_good_advances_schedule_and_completes_item` | Good 状态转移（§6.2） | 阶梯 step+1、interval=1 天、`due_at=T0+24h`、事件快照 before/after、`completed_event_id`、session 完成数 +1、head 后移 |
| `memory_formal_again_resets_schedule_waits_and_goes_to_tail` | Again 状态转移（§6.3） | step=0、interval=1 天、`last_error_at=T0`、`lapse=1`、条目 waiting、`retry_not_before=T0+60s`、移到队尾、`first_again_counted=true`、session 不完成 |
| `memory_second_again_does_not_double_count_lapse` | §2.3 同会话 lapse 只记一次 | 第二次 Again 逾期重提交 → lapse 仍 1；1 分钟内重试 → `ITEM_NOT_READY` |
| `memory_early_attempt_preserves_card_and_records_waiting_tail` | 提前会话只写事件 | early again/good 均不改 card 排期/步骤/掌握/lapse/版本；`recent_wrong_source_id` 不动；条目同样 waiting+队尾+1 分钟 |
| `memory_completion_requires_all_good_and_again_blocks_it` | 完成条件 | 任一 again → session 保持 active；全部 good → `completed`、`finished_at`、`completed_count`、`current_item_id=None`、`get_active_session=None` |
| `memory_terminal_session_rejects_submits` | 终态 submit | `abandoned`/`completed` 后 submit → `SESSION_FINISHED` |
| `memory_hint_reveal_skip_collapses_to_again` | §2.3 评分口径 | `attempt_result=good` 但 used_hint → 事件记 `again`、卡片按 Again 重置、`lapse+1` |
| `memory_submit_rejects_wrong_pairing_and_references` | 顺序错位/引用错误码 | 条目不属于该 session → `NOT_FOUND`；`card_id`/`generation` 不一致 → `INVALID_ARGUMENT` |
| `memory_submit_idempotent_replay_and_conflict` | 重复提交幂等 | 同 operation_id 同 payload → `already_applied`、卡片/会话/事件计数不变；异 payload → `IDEMPOTENCY_CONFLICT` |
| `memory_version_conflict_is_retryable_and_only_one_winner` | CAS/并发 | 同卡同 token 两并发：仅一生效（一对卡片版本、一条事件）；另一 `VERSION_CONFLICT` 且 `retryable=true`；用新 token 重试可成功 |
| `memory_abandon_flow` | abandon 事务与幂等 | wrong token → `VERSION_CONFLICT`；正确 token → `abandoned`+`finished_at`+`current_item_id=None`+`session_abandon` 事件（无 card/source/item 引用）；重放 → `already_applied`；异 op 重弃 → `SESSION_FINISHED` |
| `memory_recovery_preserves_queue_order_waits_and_pointers` | 恢复一致性 | 再读/再 resume（新 operation_id）：`queue_order`、`retry_not_before`、`attempt_count`、`first_event_id`、`current_item_id` 均不变，不重选卡、不重随机 |
| `memory_create_injection_rolls_back_every_step` | 事务失败回滚 | §6.1 检查点 1/2/3 逐一注入失败：会话/条目/事件/卡片四表零部分提交，注入清除后同命令成功 |
| `memory_submit_injection_rolls_back_every_step` | 事务失败回滚 | §6.2/§6.3 检查点 1/2/3 注入失败：事件不落库、卡片/条目/会话零部分提交，重试后状态一致 |
| `memory_abandon_injection_rolls_back_every_step` | 事务失败回滚 | §6.4 检查点 1/2 注入失败：会话仍 `active`、无 `session_abandon` 事件，重试后成功 |
| `sqlite_formal_session_happy_path` / `sqlite_submit_again_waits_one_minute` / `sqlite_abandon_marks_session_finished` | 双后端一致性（§6） | Memory 参照实现与真实 SQLite 适配器对 create/get_active/submit Again 等待/abandon 行为一致 |

**契约决策**

- 幂等键统一为 `event_id = operation_id`，`payload_hash = payload_hash(serde_json::to_string(command))`；`create` 的幂等判定键为派生 `session_id`（`mem-session-{operation_id}`），同 operation_id 同选卡 → 原摘要；异 payload → `IDEMPOTENCY_CONFLICT`；不同 operation_id 但同 kind 已有 active → 直接回既有 active（"重复 create 返回既有 active 会话"）。
- **`expected_version` 语义（经波次 2.5 裁决修正，见 §5.6）**：`submit_longterm_attempt` 针对**会话条目**行（§6.2 第 1 步"幂等检查和 session/item CAS"、§4.5"条目 CAS 版本"），early 会话同样校验；会话行与卡片行用事务内读到的版本做 CAS。`VERSION_CONFLICT` 携带 `retryable=true`。
- `retry_not_before` 由 Again 统一写入 `occurred_at + 60_000 ms`；等待期内提交一律 `ITEM_NOT_READY`，由消息携带下一次可再出现时间（§6.4 `nextAvailableAt` 语义）。
- 正式会话的 lapse 记账：`first_again_counted=false` 时 +1 并置标志；提前会话不维护该标志（卡片版本不动）。
- 提前会话不得开启第二 active：同 kind 已存在 active 时 `create_or_resume_early_session` 返回既有；会话条数硬上限 100、空选/重复选拒绝；early 所有条目 `good` 后同样 `completed`（§2.4）。
- 恢复一致性不实现新读路径：`get_active_session` 只读返回存储快照，再以 `create_or_resume_*` 重入即"resume"；条目 `queue_order`/`retry_not_before`/`attempt_count` 均不清零、不重排。
- card 先以 `recent_wrong_source_id=None` upsert、再 upsert source、最后 CAS 挂回（§4.7 双向校验顺序，与 #48 同）。

**验证命令与结果**（2026-10-04 18:47 开始）

```text
cargo test --locked --offline -p quicklang-tests --test session_state
cargo test --locked --offline -p quicklang-tests --features sqlite --test session_state
cargo clippy -p quicklang-tests --all-targets --offline -- -D warnings
cargo clippy -p quicklang-tests --all-targets --offline --features sqlite -- -D warnings
cargo fmt -p quicklang-tests
```

- 默认后端：**21 passed / 0 failed / 2 ignored**（2 个 seekdb 用例按范式 `#[ignore]`）。
- `--features sqlite`：**24 passed / 0 failed / 0 ignored**（21 Memory + 3 SQLite 全绿；seekdb 即 sqlite 适配器)。
- clippy（默认与 `--features sqlite`）与 fmt：**通过**、零告警（本文件 2763 行）。

**波次 2.5 追加用例（§5.6 四项裁决的回归，2026-10-04 20:5x）**

| 用例 | 覆盖裁决 | 关键断言 |
| --- | --- | --- |
| `memory_formal_empty_selection_selects_due_cards_per_section_6_1` | §5.6.3 | 空 `cardIds` formal 创建 → 冻结 `requested_size`（5..=100 区间内）张到期卡；每张都 `due_at <= selection_time` 且有 active 来源；head 为最低 `queue_order`；换一个 operation_id 只会 resume 既有会话 |
| `memory_formal_empty_selection_takes_the_largest_group_that_fits` | §5.6.3 | 7 张到期 / 请求 20 → 只冻结 7 张，不拿未到期卡凑数 |
| `memory_formal_empty_selection_skips_invisible_and_undue_cards` | §5.6.3、§14.2-8 | paused、未到期、无 active 来源三类卡都不进入候选集 |
| `memory_formal_empty_selection_with_nothing_due_is_not_found` | §5.6.3 | 无到期候选 → `LONGTERM_NOT_FOUND`，不留下半建会话 |
| `memory_early_still_requires_an_explicit_selection` | §5.6.3 | early 空选仍是 `INVALID_ARGUMENT`（§2.4 显式选择） |
| `application_formal_empty_selection_freezes_a_due_group` | §5.6.3 + §5.6.4 | 经 application 层的空选创建 → 10 张到期卡的冻结组 |
| `application_submit_replay_after_the_clock_advanced_is_already_applied` | §5.6.2 | 同命令、注入时钟前进 60 s 重放 → `already_applied`、`event_id`/`payload_hash` 不变、卡片版本与 `attempt_count` 不动；换答案仍冲突 |
| `application_create_replay_after_the_clock_advanced_returns_the_stored_session` | §5.6.2 | 时钟前进后重放 create → 返回原会话与原冻结集；会话仍 active 时按 §6.1 resume 优先 |
| `memory_version_conflict_is_retryable_and_only_one_winner` 等既有用例 | §5.6.1 | token 从卡片版本改为条目版本后，CAS 单胜者、`retryable=true` 与"不自动覆盖"语义不变 |

**遗留项**

- seekdb 运行时用例待 `make init` 成功 provisioning 后按 `#[ignore]` 范式解除。
- 真并发（双线程同时 submit）未在本文件用线程实现：以"同 token 两连提交 + CAS 单胜者"覆盖不变量，真并发压测留给 #55。
- 条目 `erased`（来源被 #51 删除/清除后失效）在本文件仅作为稳定码断言入口；与 #51 的联动矩阵由 #55 汇总。
- `current_item_id` 指向"最低 queue_order 的 Ready 条目"；waiting 过期条目需靠 UI 轮询 `nextAvailableAt`，状态机不隐式翻转 waiting→ready（与 #49 `apply_early_attempt` 的队尾/等待辅助量职责一致）。

### #54 实现与验收记录

本节固定 #54 的导出 schema、版本策略、完整格式样例与验收映射。逐字段表与样例文件互为引用：**表**定义"字段名 / JSON 类型 / 可空 / 语义 / §10.1 出处"，**文件** `docs/design/0.7/longterm_export_sample.json` 给出全部记录类型、`erased` 骨架形态、`null` 与键省略的真实取值。

§10.1 的九条散列规则在下文简记为：§10.1-① 默认含原始答案、可关闭且关闭后省略字段；② 含活动会话及其 item；③ 稳定主键顺序 + UTC 毫秒 + 枚举稳定字符串；④ 一个一致读快照；⑤ 流式编码写同目录临时文件、flush/同步/原子重命名；⑥ 不把 100 万事件整体载入内存；⑦ 已擦除内容不得出现、清除竞态要么取清除前快照要么取消；⑧ 首版无导入/合并/上传/分享；⑨ 数组按稳定主键顺序输出。

**样例文件的使用边界**：`longterm_export_sample.json` 是**解析级 golden fixture**——用于 schema 校验、`ExportDoc` 反序列化、枚举/可空/Unicode 往返、排序与内部引用完整性断言，以及 `format`/`version` 头部的字节断言。它**不是**编码器的字节级 golden：实现写出的是紧凑 JSON（无缩进），本文件为便于人工评审采用两空格缩进，两者语义等价、字节不同。

**记录对象的字段顺序**由平台中立 DTO 的声明顺序固定（`src/crates/storage-api/src/longterm.rs` 的 `LongtermCard`/`LongtermSource`/`LongtermEvent`/`LongtermSession`/`LongtermSessionItem`/`LongtermTombstone` 的 `serde` 投影），顶层 11 个键按 §10.1 骨架顺序输出。字段名一律等于列名的 snake_case，不做重命名；枚举用 `snake_case` 稳定字符串；`u64` 以 JSON number 输出且必须 ≤ 2^53-1（`generation`/`version`/`queue_order`/`cleared_generation` 实际远小于该界）。

#### 顶层字段

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `format` | string | 否 | 固定 `quicklang-longterm-export`，格式族标识，不随版本变化 | §10.1 骨架第 1 键 |
| `version` | integer | 否 | 导出格式主版本，当前 `1` | §10.1 骨架第 2 键；本节"版本策略" |
| `exportedAt` | integer | 否 | 快照时刻，UTC Unix 毫秒；等于 `ExportResult.exported_at` | §10.1 骨架第 3 键、§10.1-③ |
| `identityAlgorithm` | string | 否 | 固定 `nfkc-lower-v1`，本次导出使用的卡片身份算法 | §10.1 骨架第 4 键、§3.1 |
| `options` | object | 否 | 仅含 `includeRawAnswers`（boolean，必填）；§10.1 固定只此一个开关 | §10.1 骨架第 5 键、§10.1-① |
| `cards` | array | 否 | 卡片行，含 `erased` 最小骨架；空库为 `[]` | §10.1 骨架第 6 键、§4.1 |
| `sources` | array | 否 | 来源行 | §10.1 骨架第 7 键、§4.2 |
| `events` | array | 否 | 事件行（含 4 条清除审计事件） | §10.1 骨架第 8 键、§4.3 |
| `sessions` | array | 否 | 会话行，含活动会话 | §10.1 骨架第 9 键、§10.1-②、§4.4 |
| `sessionItems` | array | 否 | 会话条目行 | §10.1 骨架第 10 键、§4.5 |
| `tombstones` | array | 否 | 墓碑行 | §10.1 骨架第 11 键、§4.6 |

顶层不出现 `userId`：导出只包含被请求用户的行，归属由每行的 `user_id` 与墓碑的 `owner_hash` 表达（§12.4"用户 A 无法通过导出读取用户 B 数据"）。

#### `cards[]`（18 字段，对应 §4.1 `ql_longterm_card`）

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `user_id` | string | 否（`erased` 骨架为 `""`） | 活动归属；擦除后为空串，绝不保留原 owner ID | §4.1、§7.3、§10.1-⑦ |
| `card_id` | string（64 位小写 hex） | 否 | 确定性 SHA-256 卡片身份 | §3.2、§4.1 |
| `generation` | integer | 否 | 代次，≥1；与 `card_id` 构成排序主键 | §3.3、§4.1、§10.1-③ |
| `normalized_spelling` | string | 否（`erased` 骨架为 `""`） | 敏感；`nfkc-lower-v1` 规范词形 | §4.1、§7.3 |
| `display_spelling` | string | 否（`erased` 骨架为 `""`） | 敏感；最近有效展示拼写 | §4.1、§7.3 |
| `state` | string | 否 | `active` / `paused` / `erased` | §4.1 |
| `schedule_step` | integer | 否 | `0` = 尚未完成第一次 Good，其后为固定阶梯位 | §2.3、§4.1 |
| `interval_days` | integer | 否 | 当前正式排期间隔，0–3650 | §2.3、§4.1 |
| `due_at` | integer | 否 | 下一正式到期时间；活动卡必填；骨架保留原值 | §4.1、§10.1-③ |
| `last_error_at` | integer | 是 | 最近一次会改变排期的错误时间 | §4.1 |
| `last_review_at` | integer | 是 | 最近一次正式评分时间；提前练习不写入 | §4.1、§2.4 |
| `mastered_at` | integer | 是 | 首次达到 30 天间隔的时间 | §4.1 |
| `lapse_count` | integer | 否 | 正式会话首次 Again 的累计次数 | §2.3、§4.1 |
| `recent_wrong_source_id` | string | 是 | 最近答错来源；擦除或来源失效时为 `null` | §4.2、§7.3 |
| `version` | integer | 否 | CAS 版本，从 1 开始 | §4.1、§5.3 |
| `created_at` | integer | 否 | 创建时间 | §4.1 |
| `updated_at` | integer | 否 | 最后更新时间；擦除时写为擦除时刻 | §4.1、§7.3 |
| `erased_at` | integer | 是 | 隐私擦除时间 | §4.1、§7.3 |

不导出的内部列：行级 `owner_hash`、`identity_version`、`exercise_kind`（§4.1 有列但不在导出契约内，身份算法版本只由顶层 `identityAlgorithm` 表达一次）。

#### `sources[]`（16 字段，对应 §4.2 `ql_longterm_source`）

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `source_id` | string | 否 | 来源稳定 ID，数组排序键 | §4.2、§10.1-③ |
| `user_id` | string | 否（`erased` 骨架为 `""`） | 活动归属 | §4.2、§7.3 |
| `card_id` | string | 否 | 关联卡片 | §4.2、§4.7 |
| `generation` | integer | 否 | 关联卡片代次 | §4.2、§4.7 |
| `source_kind` | string | 否 | `book_item` / `manual` | §4.2 |
| `book_id` | string | 是 | 词书来源标识；手动来源与骨架为 `null` | §4.2 |
| `item_id` | string | 是 | 词条标识；手动来源与骨架为 `null` | §4.2 |
| `source_spelling` | string | 否（`erased` 骨架为 `""`） | 敏感；该来源最近观察到的拼写 | §4.2、§7.3 |
| `state` | string | 否 | `active` / `paused` / `deleted` / `erased` | §4.2、§7.1 |
| `last_seen_at` | integer | 否 | 最近遇到时间 | §4.2 |
| `last_wrong_at` | integer | 是 | 最近答错时间 | §4.2 |
| `deleted_at` | integer | 是 | 删除时间；`source_link` 重新关联后置回 `null` | §4.2、§7.1 |
| `erased_at` | integer | 是 | 隐私擦除时间 | §4.2、§7.3 |
| `created_at` | integer | 否 | 生命周期时间 | §4.2 |
| `updated_at` | integer | 否 | 生命周期时间 | §4.2 |
| `version` | integer | 否 | CAS 版本 | §4.2、§5.3 |

数据库用哨兵 `__quicklang_null__` 表示唯一键中的空值（§4.2 末段），**导出必须解码为 JSON `null`**，不得把哨兵字符串写进文件。行级 `owner_hash` 同样不导出。

#### `events[]`（21 字段，对应 §4.3 `ql_longterm_event`）

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `event_id` | string | 否 | 主键，等于调用方 `operationId`，数组排序键 | §4.3、§5.3、§10.1-③ |
| `payload_hash` | string（64 位 hex） | 否 | 域分隔规范命令 SHA-256，用于同 ID 异内容检测 | §4.3、§5.3 |
| `user_id` | string | 否（`erased` 骨架为 `""`） | 活动归属 | §4.3、§7.3 |
| `card_id` | string | 是 | 按事件类型关联卡片 | §4.3、§4.7 |
| `generation` | integer | 是 | 与 `card_id` 同时出现或同时为 `null` | §4.3、§4.7 |
| `source_id` | string | 是 | 按事件类型关联来源 | §4.3、§4.7 |
| `session_id` | string | 是 | 作答事件与放弃事件必填 | §4.3、§4.7 |
| `session_item_id` | string | 是 | 仅作答事件必填 | §4.3、§4.7 |
| `event_kind` | string | 否 | §4.3 的 12 值闭集，不允许后端自行增加 | §4.3 |
| `attempt_result` | string | 是 | `again` / `good`；仅 `formal_attempt`/`early_attempt` 必填 | §2.3、§4.3 |
| `answer_raw` | string | 是 | 敏感；普通错误与作答的原始答案（≤1024 字符）；`includeRawAnswers=false` 时**整个键被省略**，不是 `null` | §4.3、§4.8、§7.3、§10.1-① |
| `used_hint` | boolean | 否 | 评分依据；提示/揭晓/跳过一律折叠为 Again | §2.3、§4.3 |
| `revealed` | boolean | 否 | 同上 | §2.3、§4.3 |
| `skipped` | boolean | 否 | 同上 | §2.3、§4.3 |
| `is_correct` | boolean | 是 | 判题结果；生命周期、清除与放弃事件为 `null` | §4.3 |
| `schedule_before_json` | string | 是 | **内嵌 JSON 文本**（非嵌套对象）；仅作答事件非空 | §4.3、§6.2 |
| `schedule_after_json` | string | 是 | 同上；提前练习与 `before` 逐字节相同 | §2.4、§4.3、§6.2 |
| `state` | string | 否 | `active` / `erased` | §4.3 |
| `occurred_at` | integer | 否 | 事件有效发生时间（注入事件时钟） | §4.3、§5.3 |
| `created_at` | integer | 否 | 入库时间（服务时钟），可能晚于 `occurred_at` | §4.3、§5.3 |
| `erased_at` | integer | 是 | 擦除时间；清除审计事件恒为 `null` | §4.3、§7.3 |

调度快照是**字符串**而不是嵌套对象：它按 §6.2 step 6 的 `serde_json::json!` 键序原样保存，重新编码会引入键序漂移，破坏审计可比性。两种事件的快照键集不同，读取方必须分别处理：

| 事件类型 | `schedule_before_json` / `schedule_after_json` 内嵌键序 |
| --- | --- |
| `ordinary_error` | `due_at`、`schedule_step`、`interval_days`（`after` 恒为 `occurred_at + 24h`、`step=0`、`interval_days=1`） |
| `formal_attempt` | `schedule_step`、`interval_days`、`due_at`、`last_error_at`、`mastered_at`、`version` |
| `early_attempt` | 同 `formal_attempt`，且 `after` 与 `before` 逐字节相同 |
| 其余 9 种 | 恒为 `null` |

快照只含数值与 `null`，不含任何正文，因此 §10.1-① 的"关闭原始答案"只省略 `answer_raw`，快照照常输出。行级 `owner_hash` 不导出。

#### `sessions[]`（14 字段，对应 §4.4 `ql_longterm_session`）

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `session_id` | string（UUID 形状） | 否 | 主键，数组排序键；由 `operationId‖user_id‖kind` 确定性派生 | §4.4、§5.3、§10.1-③ |
| `user_id` | string | 否（`erased` 骨架为 `""`） | 活动归属 | §4.4、§7.3 |
| `session_kind` | string | 否 | `formal` / `early` | §2.4、§4.4 |
| `state` | string | 否 | `active` / `completed` / `abandoned` / `erased` | §4.4、§6.4 |
| `requested_size` | integer | 否 | 正式 5–100；提前 1–100 | §2.4、§4.4 |
| `selection_time` | integer | 否 | 到期判断与初始选卡的固定时间 | §6.1、§4.4 |
| `initial_count` | integer | 否 | 初始卡片数（可小于 `requested_size`） | §4.4 |
| `completed_count` | integer | 否 | 已最终 Good 的初始卡片数 | §4.4、§6.2 |
| `current_item_id` | string | 是 | 当前可展示条目；终态与骨架为 `null`；无 `ready` 条目时亦为 `null` | §4.4、§4.7、§6.2 |
| `started_at` | integer | 否 | 生命周期时间 | §4.4 |
| `updated_at` | integer | 否 | 生命周期时间 | §4.4 |
| `finished_at` | integer | 是 | 完成/放弃时间；**擦除时置 `null`** | §4.4、§6.4、§7.3 |
| `erased_at` | integer | 是 | 隐私擦除时间 | §4.4、§7.3 |
| `version` | integer | 否 | 会话 CAS 版本 | §4.4、§5.3 |

不导出的内部列：行级 `owner_hash` 与 `random_version`（§4.4 有列；`sha256-session-card-v1` 的随机版本不进入导出契约）。

#### `sessionItems[]`（17 字段，对应 §4.5 `ql_longterm_session_item`）

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `session_item_id` | string（UUID 形状） | 否 | 主键，数组排序键 | §4.5、§10.1-③ |
| `session_id` | string | 否 | 关联会话 | §4.5、§4.7 |
| `user_id` | string | 否（`erased` 骨架为 `""`） | 活动归属 | §4.5、§7.3 |
| `card_id` | string | 否 | 冻结卡片身份 | §4.5 |
| `generation` | integer | 否 | 冻结卡片代次 | §4.5 |
| `initial_order` | integer | 否 | 初始稳定随机顺序（`sha256(session‖card‖generation)` 升序） | §2.4、§4.5 |
| `queue_order` | integer | 否 | 当前队列顺序；Again 移队尾时取会话内 `max + 1` | §4.5、§6.3 |
| `state` | string | 否 | `ready` / `waiting` / `good` / `erased` | §4.5、§6.3 |
| `retry_not_before` | integer | 否 | Again 后至少一分钟才可重试；从未 Again 时为 `0` | §6.3、§6.4 |
| `attempt_count` | integer | 否 | 本会话已提交次数 | §4.5 |
| `first_again_counted` | boolean | 否 | 正式会话是否已为该卡增加 lapse；提前练习恒 `false` | §2.3、§4.5 |
| `first_event_id` | string | 是 | 本条目第一次成功作答事件 | §4.5 |
| `completed_event_id` | string | 是 | 使本条目最终 Good 的作答事件 | §4.5、§6.2 |
| `version` | integer | 否 | 条目 CAS 版本 | §4.5、§5.3 |
| `created_at` | integer | 否 | 时间 | §4.5 |
| `updated_at` | integer | 否 | 时间 | §4.5 |
| `erased_at` | integer | 是 | 隐私擦除时间 | §4.5、§7.3 |

行级 `owner_hash` 不导出。`sessionItems` 的数组排序键是 `session_item_id`（与 §4.5 主键一致，满足 §10.1-⑨），不是 `(session_id, initial_order)`；后者更贴合人读顺序，若要改为人读顺序必须同时改 `version` 并在 §10.1 登记。

#### `tombstones[]`（9 字段，对应 §4.6 `ql_longterm_tombstone`）

| 字段 | JSON 类型 | 可空 | 语义 | 出处 |
| --- | --- | --- | --- | --- |
| `tombstone_id` | string | 否 | 主键，数组排序键；实现派生为 `tomb-{event_id}` | §4.6 |
| `owner_hash` | string（64 位 hex） | 否 | 带 `quicklang-longterm-owner-v1` 域分隔的不可逆归属摘要 | §4.6、§10.2 |
| `scope` | string | 否 | `word` / `book` / `user` | §4.6、§7.2 |
| `card_id` | string | 是 | 词级清除必填；书级与用户级为 `null` | §4.6、§7.2 |
| `cleared_generation` | integer | 是 | 词级清除的最高代次；书级与用户级为 `null` | §3.3、§4.6 |
| `book_id_hash` | string | 是 | 书级清除的不可逆摘要；其余 scope 为 `null` | §4.6 |
| `cleared_at` | integer | 否 | 服务端清除时间 | §4.6 |
| `event_id` | string | 否 | 对应清除事件 ID，同时是调用方 `operationId` | §4.3、§4.6 |
| `version` | integer | 否 | 墓碑版本，供未来同步冲突比较 | §4.6、§10.2 |

墓碑是导出中**唯一携带 `owner_hash`** 的记录类型：它不含词形、拼写、原始答案、书名或可逆来源标识，因此可以安全落盘并作为擦除骨架归属的证明。同一 `card_id` 可有多条墓碑（每次词级清除一条，`cleared_generation` 单调不减），样例中 `archive` 的两条词级墓碑即为该形态。

#### 排序、可见性与一致快照

- 排序键（§10.1-③/⑨）：`cards` 按 `(card_id, generation)`；`sources`、`events`、`sessions`、`sessionItems`、`tombstones` 各按自身主键升序。样例中 `events` 数组**不是**按时间排序：`e7e00041…`（`occurred_at=1761717555000`）排在 `e7e00043…`（`occurred_at=1761717550000`）之前，`e7e00044…`（`1761717560000`）排在 `e7e00045…`（`1761703200000`）之前——排序键是 `event_id`，任何读取方都不得依赖数组顺序推断时间。
- 可见性：只输出被请求用户的行，即 `user_id` 等于该用户的活动行，加上 `user_id` 为空串且行级 `owner_hash` 与该用户摘要一致的 `erased` 最小骨架；墓碑按 `owner_hash` 命中。他用户的行绝不出现（§12.4）。
- 快照（§10.1-④）：`exportedAt` 是快照时刻，六个数组必须来自同一读快照，无法维持完整快照时返回 `LONGTERM_EXPORT_FAILURE`，不拼接不同时点的数据。`ExportResult` 的六个计数与数组长度逐一相等。
- 活动会话（§10.1-②）：活动 `formal`/`early` 会话及其条目照常输出，`current_item_id` 指向 `ready` 条目中 `(queue_order, session_item_id)` 最小者；全部条目 `waiting` 时为 `null`。这不表示首版支持导入或恢复（§10.1-⑧）。

#### `erased` 最小骨架与 `includeRawAnswers=false`

擦除在导出中的三条硬规则（§7.3、§10.1-⑦、§14.2-6/12）：

1. **可空引用用 `null`，非可空字符串用空串**。擦除后 `user_id`、`normalized_spelling`、`display_spelling`、`source_spelling` 是非可空字符串字段，一律输出 `""`；`recent_wrong_source_id`、`book_id`、`item_id`、`answer_raw`、`current_item_id`、`schedule_*_json` 是可空字段，一律输出 `null`。
2. **不物理删除整行、不改写非敏感事实**。骨架保留 `card_id`/`generation`、调度事实（`schedule_step`、`interval_days`、`due_at`、`last_error_at`、`mastered_at`、`lapse_count`）、状态、版本与时间；事件的 `event_kind`、`attempt_result`、`used_hint`/`revealed`/`skipped`、`is_correct`、`occurred_at` 全部保留，只把 `answer_raw` 与两个调度快照置 `null`。
3. **清除审计事件本身不被擦除**：`clear_word`/`clear_book`/`clear_user` 事件的 `state` 恒为 `active`、`erased_at` 恒为 `null`、`user_id` 保留，清除 Word/Book scope 时按 §4.7 携带 `card_id`(+`generation`) 或 `book_id_hash`，用户级清除不携带任何实体引用。

`includeRawAnswers=false` 时**只省略 `events[].answer_raw` 键**，其余键序与取值不变，且不为答案输出任何可逆替代值（长度、掩码、散列都不输出）：

```json
{
  "event_id": "e7e00043-0000-4000-8000-a00000000043",
  "payload_hash": "17b4bddff4d0aa5f1a9400a77dc1ef2abb885174fce73fab94da30088149cad8",
  "user_id": "user-1",
  "card_id": "60bb2b4b7f681ffc5d6e739bf9bf95e666ebe305d255122ae917b26b798fb3bc",
  "generation": 1,
  "source_id": "src-08",
  "session_id": "73a58709-6490-c7cf-76c7-7df6eded3a92",
  "session_item_id": "93ee9e68-cf92-e5bf-ac63-e968b167260e",
  "event_kind": "early_attempt",
  "attempt_result": "again",
  "used_hint": false,
  "revealed": true,
  "skipped": false,
  "is_correct": false,
  "schedule_before_json": "{\"schedule_step\":1,\"interval_days\":1,\"due_at\":1761642180000,\"last_error_at\":1761469380000,\"mastered_at\":null,\"version\":4}",
  "schedule_after_json": "{\"schedule_step\":1,\"interval_days\":1,\"due_at\":1761642180000,\"last_error_at\":1761469380000,\"mastered_at\":null,\"version\":4}",
  "state": "active",
  "occurred_at": 1761717550000,
  "created_at": 1761717550000,
  "erased_at": null
}
```

#### 版本策略

- `version` 是**只增不改**的主版本号，当前 `1`；`format` 是格式族标识，不随 `version` 变化。
- **不升版本**：新增可选键、补充枚举说明、修正文档。新增键一律放在记录对象的**末尾**，读取方必须忽略未知键，这样旧读取方可以安全解析新文件。
- **升 `version`**：删除或重命名键、改变既有键语义或类型、收紧/放宽可空性、新增 `event_kind` 等枚举值。新增枚举值按破坏性变更处理——§4.3 规定后端与读取方都不得自行增加值，旧读取方遇到未知枚举必须整体拒绝而不是忽略。
- 读取规则：`format` 不匹配直接拒绝；`version` 高于读取方支持上限时**整体拒绝**并提示升级，不做部分解析；`version` 低于上限时按已知键解析并忽略未知键。
- 导出文件脱离应用控制（§10.1-⑧），因此版本号是唯一的兼容判据，`ExportResult` 不携带额外的能力协商字段。

#### 变体样例（不在样例文件内）

空库导出（六个数组均为 `[]`，`exportedAt` 仍为快照时刻）：

```json
{
  "format": "quicklang-longterm-export",
  "version": 1,
  "exportedAt": 1761717600000,
  "identityAlgorithm": "nfkc-lower-v1",
  "options": { "includeRawAnswers": true },
  "cards": [],
  "sources": [],
  "events": [],
  "sessions": [],
  "sessionItems": [],
  "tombstones": []
}
```

已掌握卡片（`interval_days=30` 且 `mastered_at` 非空；样例文件中的卡片尚未走到第 5 阶，故此形态以变体给出）：

```json
{
  "user_id": "user-1",
  "card_id": "277fff224986a76800a0ad4f8281497e75e644e2a43d2c3c9624b3920f75ea30",
  "generation": 1,
  "normalized_spelling": "hello",
  "display_spelling": "Hello",
  "state": "active",
  "schedule_step": 5,
  "interval_days": 30,
  "due_at": 1762125600000,
  "last_error_at": 1759908000000,
  "last_review_at": 1761717600000,
  "mastered_at": 1761717600000,
  "lapse_count": 2,
  "recent_wrong_source_id": "src-07",
  "version": 12,
  "created_at": 1761098400000,
  "updated_at": 1761717600000,
  "erased_at": null
}
```

`state: "paused"` 的卡片（仅有 `paused` 来源时进入该状态，§4.1/§4.2）同样按上表取值；当前实现没有把卡片写成 `paused` 的路径，故样例文件未覆盖该枚举值，登记在遗留项中。

#### 样例数据集说明

样例文件是 `user-1` 的一份完整快照：`exportedAt = 1761717600000`（2025-10-29T06:00:00Z），基准时刻 `2025-10-01T00:00:00Z`，11 张卡 / 15 个来源 / 38 条事件 / 7 个会话 / 13 个会话条目 / 4 条墓碑。所有 `card_id`、`owner_hash`、`book_id_hash`、`payload_hash`、`session_id`、`session_item_id`、`initial_order` 都按实现域分隔布局真实计算，可用 `quicklang_domain::longterm` 的同名函数逐个复算。

| 维度 | 覆盖内容 |
| --- | --- |
| 记录类型 | 六张表全部出现，活动行与 `erased` 骨架行并存 |
| `event_kind` | §4.3 的 12 个值全部出现（`clear_word`×2、`clear_book`、`clear_user`、`session_abandon`×2 等） |
| 枚举 | `cards.state`（active/erased）、`sources.source_kind`（book_item/manual）、`sources.state`（active/paused/deleted/erased）、`events.attempt_result`（again/good）、`sessions.session_kind`（formal/early）、`sessions.state`（active/completed/abandoned/erased）、`sessionItems.state`（ready/waiting/good/erased）、`tombstones.scope`（word/book/user） |
| 擦除形态 | 词级清除（`archive` g1、g2）、书级清除（`book-2` 的 `src-06`）、用户级清除（其余全部活动行）；三种 scope 的 `erased_at` 各不相同，骨架保留的调度事实可核对 |
| 防复活 | `archive` 走完 g1→清除→g2→清除→g3→用户清除→g4，两条词级墓碑 `cleared_generation` 为 1 与 2，重遇代次只增不减（§3.3、§14.2-2） |
| 会话 | 活动正式会话（`café` waiting + `毎日` ready）、活动提前会话（两条 waiting）、已完成正式会话、已放弃正式会话、两条被用户清除的会话骨架 |
| 倒计时 | 活动条目的 `retry_not_before` 晚于 `exportedAt`（Again 后 60 秒），可直接验证 §6.3 的等待窗口 |
| Unicode | `café`/`Café`（Latin 附加音与大小写）、`ｗｏｒｌｄ`（全角，`nfkc-lower-v1` 归一为 `world`）、`毎日`/`まいにち`（非拉丁文本）；文件为 UTF-8、非 ASCII 不转义 |
| 空值 | 可空字段的 `null` 与擦除后的 `""`/`null` 两种形态同时出现 |
| 时间 | 全部为 UTC Unix 毫秒整数；`created_at` 令等于 `occurred_at` 以便做确定性断言，生产实现中前者是服务时钟、可能更晚 |

#### 实现状态

| 部分 | 状态 | 出处 |
| --- | --- | --- |
| 顶层结构与 `options.includeRawAnswers` | 已固定 | §10.1 骨架；本节"顶层字段" |
| 记录字段与顺序 | 已固定为平台中立 DTO 的 `serde` 投影 | `src/crates/storage-api/src/longterm.rs` |
| 命令与结果类型 | 已在 #48 波次落地、#54-A 补齐第三字段：`ExportLongtermDataCommand{user_id, include_raw_answers, output_path}`（目的地由命令承载，Repository 不替用户选位置）、`ExportResult{exported_at, card_count, source_count, event_count, session_count, session_item_count, tombstone_count}`、`LONGTERM_EXPORT_FAILURE` | `storage-api/src/longterm.rs`、`domain::longterm::error_code::EXPORT_FAILURE` |
| 导出实现（读快照、批次读取、流式写临时文件、fsync、原子重命名、取消与失败清理） | #54-A 落地中，提交号待回填 | `src/crates/storage-seekdb/src/longterm_export.rs`（#54-A 新增） |
| 契约测试 | #54-B 落地中：`tests/contract/longterm_export.rs` | Memory 参照实现 + `--features sqlite` + seekdb `#[ignore]` 三后端 |

#### 验收映射表

| issue #54 验收项 | 本文件出处 | 测试出处（`tests/contract/longterm_export.rs`） |
| --- | --- | --- |
| 设计文档记录导出 schema、版本策略与示例 | 本节"顶层字段"与六张逐字段表、"版本策略"、`docs/design/0.7/longterm_export_sample.json`（1788 行、60 759 字节） | `export_matches_schema_layout`（头部字节 + 顶层键序 + 卡片字段序 + 计数与 `ExportResult` 相等）/ `memory_export_matches_schema_layout` / `sqlite_export_matches_schema_layout` / `seekdb_export_matches_schema_layout` |
| JSON 通过 schema/快照测试，时间、枚举、空值和 Unicode 可往返 | 本节"排序、可见性与一致快照"、"`erased` 最小骨架"两小节与样例文件的枚举/空值矩阵 | `export_unicode_and_enums_roundtrip`、`export_is_stable_and_read_only`、`export_snapshot_two_orderings`、`export_after_clear_is_privacy_minimal`、`memory_export_failure_cleans_up_every_stage_and_retry_succeeds`、`sqlite_export_failure_cleans_up_and_retry_succeeds`、`sqlite_and_memory_export_byte_equal_for_same_dataset` |
| 双后端固定数据集导出语义一致 | 本节"记录对象的字段顺序"与逐字段表（同一份字段集合对两端生效） | `sqlite_and_memory_export_byte_equal_for_same_dataset`（同数据集逐字节相等）+ 上述 Memory/SQLite 成对用例；seekdb 两例按范式 `#[ignore]` |
| 清除/擦除、空库、大数据量和 I/O 失败均有测试 | "§10.1-⑦" 擦除规则三条、"变体样例"空库形态、§11.2 容量说明 | 擦除：`export_after_clear_is_privacy_minimal`、`export_is_idempotent_after_clear`、`export_does_not_leak_across_users`；空库：`export_empty_database`；I/O 失败：两后端 `*_failure_cleans_up_*`；竞态：`export_concurrent_write_does_not_tear_snapshot`；**大数据量（100 万事件）本波次未覆盖，留给 #55** |

#### 容量与流式（§11.2 / §11.3）

- 固定数据集规模（§11.2）：2 万张当前卡片、100 万条事件（含普通错误、正式/提前评分与清除边界）、多来源共享卡、暂停/删除来源、多 generation 卡，以及足够的活动/完成会话与条目。
- 流式要求（§10.1-⑤/⑥、§11.3）：事件与会话条目按**固定大小批次**读取并增量编码，不得整体载入；小数组（卡片、来源、会话、墓碑）可整批读取。峰值内存上界约为 `批大小 × 单行最大字节`，其中单行有界（`answer_raw` ≤ 1024 字符，§4.8；调度快照为固定 6 键数值对象）。
- 报告口径（§11.2 末段、§11.3 第 3 条）：100 万事件导出不设交互式 300 ms 限制，但必须流式、可取消、内存有界，并报告吞吐、峰值内存和文件大小；报告须含设备、系统、后端版本、冷/热缓存、数据生成种子、运行次数与 p50/p95，不得只报最快一次。
- 达标口径不得退化：不得通过漏写事件、跳过 `erased` 骨架或改变排序键来降低体积（§14.2-12、§11.3 末段）。

#### 与 #54-B 测试的对齐

- 样例文件路径：`docs/design/0.7/longterm_export_sample.json`（仓库相对路径）。建议 #54-B 在下一轮采纳为 `include_str!` 解析级 golden：用 `ExportDoc` 反序列化后断言——顶层 11 键顺序、六个数组的排序键、`ExportResult` 计数与数组长度相等、每行键序等于 DTO 声明序、擦除行的 `user_id == ""` 与敏感字段为空/`null`、清除审计事件按裁定 ④ 永不被擦除（`state` 保持 `active`、`erased_at` 为 `null`，且三种范围一视同仁；**注意：已发布的样例文件仍是裁定前的产物，它的两条词级 `clear_word` 审计行写着 `state: "erased"`，待 #54 重生成，见 `long_learn_acceptance_report.md` §9 遗留项 L1**）、`events[].answer_raw` 只在 `includeRawAnswers=true` 时出现。若测试需要**字节级**期望值，应从实现导出同一数据集另存紧凑 golden，不要复用本文件。
- 本波次由文档代理产出该文件，未修改 #54-B 的测试文件；上表引用的用例名取自其当前版本，后续改名时请同步本表。
- 契约级差异已在"实现状态"与遗留项中登记，#54-A 若改变字段集合或顺序，须同步本节六张表与样例文件并升 `version`。

#### 遗留项

- **`erased` 会话的 `finished_at`**：#54-B 契约在擦除时把它置 `null`，而 §4.6 与本文件 #51 的"§7.3 隐私最小保留清单"把 `finished_at` 列为**保留**字段。需要 #51-B 或 #55 判定统一；本节按实现契约记录为 `null`。
- **`sessionItems` 排序键**：现为 `session_item_id`。若改为人读顺序 `(session_id, initial_order)`，须升 `version` 并回填 §10.1。
- **`CardState::Paused`**：§4.1 允许该值，但当前没有任何写入路径把卡片写成 `paused`（只有读取侧解析与 #52 的派生投影），样例文件因此未覆盖；`#52-D`/`#55` 决定是否补写路径。
- **`manual_add` 事件形状**：`answer_raw`、`schedule_*_json`、`is_correct` 均为 `null`（§8.2"不伪造一次普通错误"），该形状在 #52 实现前是文档假设，需 #52-A 落地后回填核对。
- **顶层缺少 `exerciseKind`**：§10.1 骨架没有该键，每行也不导出 `exercise_kind`，因此题型只能从 `identityAlgorithm` 之外的约定得知。若产品需要，建议在 `version=2` 时新增顶层 `exerciseKind`，不要在 `version=1` 上加键。
- **行级 `owner_hash` 不导出**：符合"不可导出的内部字段绝不出现"，但代价是擦除骨架在文件里只有 `user_id == ""`，归属需借墓碑的 `owner_hash` 间接证明。若审计需要直接证据，应在 `version=2` 增补行级 `ownerHash`。
- **`created_at` 与 `occurred_at` 的偏移**：样例令二者相等以便做确定性 golden；生产实现中 `created_at` 取服务时钟，可能晚于注入事件时钟，`#54-B` 的字节级 golden 需自行处理该偏移。
- **seekdb 运行时用例**：`seekdb_export_matches_schema_layout` 与 `seekdb_export_after_clear_is_privacy_minimal` 按范式 `#[ignore]`，待 `make init` 成功 provisioning 后解除。
- **§10.1 回填建议**：本节确定的"擦除后非可空字符串用 `""`、可空引用用 `null`""调度快照是内嵌 JSON 字符串""记录字段序等于 DTO 声明序"三条规则目前只存在于本节，建议在 #55 汇总时回填 §10.1 本身。

### #52 实现与验收记录

本节固定 #52 的错题本/详情/统计/手动加入口径、用例矩阵与遗留项。契约测试文件 `tests/contract/longterm_list.rs`（`tests/rust/Cargo.toml` 注册名 `longterm_list`），与 #47/#48/#50/#51 同范式：一套契约 × Memory 参照实现 / SQLite（`--features sqlite`）/ seekdb（`#[ignore]`）。本波次由测试代理产出该文件与本节，未修改 `src/crates/**`、`src/app/**` 与 `src/ui/**`。

**契约入口**：`LongtermRepository::list_cards`、`get_card_detail`、`get_metrics`、`add_card_manually`（签名见 `src/crates/storage-api/src/longterm.rs`）。测试内的 Memory 参照实现覆盖 #47 的 `LongtermStorage` 原语 + 上述四个方法 + §7.2 三种 scope 的清除，是本节口径的**可执行规格**；断言只经公开原语与 DTO 完成，不触碰实现内部。#53 的错题本 UI 不在本 issue 范围（见 issue #52/#53 边界），本波次无 `src/ui/**` 改动。

#### 指标口径表（§8.3，固定数据集 `seed_metrics_world`）

`GetMetricsQuery::now_ms` 是服务端时钟；两个窗口都是紧邻它的连续闭区间 `[now - N×24h, now]`，晚于 `now` 的行（客户端时钟超前）一律不计。

| 字段 | 口径 | 排除项 | 固定数据集的期望值 |
| --- | --- | --- | --- |
| `due_today` | §6.1 可见性（`active` 卡片 + 至少一个 `active` 未擦除来源 + 无覆盖该 generation 的墓碑 + 不在另一个 `active` 正式会话中）且 `due_at <= now_ms` | 擦除行、墓碑覆盖行、`paused` 卡、无有效来源卡、已在活动正式会话中的卡 | `2`（`alpha`、`beta`） |
| `mastered_count` | 本 owner `erased_at IS NULL`、`state != erased`、未被墓碑覆盖且 `mastered_at IS NOT NULL` 的卡数 | 同上；`paused` 卡仍计入 | `4`（`beta`、`delta`、`epsilon`、`zeta`） |
| `seven_day_first_attempt_good_rate` | 7 天窗口内按 `(session_id, card_id, generation)` 分组的**第一次** `formal_attempt`（`occurred_at ASC, event_id ASC`）中 `good` 的比例；分母 0 → `None`（UI 显示 `--`，不显示 0%） | `ordinary_error`、`early_attempt`、`manual_add`、生命周期与清除事件、窗口外行 | `4/7` |
| `thirty_day_error_count` | 30 天窗口内的 `ordinary_error` 行数 + 出现过 `again` 的 `(session_id, card_id, generation)` 组数（同一正式会话的一分钟重试只计一次） | `early_attempt`、`manual_add`、清除事件、窗口外行 | `6`（2 条 `ordinary_error` + 4 个 `again` 组） |

窗口边界用例 `metric_window_bounds_are_closed_at_the_lower_edge` 另行锁定：落在 `7d_start` / `30d_start` 的行**计入**，早 1 ms 的行不计入，`now + 1` 的行在任何 `now` 下都不计入，`now` 前进一天后窗口随之移动（7 日正确率从 `2/2` 变为 `1/2`，30 日易错次数从 2 变为 2）。

#### 列表口径（§8.2）

| 维度 | 口径 |
| --- | --- |
| 可见性 | 本 owner、`erased_at IS NULL`、`state != erased`、无覆盖该 generation 的墓碑。被暂停的卡与"无有效来源"的卡**仍然可见**（用户要能看到并恢复）；被擦除的行在列表/详情/统计中一律不可见 |
| `All` | 全部可见行 |
| `Due` | 可见 ∧ `active` ∧ ≥1 个 `active` 未擦除来源 ∧ `due_at <= now` ∧ 不在另一个 `active` 正式会话中。与 `due_today` 同一可见性函数（§8.1） |
| `Mastered` | 可见 ∧ `mastered_at IS NOT NULL`（`paused` 卡仍计入） |
| `Paused` | 可见 ∧ (`state == paused` ∨ 没有 `active` 未擦除来源) |
| 空状态 | 命中为空时返回空页且 `next_cursor = None`，不返回悬空游标 |
| 排序 | `LastErrorAt` = `last_error_at DESC`（`NULL` 排最后）；`DueAt` = `due_at ASC`；`ErrorCount` = §8.3 的 30 日易错次数 `DESC`（0 排最后）。三者都以 `(card_id ASC, generation ASC)` 为最终 tie-breaker |
| 分页 | 不透明游标，默认页大小 50、允许 10–100（越界 `LONGTERM_INVALID_ARGUMENT`，不静默截断）。游标编码查询版本、owner 哈希、筛选、排序、排序键值、card ID 与 generation 并带完整性校验；筛选/排序/owner 不一致或校验失败 → `LONGTERM_CURSOR_INVALID`。游标是 keyset 游标：游标之前插入的新卡不影响后续页，游标之后插入的新卡恰好出现一次 |

#### 详情与手动加入口径（§8.2、§3、§4.2）

- `CardDetail` 组装卡片本体、本卡全部未擦除来源（`source_id ASC`）和最近 50 条事件（`occurred_at DESC, event_id ASC`，§4.3 索引顺序）。事件上的 `session_id` / `session_item_id` 必须解析到真实会话与条目，且条目指向同一 `(card_id, generation)`；详情**不受指标窗口限制**。
- 已擦除或被墓碑覆盖的 generation 统一按 `LONGTERM_NOT_FOUND` 隐藏，不返回占位原文（§7.3），错误文本不得包含词形、书名或原始答案。
- 手动加入复用 §3.2 卡片身份与 §3.3 generation 规则，写 `manual_add` 事件（`attempt_result`/`answer_raw`/`is_correct`/调度快照全为 `NULL`），**不伪造普通背诵错误**：既有卡片行完全不写（`version`、`last_error_at`、`lapse_count`、`mastered_at`、`recent_wrong_source_id`、排期全部不变），指标不因手动加入而移动。
- 新建卡片的形状：`schedule_step = 0`、`interval_days = 1`、`due_at = occurred_at`，即手动加入的听音卡**立即可复习**，加入后即进入今日到期。
- §4.2 唯一键 `(user_id, card_id, generation, source_kind, book_id, item_id)` 对 `book_id`/`item_id` 为 `NULL` 的手动来源意味着**每卡片每 generation 只允许一个手动来源**：同一 `source_id` 再次加入是合并（多一条审计事件），换一个 `source_id` 再加入同一卡片被边界拒绝（`LONGTERM_INVALID_ARGUMENT`，可与 `LONGTERM_IDENTITY_COLLISION` 二选一）。
- 幂等：同 `operation_id` 同载荷 → `already_applied` 且零写入；同 `operation_id` 异载荷 → `LONGTERM_IDEMPOTENCY_CONFLICT`。清除后重遇取 `cleared + 1` 且不继承任何排期、掌握、lapse、来源内容或统计；已清除的 `source_id` 不可复用（`LONGTERM_CLEARED`）。

#### 用例矩阵（22 个用例 × 3 后端；`manual_add_failure_injection_rolls_back_every_step` 仅 Memory）

| # | 用例 | 覆盖的 issue #52 验收项 | 关键断言 |
| --- | --- | --- | --- |
| 1 | `list_paginates_with_stable_cursor_and_no_duplicates` | 列表支持分页边界 | 120 卡按 10/页走 12 页，每卡恰好一次且全局有序；非末页必有 `next_cursor`，末页为 `None`；无游标首查询与带游标遍历前缀一致 |
| 2 | `new_card_insertion_never_repeats_or_skips_rows` | 分页不重复、不遗漏 | 游标之前插入的新卡不改变剩余页内容；游标之后插入的新卡恰好出现一次；两次插入后仍无重复 |
| 3 | `sorts_are_deterministic_and_tie_broken_by_card_id` | 约定排序 | 三种排序对同一数据集两次调用结果一致；`DueAt` 升序、`LastErrorAt` 降序且 `NULL` 垫底；全键相同的 6 张卡在三种排序下顺序都等于 `card_id` 升序 |
| 4 | `filters_select_the_documented_card_sets` | 约定筛选 + 空状态 | `All`/`Due`/`Mastered`/`Paused` 四个集合逐 ID 断言；`|Due|` 与 `due_today` 相等（§8.1 同一可见性规则）；无命中与无数据均为空页且无游标 |
| 5 | `list_rejects_limits_and_users_outside_the_boundary` | 分页边界 | 10/50/100 通过；0/1/9/101/1000 与空白 user 均 `LONGTERM_INVALID_ARGUMENT` |
| 6 | `cursor_is_bound_to_its_query` | 游标与查询绑定 | 换筛选/换排序/换 owner 一律 `LONGTERM_CURSOR_INVALID`；空串、截断、前后缀字符、篡改字符等 10 种破坏形式全部被拒（不假设游标线格式） |
| 7 | `lists_details_and_metrics_are_owner_scoped` | owner 隔离 | 同词形两用户两张卡互不可见；他人 `card_id` 查详情 `LONGTERM_NOT_FOUND`；两用户指标各自独立 |
| 8 | `detail_assembles_card_sources_and_event_timeline` | 详情完整展示 | 卡片全部保留字段逐项断言；时间线按 `occurred_at DESC, event_id ASC` 且只含本卡事件；每次作答解析到真实会话/条目并回指同一 `(card_id, generation)`；详情不受 30 日窗口限制；缺失 generation/越权/非法 generation 各返回对应稳定码 |
| 9 | `detail_separates_manual_adds_from_ordinary_errors` | 区分错误加入与手动加入 | 手动加入后时间线同时含 `manual_add` 与既有 `ordinary_error`；`manual_add` 的 `answer_raw`/`is_correct`/`attempt_result`/会话引用全为空；来源列表并列书来源与手动来源 |
| 10 | `cleared_generation_is_hidden_everywhere` | 已清除数据一致隐藏 | 清除前断言原始答案确实落库；清除后列表无该卡、详情 `LONGTERM_NOT_FOUND`、错误文本不含词形/答案/书名；30 日易错次数恰好减 1 |
| 11 | `cleared_source_keeps_other_sources_and_hides_the_rest` | 已清除来源端到端 | 按书清除后他书仍支持的卡来源、事件、到期状态不变；只剩被擦除来源的卡落入 `Paused`、来源与时间线为空且无占位原文；重新手动加入后回到可复习状态 |
| 12 | `metrics_match_the_fixed_dataset_exactly` | 统计口径有固定数据集测试 | 固定数据集逐字段断言 `2 / 4 / 4÷7 / 6`；重复调用结果一致 |
| 13 | `metric_window_bounds_are_closed_at_the_lower_edge` | 窗口口径 | 7 日/30 日窗口下界闭合、`now + 1` 不计；时钟前进一天后窗口移动；负 `now_ms` 与过小时钟返回 `LONGTERM_INVALID_ARGUMENT` |
| 14 | `metrics_ignore_early_manual_and_empty_denominator` | 分母为 0 显示 `--` | 只有提前练习时分母为 0 → `None`；手动加入不改动 30 日易错次数、7 日正确率与掌握数，只按 `due_at = occurred_at` 使今日到期 +1 |
| 15 | `metrics_recompute_after_clear` | 清除后立即重算 | 清除一个 `again` 组后 7 日正确率 `4/7 → 4/6`（分子不变、只缩分母）、30 日 `6 → 5`；用户级清除后四个字段归零/为空；另一用户指标不受影响 |
| 16 | `list_summaries_agree_with_detail_history_and_metrics` | 列表汇总值与详情历史一致 | 每行摘要等于其详情卡片投影；按详情时间线重算的 30 日易错次数与 7 日正确率逐值等于 `get_metrics` |
| 17 | `manual_add_derives_identity_and_writes_only_a_sentinel` | 手动加入身份推导（§3） | `"  Café  "` → 规范词形 `café` 且 card ID 等于 §3.2 摘要；generation 1；`step=0/interval=1/due_at=occurred_at`；`last_error_at`/`last_review_at`/`mastered_at`/`lapse`/`recent_wrong_source_id` 全空；来源为 `Manual` 且无书/条目上下文、`last_wrong_at` 为空；唯一事件为 `manual_add`；立即出现在 `全部` 与 `已到期`，不出现在 `暂停/已掌握`；远期 `occurred_at` 的手动卡不进 `已到期` |
| 18 | `manual_add_is_idempotent_on_replay_and_conflicts_on_change` | 手动加入幂等 | 同 `operation_id` 重放返回 `already_applied` 且卡片行与来源行逐字节不变；同 ID 异载荷 `LONGTERM_IDEMPOTENCY_CONFLICT` 且卡片行不变 |
| 19 | `repeating_manual_add_of_one_card_is_idempotent` | 同一卡片幂等 + §4.2 唯一键 | 同一手动来源再次加入是合并并多一条审计事件；换手动来源被拒且零写入；既有卡片行逐字节不变；详情来源为"书来源 + 唯一手动来源"；时间线两条 `manual_add`、一条 `ordinary_error`；列表只有一行；30 日易错次数不变 |
| 20 | `manual_add_after_clear_starts_a_new_generation` | 已清除后手动加入 | 墓碑为 1 时重遇取 generation 2；不继承 `lapse`/`last_error_at`/`mastered_at`/`recent_wrong_source_id`，排期回到新卡形状；新 generation 时间线只有新 `manual_add`、来源只有新来源；指标不因清除或手动加入而虚增；复用已清除 `source_id` 被拒且骨架仍无词形 |
| 21 | `manual_add_rejects_invalid_input_and_foreign_rows` | 非法输入拒绝 | 空 `operation_id`/user/spelling/source_id/source_spelling、负 `occurred_at`、`book_id` 与 `item_id` 只给其一 → `LONGTERM_INVALID_ARGUMENT` 且不建卡不写事件；他人 `source_id` 与绑定其他词的存活 `source_id` 被拒（稳定码可为 `NOT_FOUND`/`INVALID_ARGUMENT`/`IDENTITY_COLLISION`，但不得成功） |
| 22 | `manual_add_failure_injection_rolls_back_every_step` | 中途失败完整回滚 | 在第 1–5 步逐一注入失败：卡片行、来源行、审计事件全部零写入；清除注入后同一命令成功（Memory 专属，SQLite/seekdb 无注入点） |

#### 实现状态

- Memory 参照实现：22/22 通过。
- SQLite（`--features sqlite`，`SeekDbEmbeddedAdapter`）：截至本节写入时 42/43 通过；`sqlite_filters_select_the_documented_card_sets` 一例失败，见遗留项。
- seekdb 运行时：21 个用例按范式 `#[ignore]`，待 `make init` provisioning 后解除。

#### 遗留项

- ~~**`已到期` 筛选与 `due_today` 的可见性不一致（阻塞项）**~~ **已由 #55-A 复跑关闭（提交 `85df722b` / `5a9463b6`）**：`cargo test --locked --offline -p quicklang-tests --features sqlite --test longterm_list` → 43 passed / 0 failed，`sqlite_filters_select_the_documented_card_sets` 转绿。`ll_filter_sql` 的 `CardFilter::Due` 分支确实已含 `ll_not_in_active_formal_session`（同文件 `longterm_list.rs` 第 604 行定义），本节的"阻塞项"结论自 #52-D 记录写下之后已过期，不再是已知失败。另补双后端证据 `session_state.rs::ruling_queued_cards_leave_the_shared_due_visibility_filter`：冻结 5 张卡之后 `due_today` 与错题本 `已到期` **同时**减去这 5 张，即 §8.1 与 §8.2 共用的可见性过滤在真实适配器上成立。
- ~~**手动来源唯一性错误码**：本节按实现记录为 `LONGTERM_INVALID_ARGUMENT`；`LONGTERM_IDENTITY_COLLISION` 同样被契约接受。需 #55 固定其一。~~ **已由 #55-A 裁定（提交 `5a9463b6`）**：固定为 `LONGTERM_INVALID_ARGUMENT`。依据是 §4.2 的"每卡片每 generation 只允许一个手动来源"是业务规则，而 `LONGTERM_IDENTITY_COLLISION` 按 §5.4 的错误映射表专指 §3.2 的身份重算不匹配。契约断言已从二选一收紧为唯一码。
- ~~**越权 `source_id` 的错误码**：实现返回 `LONGTERM_INVALID_ARGUMENT`（不确认该 ID 是否存在），契约同时接受 `LONGTERM_NOT_FOUND`；隐私上更倾向不确认存在性，建议 #55 固定为 `INVALID_ARGUMENT`。~~ **已由 #55-A 裁定（提交 `5a9463b6`）**：固定为 `LONGTERM_INVALID_ARGUMENT`。依据是 §12.4「不确认该 ID 是否存在」——`LONGTERM_NOT_FOUND` 会让"存在但不属于我"与"根本不存在"成为可区分的两种回答。契约断言已收紧。
- **`CardState::Paused` 无写入路径**：§4.1 允许该值，但目前只有读取侧解析与本节 `Paused` 筛选的派生投影（`seed_metrics_world` 的 `zeta` 人工构造）。#53 是否需要"暂停整张卡"的入口，由 #53/#55 决定；若不提供，应在 §4.1 注明该状态只由迁移或未来功能写入。
- **游标线格式未冻结**：本节只冻结"不透明、有界、带完整性校验、绑定查询"四项行为契约，编码字节布局由实现自选（Memory 与 SQLite 不同）；任何跨进程持久化游标的需求（§10.2 同步预留）都要求先冻结线格式。
- **详情时间线条数**：本节取 50 条（与 #47 `list_events_for_card` 的实际上限一致）。§8.2 未规定该上限；若 #53 需要分页时间线，应在 `CardDetail` 增加游标字段而不是静默截断。
- **`list_cards` 无 `now_ms`**：`Due` 筛选使用服务端时钟，契约测试以 `FAR_PAST`/`FAR_FUTURE` 极端 `due_at` 保证跨机器确定性。若 #55 的一致性基准要求可注入时钟，需要在 `ListCardsQuery` 增加可选 `now_ms`，这属于 DTO 变更（§9.1）并需升版本。

### #55 发布清单与文档校对

本节是 #55 的发布清单入口与逐条校对结论，可勾选项全部落在 `docs/design/0.7/long_learn_release_checklist.md`（下称**清单**），本节只保留"问题清单 + 建议改法 + 归属"。分工代号：**#55-A** 双后端契约汇总、**#55-B** 性能基准与发布开关、**#55-C** 隐私与端到端、**#55-D** 清单与校对（本文档）。校对基线：`origin/main..HEAD` 23 个提交（`d67142fb` → `54a30b70`），2026-10-04 21:0x。

**清单结构**：§0 状态约定与基线快照 → §1 上线前阻断依赖 B1–B11 → §2 §13 四阶段发布步骤与开关矩阵 → §3 观测指标与埋点 → §4 回滚条件、步骤与演练 → §5 §14.1 十条验收项 → 测试/提交/负责人映射 → §6 §14.2 十四条不变量覆盖矩阵 + §5.6 四项裁决回归 + 三项待裁 → §7 校对结论索引 → §8 §11.2/§11.3 基准报告口径 → §9 §12.3 真机人工清单 → §10 风险登记 → §11 完成条件。§2/§3/§4/§8/§9 分别由 #55-B、#55-C 认领后勾选。

**基线快照（可复算）**：`tests/contract/` 6 个长期契约文件；已入库 `#[ignore]` 用例 **59** 个（`longterm.rs` 20、`longterm_clear.rs` 16、`longterm_list.rs` 21、`session_state.rs` 2、`ordinary_error.rs` 0；取证 `grep -E '^\s*#\[ignore' tests/contract/*.rs`）。`tests/contract/longterm_export.rs`（1856 行、24 个用例）与 `tests/rust/Cargo.toml` 的 `[[test]] longterm_export` 尚未入库（`git status --short`），属 #54-B 在途，**暂无法核对**。领域纯函数单测：`domain/src/longterm.rs` 7 个、`scheduler/src/longterm.rs` 21 个。无 `benches` 目标，`src/**` 对 `feature_flag`/`featureFlag`/`longterm_enabled` 零命中。

#### 校对问题清单

| # | 问题（文档 vs 实现） | 位置 | 建议改法 | 归属 |
| --- | --- | --- | --- | --- |
| P1 | §9.1（第 692–705 行）列 12 个命令，实际只注册 9 个：`longterm_change_source_state`、`longterm_clear`（#51）、`longterm_export_json`（#54）未在 `generate_handler` 中。`src/app/src/longterm.rs:1625-1650` 的守卫测试还**断言** `longterm_export_json` 不得出现在 `lib.rs`；#54-A 注册导出命令时该守卫必然失败，需同步改守卫与其上方"five assigned commands"注释（实为 9 条） | §9.1 第 690–705 行；`src/app/src/lib.rs:259-267`；`src/app/src/longterm.rs:1622-1650` | 文档侧：§9.1 加"注册状态"一列或在本节标注 9/12；代码侧由 #54-A 更新守卫测试与注释 | #54-A / #55-A |
| P2 | §5.1（第 348 行）签名 `exportLongtermData(command, sink)` 带 `sink`（流式写文件的出口），trait 实现 `export_longterm_data(&self, command) -> Result<ExportResult, AppError>` 没有 sink：目的地改为由命令自带 `command.output_path` 承载（"Repository 是唯一知道临时路径、flush/sync 点与原子重命名的组件"），当前方法体仍返回 `not_implemented` | §5.1 第 348 行；`src/crates/storage-api/src/longterm.rs:376-394`（命令与理由注释）、`:644-650`（未实现的方法体） | §5.1 改为 `exportLongtermData(command)` 并注明 `command.output_path` 承载目的地；若 #54-A 最终仍走 `sink`，则改为把 sink 纳入 trait。**暂无法核对**（在途） | #54-A |
| P3 | §#52 的"阻塞项"结论与已提交代码矛盾：文中称 `ll_filter_sql` 的 `CardFilter::Due` 缺"不在 active 正式会话"谓词、SQLite `sqlite_filters_select_the_documented_card_sets` 失败（42/43），但 `ll_filter_sql` 的 `Due` 分支已拼入 `ll_not_in_active_formal_session` | 本文件第 1520、1525 行；`src/crates/storage-seekdb/src/longterm_list.rs:625-630`（谓词定义第 604 行） | 由 #52 或 #55 复跑 `--features sqlite --test longterm_list` 后更新第 1520、1525 行；在复跑前不得把该阻塞项当作已知失败带入发布评审 | #55-A 复跑 / #52 回写 |
| P4 | 两处"本文件 N 行"与实际不符：`longterm_clear.rs` 记 3496 行（实际 3524）、`session_state.rs` 记 2763 行（实际 3184） | 本文件第 997、1094 行 | 改为"以文件为准"或刷新数字，避免下次评审再被当作过期证据 | #55-D |
| P5 | §9.1 第 686 行"所有命令包含 `operationId`"与实现不符：`longterm_get_active_sessions`、`longterm_list_cards`、`longterm_get_card_detail`、`longterm_get_dashboard` 四个只读查询无 `operation_id`；`ExportLongtermDataCommand` 也没有 | §9.1 第 686 行；`src/app/src/longterm.rs:130-131,1757-1778,1782-1790,1794-1796`；`storage-api/src/longterm.rs:386-394` | §9.1 改为"所有**写**命令包含 `operationId`；只读查询不需要"。第 687 行"响应包含新的 version、事件 ID、会话摘要和可安全重试标志"同样应限定为写命令的响应 | #55-D |
| P6 | §13 第 847 行"发布由本地功能开关控制"没有实现载体：§13 第 849–852 行的四个阶段与第 854 行的"运营决定关闭功能开关后"都依赖一个当前不存在的开关 | §13 第 847–854 行；`src/**` 零命中 | 清单 §2.0 已给出三开关矩阵（`longterm_write`/`longterm_entry`/`longterm_export`）；归属需在 #53/#55-B 之间确认并落地 | #55-B（待确认归属） |
| P7 | §14.2-11（技术失败不计错）**无任何用例**：§8.4 第 668–675 行的 TTS 回退/权限拒绝/播放失败语义无测试；§12.1（第 804–812 行）与 §12.3（第 834 行）都要求该行为 | §8.4、§12.1、§12.3、§14.2-11 | 清单 §6.1 已列为覆盖缺口；由 #55-C 补端到端用例，或随 #53 落地后补 | #55-C |
| P8 | §14.2-12（不泄露已擦除字段）只覆盖存储层：§12.4 第 840 行要求在"数据库、导出、日志、错误、崩溃信息"中搜索已清除词形与原始答案，日志与崩溃信息无对应用例；清除后的全局搜索（§12.3 第 835 行）依赖 #53 UI | §12.4 第 840 行、§12.3 第 835 行、§14.2-12 | 清单 §6.1 已列为缺口；#55-C 补日志/错误文本扫描用例 | #55-C |
| P9 | §5.6-13（第 497 行）要求 §14.2-13 的双后端核对覆盖 §5.6 四项，但 `session_state.rs` 的 SQLite 用例只有 create / submit-again / abandon 三条，§5.6-2（时钟推进重放）与 §5.6-3（空选选卡）**没有 SQLite 对照** | 本文件第 497 行、第 1070 行 | 清单 §6.2 已逐条列出；#55-A 补两条 SQLite 对照 + 对应 seekdb 用例 | #55-A |
| P10 | §12.2（第 820 行）要求普通错误回滚在双后端一致，但 `ordinary_error.rs` 13 个用例中只有 2 个 SQLite（happy path、幂等），**无 SQLite 故障注入回滚、零 seekdb 用例**（实测 `#[ignore]` 数为 0） | §12.2 第 820 行；§#48 记录第 905、934–935 行 | #55-A 补 `sqlite_ordinary_error_rolls_back_every_injected_step` 与两条 seekdb 用例；§#48 第 934 行的"缺 trait 实现会构建失败"表述已过期（`SeekDbEmbeddedAdapter::record_ordinary_error` 已在 `longterm_repo.rs:11` 实现） | #55-A |
| P11 | §14.1 第 866 行（TTS 与首页/详情在 macOS/iOS 一致）依赖 #53（今日复习与提前练习 UI），`origin/main..HEAD` 23 个提交中无 #53 提交 | §14.1 第 866 行；§15 第 897 行 | 按 issue #55"有明确阻断说明"处理：清单 §1 B8 登记为阻断；#53 落地后由 #55-C 关闭 | #55-C |
| P12 | 三项待裁（清单 §6.3）：`finished_at` 擦除语义（§4.4 第 250 行与本文件第 978 行保留 vs 本文件第 1439 行按 `null` 记录）、`ErrorCount` 排序键窗口（本文件第 1478 行写"§8.3 的 30 日"vs 实现 `ll_error_count_expr` 无窗口，`longterm_list.rs:62-71`）、`CardDetail` 是否需 `display_source_id`/事件游标（`storage-api/src/longterm.rs:417-421`；本文件第 1530 行） | 见左 | #55-A 裁定唯一口径，#55-D 回写 §8.2/§4.4/本文件对应遗留项；`CardDetail` 加字段属 §9.1 DTO 变更需升版本 | #55-A → #55-D |
| P13 | §#52 遗留项把"手动来源唯一性错误码""越权 `source_id` 错误码"记为二选一未定，契约同时接受两个稳定码 | 本文件第 1526、1527 行 | #55-A 各固定为一个码并收紧断言（隐私上倾向不确认存在性） | #55-A |
| P14 | §#54 的"实现状态"与"遗留项"多处待回填：第 1412 行"提交号待回填"、第 1442 行"该形状在 #52 实现前是文档假设，需 #52-A 落地后回填核对" | 本文件第 1412、1442 行 | #54-A/#52-A 落地后回填；**本波次暂无法核对**（#54-A 在途） | #54-A / #52-A |
| P15 | §14.1 第 868 行的性能阈值（2 万卡/100 万事件，P95 `< 200 ms`/`< 300 ms`）无任何基准设施：无 `benches` 目录、`tests/rust/Cargo.toml` 无 `[[bench]]` | §14.1 第 868 行；§11.2 第 782–789 行；§11.3 第 795–798 行 | 清单 §8 已固定报告口径（设备、系统、后端版本、冷/热缓存、种子、运行次数、p50/p95，不得只报最快一次）；#55-B 执行 | #55-B |
| P16 | §#54 的"实现状态"把命令写成 `ExportLongtermDataCommand{user_id, include_raw_answers}`，漏掉第三个字段 `output_path`（目的地绝对/相对路径，Repository 不替用户选位置）；样例文件与逐字段表只覆盖记录与顶层，不涉及该字段，因此该遗漏不会被导出契约自动发现 | 本文件第 1411 行；`src/crates/storage-api/src/longterm.rs:386-394` | #54-A 回填第 1411 行为三字段，并把"用户选位置、临时路径与原子重命名由 Repository 负责"的边界补进 §10.1 第 759–763 行 | #54-A / #55-D |

**已核对无矛盾的部分**（记录以免重复校对）：§5.4 第 437 行"20 个 seekdb 用例保持 `#[ignore]`"与实测一致；§#51 第 995 行的 16 ignored、第#50 第 1092 行的 2 ignored、第#52 第 1521 行的 21 ignored 均与实测一致；§#54 第 1419 行样例文件"1788 行、60 759 字节"与实测一致；§5.6.4 第 491 行"`longterm_record_ordinary_error` 直连 Repository"仍成立（`application/src/longterm.rs` 导出 `grade_attempt`/`create_or_resume_*`/`submit_attempt`/`get_active_session`/`abandon_session`/`add_card_manually`，无 `record_ordinary_error`）；§5.6.1 与 §#50 第 1075 行的条目版本裁决一致；§7.3 最小保留清单与 `erased` 骨架断言自洽。

**留给 #55-A / #55-B / #55-C 的补充项**：#55-A 关闭清单 §1 的 B1、B3、B6、B7、B11 与 §6.1 中 §14.2-3/§14.2-13 的缺口，并裁定 §6.3 三项待裁；#55-B 关闭 B4、B9，按 §8 产出基准报告并在 §2/§3 勾选开关与指标；#55-C 关闭 B8，补 §14.2-11、§14.2-12、§14.2-14 的 UI/日志级用例并完成 §9 真机清单与 §4.3 回滚演练。**暂无法核对、不得臆断的部分**：#54-A 的导出实现与 `export_longterm_data` 最终签名（P2、P14）、#54-B 未入库的 `tests/contract/longterm_export.rs` 用例集、以及 #53 的 UI/TTS 落地（P7、P11）。

### #53 实现与验收记录

本节是 issue #53「0.7：实现今日复习与提前练习 UI」的验收记录，由 **#53-C** 汇总；**#53-A** 提交 `7d91520c`（首页今日复习入口与指标展示），**#53-B** 提交 `855e1db0`（今日复习答题与提前练习流程）。可访问性逐条核对另见 `docs/design/0.7/long_learn_a11y_check.md`（下称**核对报告**），本节只给摘要与指针。基线：分支 `issue/45-longterm-learning`，2026-10-04 22:3x。

#### 实现摘要

**前端组件（全部在 `src/ui/src/shared/features/longterm/`）**

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `LongtermReview.tsx` | 48 | §8.1 路由容器；只做「今日复习 / 提前练习」一个选择，两者永不混用文案与计数 |
| `LongtermDashboard.tsx` | 153 | 首页面板：四个 §8.3 指标、开始/继续入口、空态、`handle.refresh()` 接缝 |
| `useLongtermDashboard.ts` | 103 | 首页读取状态机 `loading`/`ready`/`failed`，过期响应丢弃，回前台重读 |
| `useActiveFormalSession.ts` | 72 | §8.1「继续复习」的纯读取；终态会话视为不存在，回前台重读 |
| `dashboard.ts` | 137 | §8.3 格式（`--` 而非 `0%`）、§9.2 错误码与文案、§8.4 技术失败判定 |
| `ReviewSession.tsx` | 453 | §6.2–§6.4 答题面：听音到拼写、提示/揭晓/跳过、放弃二次确认、§8.4 播放回退 |
| `EarlyPractice.tsx` | 324 | §8.2 错题本筛选/排序/游标分页 + 1–100 张多选进入提前练习 |
| `useReviewSession.ts` | 492 | §6.4 会话状态机：恢复或创建、提交、倒计时、放弃、过期响应丢弃、并发串行化、回前台重读 |
| `session.ts` | 224 | 纯规则：§2.3 评分策略、§6.4 倒计时与文案、§2.4 选卡边界、§9.2 文案 |
| `reviewSessionHandle.ts` | 14 | §8.1 → §6.2 的接缝类型（`close`/`refresh`/`dueToday`），不含视图 |
| `native/longterm.ts` | 664 | 平台中立 DTO 与 12 个 IPC 封装（`LongtermCurrentItem.version` 即 §5.6.1 的 CAS token） |

**状态机**：`ReviewPhase = loading | answering | empty | completed | abandoned | failed`（`useReviewSession.ts:33`）。`empty` 是事实而非失败——`formal` 且未传 `cardIds` 时收到 `LONGTERM_NOT_FOUND` 走空态（`:263-271`）。恢复优先：`getActiveSessions` 命中则直接采用，不重新选卡、不重新随机、不清零一分钟等待（`:232-244`）。写路径由 `writing.current` 串行化（`:191,288,315,395`），倒计时用 1 s 本地 tick + 到点一次重读（`:438-453`），不对后端忙轮询。

**使用命令**：`npx vitest run --config tests/vitest.config.ts tests/unit/ui/longterm-{dashboard,dashboard-ipc,review-route,review-session,session-ipc,session-rules,early-practice}.test.ts{,.ts}x`（#53 共 7 个文件 **87** 个用例，实测全通过）；`npm run typecheck --workspace @quicklang/ui`。#53 为纯前端提交，`src/**` 的 Rust 侧**零改动**。

#### 契约核对（文档 vs 实现）

| 契约 | 实现位置 | 结论 |
| --- | --- | --- |
| §5.6.1 `expectedVersion` 取**条目**版本 | `useReviewSession.ts:335`（`expectedVersion: next.itemVersion`）、`native/longterm.ts:291-296` | 通过。用例 `longterm-review-session.test.tsx` → `submits the entry version verbatim and advances from the response`（条目 token 4 ≠ 会话 token 7）、`longterm-session-ipc.test.ts:122` |
| §5.6.5 放弃取 `session.version` | `useReviewSession.ts:425`、`native/longterm.ts:562-563` | 通过。用例 `longterm-review-session.test.tsx` → `requires a second confirmation before abandoning and keeps the session version`（断言 `expectedVersion === 7`） |
| §5.6.5/§6.1 正式入口不传 `cardIds` | `LongtermReview.tsx:35-42`、`native/longterm.ts:478`（空数组即「后端选卡」，与 §5.6.3 的 `card_ids` 为空同义） | 通过。用例 `longterm-review-session.test.tsx:127`、`longterm-session-ipc.test.ts:84` |
| §2.4 提前练习必传 1–100 张 | `EarlyPractice.tsx:154,165-177`、`session.ts:136-142`、`native/longterm.ts:332-334` | 通过。用例 `longterm-early-practice.test.tsx` → `requires at least one selected card before an early session can start` / `freezes every generation of one card as its own entry`、`longterm-session-rules.test.ts` → `keeps the §2.4 selection bounds of an early session` |
| §9.2 `LONGTERM_NOT_FOUND` → 空态而非错误弹窗 | `useReviewSession.ts:263-271`、`ReviewSession.tsx:205-218` | 通过。用例 `longterm-review-session.test.tsx` → `treats a learner without due cards as an empty day, not a failure`（断言 `queryByRole("alert")` 为 null） |
| §6.4 按 `nextAvailableAt` 倒计时、不忙轮询 | `session.ts:43-59`（只解析 `LONGTERM_ITEM_NOT_READY` 的受控句子）、`session.ts:116`（`WAIT_NOTICE` 不含秒数）、`useReviewSession.ts:371-378,459-474` | 通过。用例 `longterm-review-session.test.tsx` → `waits on the returned nextAvailableAt instead of polling or re-submitting` / `disables grading while the resumed entry is still inside its wait` / `keeps the countdown seconds out of the live region`、`longterm-session-rules.test.ts` → `reads the §6.4 nextAvailableAt instead of polling for readiness` / `counts the §6.3 wait down and never below zero` / `disables grading only while a waiting entry still holds its §6.3 gap` |
| §6.4 放弃二次确认 | `ReviewSession.tsx:400-447`（常驻确认区 + `hidden` 切换 + `role="alertdialog"` + `Escape` 关闭）、`useReviewSession.ts:426`（`confirmed: true`） | 通过。用例 `longterm-review-session.test.tsx` → `requires a second confirmation before abandoning and keeps the session version` / `moves focus into the abandon confirmation and hands it back`、`longterm-session-ipc.test.ts:186` |
| §5.3/§5.6.5 重试同 `operationId` + 同 token + 同 answer | `useReviewSession.ts:318-335`（`reusable` 四字段比对）、`:387`（冲突时丢弃 pending，避免旧 token 进新尝试） | 通过。用例 `longterm-review-session.test.tsx` → `resends the identical attempt on a retry instead of grading twice`（`operationId`/`expectedVersion`/`answer` 三者相等）/ `refreshes the entry after a stale version instead of retrying the old token`（新尝试换 id、换 token 11） |
| §8.3 分母 0 → `--` 而非 `0%` | `dashboard.ts:76-89`、`LongtermDashboard.tsx:41-45` | 通过。用例 `longterm-dashboard.test.tsx` → `shows -- and never 0% when the 7-day denominator is zero` / `formats rates without rounding a genuine value away`；`native/longterm.ts` 保留 `null` 不转 0 |
| §8.4/§14.2-11 技术失败不提交 `again` | `ReviewSession.tsx:96`（`audible` 闸门：播放开始即开、失败即关）、`:168-179`（未确认可听时**不提交**任何评分，只播报 `ungradedNotice`）、`:314-318`、`useReviewSession.ts:393-401`（保留题目与 pending）、`dashboard.ts:56-59` | **通过**（D1 已修，见下方 L1）。用例 `longterm-review-session.test.tsx` → `grades a correct answer typed while the audio is still playing` / `never scores a spelling when the audio could not be played` / `keeps an entry audibly heard when a later replay fails` |
| §5.6.4 四个会话命令经 application 层 | `src/crates/application/src/longterm.rs` 导出 `create_or_resume_formal_session`/`create_or_resume_early_session`/`submit_attempt`/`get_active_session`/`abandon_session`/`grade_attempt` | 通过。#53 无 Rust 改动，未绕过 |
| §5.6.4 例外 `longterm_record_ordinary_error` 仍直连 Repository | `src/app/src/longterm.rs:683-688`（`db.record_ordinary_error(...)`），`application/src/longterm.rs` 无同名导出 | 仍成立，符合本节裁决原文。**仍按 §5.6.4 由 #55 收尾时补 application 薄层**，#53 不改 |
| §9.1 UI 不计算调度/完成条件 | `session.ts:36-40` 只镜像评分策略，`useReviewSession.ts:360-367` 从 `adopt()` 的后端视图前进 | 通过（`gradeAttempt` 的注释已声明后端会复核） |
| §8.3 今日到期与提前练习不混淆 | `session.ts:222-224`、`ReviewSession.tsx:268,448-450`、`LongtermDashboard.tsx:91-93`、`EarlyPractice.tsx:193-195` | 通过。用例 `longterm-session-rules.test.ts` → `names both flows differently so counters never get confused`、`longterm-review-session.test.tsx` → `addresses the learner who owns the session`、`longterm-early-practice.test.tsx` → `opens the answering view of the early session without touching 今日复习` |

#### 验收映射表（issue #53）

issue #53 的四条验收标准 → 实现位置 → 测试用例名（全部在 `tests/unit/ui/`）：

| 验收标准 | 实现位置 | 测试用例名 | 结论 |
| --- | --- | --- | --- |
| **可从首页进入今日复习并完成一轮会话** | `pages.ts:12`、`LearningApp.tsx:134`、`LongtermReview.tsx:20-47`、`LongtermDashboard.tsx:69-73,100-116`、`ReviewSession.tsx:46-361` | `longterm-dashboard.test.tsx` → `renders the four §8.3 metrics and offers the 今日复习 entry` / `opens the review flow without creating a session on the home page` / `hands the answering view a refresh seam that invalidates the counters`；`longterm-review-route.test.tsx` → `refreshes the counters and the resume read after a committed grade` / `returns from the answering view to the §8.1 counters`；`longterm-review-session.test.tsx` → `resumes an active session without creating or re-selecting one` / `creates a formal session without card ids when nothing is active` / `submits the entry version verbatim and advances from the response` / `shows the completion state and returns to the counters` / `keeps a waiting session reachable after nothing is due any more` | **通过** |
| **无到期卡时显示空状态并可选提前练习** | `LongtermDashboard.tsx:69-70,106-115,139-141`、`useReviewSession.ts:263-271`、`ReviewSession.tsx:162-179`、`EarlyPractice.tsx:61-187` | `longterm-dashboard.test.tsx` → `disables the entry and states the empty day when nothing is due` / `never claims an empty day while the read is still pending`；`longterm-review-session.test.tsx` → `treats a learner without due cards as an empty day, not a failure`；`longterm-review-route.test.tsx` → `offers 提前练习 from an empty day and comes back through the same page` / `leaves 提前练习 for an empty day from inside a formal session`；`longterm-early-practice.test.tsx` → `states the empty wrong book instead of showing an empty table` / `invites another filter when the chosen one holds no card` | **通过** |
| **加载、失败、重试、取消、完成和并发点击均有 UI 测试** | 加载 `useLongtermDashboard.ts:56-73`、`useReviewSession.ts:230`、`EarlyPractice.tsx:101,232`；失败 `useReviewSession.ts:260-272,348-380`、`LongtermDashboard.tsx:93-98`、`EarlyPractice.tsx:118-138`；重试 `useReviewSession.ts:455-457`、`ReviewSession.tsx:187,236,349`；取消 `ReviewSession.tsx:343-345,352-354`；完成 `useReviewSession.ts:114-118,197-213`；并发 `useReviewSession.ts:191,288,315` + `ReviewSession.tsx:124,215` | 加载：`longterm-early-practice.test.tsx` → `shows the loading state before the first page arrives`；`longterm-dashboard.test.tsx` → `never claims an empty day while the read is still pending`。失败：`longterm-review-session.test.tsx` → `reports a failed session read and recovers through an explicit retry`；`longterm-dashboard.test.tsx` → `reports a failed read and recovers through an explicit retry`；`longterm-early-practice.test.tsx` → `keeps a failed read retryable and shows no rows as facts`。重试：`longterm-review-session.test.tsx` → `resends the identical attempt on a retry instead of grading twice` / `refreshes the entry after a stale version instead of retrying the old token`；`longterm-early-practice.test.tsx` → `restarts from the first page when the cursor no longer matches`。取消：`longterm-review-session.test.tsx` → `requires a second confirmation before abandoning and keeps the session version`（点「继续复习」不提交）；`longterm-review-route.test.tsx` → `returns from the answering view to the §8.1 counters`；`longterm-early-practice.test.tsx` → `returns to the home counters without leaving the route`。完成：`longterm-review-session.test.tsx` → `shows the completion state and returns to the counters` / `ends the flow when the session is already finished` / `refuses to freeze a second selection while an early session is unfinished`。并发：`longterm-review-session.test.tsx` → `submits one attempt no matter how often the button is clicked` | **通过**（7 个用例 78 个断言组） |
| **macOS/iOS 布局、键盘/触控和可访问性完成验收** | 键盘 `base.css:68-74`、`ReviewSession.tsx:104-107,322-344,400-447`（放弃确认的焦点移入/归还 + `Escape`）；触控 `learning.css:1029-1041,1055-1066` + `mobile.css:19-23`；可访问性 见**核对报告** §1–§7 与 §8 | 键盘：`longterm-review-session.test.tsx` → `keeps the question keyboard reachable and announces progress` / `moves focus into the abandon confirmation and hands it back`；`longterm-dashboard.test.tsx` → `renders the four §8.3 metrics and offers the 今日复习 entry`（`entry.focus()`）。可访问性：45 处 `getByRole`/`getByRole("timer")`/`toHaveAccessibleName` 断言。修复：核对报告 D1–D8 与 D10、D11 已修（L6 附带修） | **仍未完成，但阻断项已清零**：jsdom 侧通过，核对报告的 2 个阻断级（D1 评分语义、D2 播报洪泛）与 5 个建议级（D3–D7）缺陷、连同 D8/D10/D11 观察项均已修复并有用例；**真机 VoiceOver/TalkBack 全流程、iOS 窄屏布局、动态字体、TTS 真机回退仍未跑**（核对报告 §9 逐项列出），因此本条**不得勾为完成** |

issue #53「范围」五条的落点：展示到期数量/开始继续/完成反馈/错误恢复 → 上表第 1、3 行；提前练习入口与文案区分 → `EarlyPractice.tsx:194`、`ReviewSession.tsx:225,359`、`session.ts:197-200`；错题本/详情导航 → `EarlyPractice.tsx:61-187`（详情仅用于 `useReviewSession.ts:157-171` 解析活动来源，**无独立详情页**，属 #52 范围）；长期复习 IPC 状态机接入 → `useReviewSession.ts` 全文；可访问性 → 核对报告。issue「关键不变量」三条：不自行计算调度或改会话状态 → 通过（`session.ts` 只镜像 §2.3 策略，从 `adopt()` 前进）；今日到期与提前练习不混淆 → 通过；重渲染/返回前台/重复操作不重复提交答案 → **通过**（`writing.current` 串行化 + 三个 hook 的 `visibilitychange` 只读重读：用例 `re-reads the entry when the window comes back to the foreground` / `re-reads the counters when the window comes back to the foreground` / `re-reads the counters and the resume entry after a foreground switch`，回前台走 `adopt`/`refresh` 纯读，不重复提交）。

#### 可访问性结论摘要

逐条结论见 `docs/design/0.7/long_learn_a11y_check.md`（7 个维度共 51 条编号结论：37 通过 / 12 缺陷 / 2 未覆盖，另有 12 条跨切面发现 D1–D12）。**修复状态**：核对报告 §8 的 D1–D8、D10、D11 已修并附用例（D1/D2 为阻断级）；D9（抽公共视觉隐藏类）与 D12（引入 axe）未修，理由见核对报告 §8；**真机 VoiceOver/TalkBack（K10）与动态字体（C9）保持未覆盖，不勾选**。要点：

- **通过且质量较高**：§8.3 的 `--` 附带视觉隐藏的口播句子（`dashboard.ts:105-137` + `LongtermDashboard.tsx:43-44` + `learning.css:936-947`），「真 0 仍是 `0%`」「`<1%` 不冒充 `0%`」都有用例；每处 §9.2 稳定码都有中文句子且原生 message 一律不上屏；两处 `aria-busy`、三处 `role="alert"`、四个 `<th scope="row">`、分组 `role="group"` + `aria-label`、输入框显式 `<label>`、会话内焦点随题移动。
- **对比度**：新增色值全部达标（`#4f6349` 6.54:1、`#2f4634` 10.26:1、失败块 10.81:1、`.badge` 4.97:1、全局焦点环 3.14:1）。**D5 已修**：不达标的是**既有** `.muted`（`#849081`，白底 3.34:1），长期复习作用域改用 `learning.css:980-982` 的 `.longterm-muted`（`#66705f`，白底 **4.57:1**、页底 `#f5f6f1` **4.18:1**），#53 的 16 处 `.muted` 使用点全部切换；**`.muted` 本身未动**（影响全部页面，待应用/产品负责人决策，见核对报告 C7）。
- **必须修复（阻断 issue #53 关闭）—— 已全部修复**：
  - **D1（高，评分语义）已修** `ReviewSession.tsx:96`（`audible` 闸门）、`:114-131`（`playAudio` 在**播放开始**即开闸，失败即关闸）、`:168-179`（未确认可听时**不提交**评分，只播报 `ungradedNotice`）。播放中提交的正确拼写判为 `good`，不产生 lapse（§2.3、§14.2-7）；无法确认可听时宁可不计错（§8.4、§14.2-11）。用例 `longterm-review-session.test.tsx` → `grades a correct answer typed while the audio is still playing` / `never scores a spelling when the audio could not be played` / `keeps an entry audibly heard when a later replay fails`。
  - **D2（中）已修** `ReviewSession.tsx:270-289` + `session.ts:116`（`WAIT_NOTICE` 不含秒数）：live 区只放一次性文案，秒数移到 live 区外的 `role="timer"` 节点（隐式 `aria-live="off"`），视觉位置不变。用例 → `keeps the countdown seconds out of the live region`、`longterm-session-rules.test.ts` → `keeps the seconds out of the polite announcement`。
- **建议修复 —— 已全部修复**：D3 放弃确认常驻 DOM + `hidden` + `role="alertdialog"` + 焦点移入/归还 + `Escape`（用例 `moves focus into the abandon confirmation and hands it back`）；D4 三个 hook 监听 `visibilitychange`，回前台纯读重读（用例 `re-reads the entry when the window comes back to the foreground` / `re-reads the counters when the window comes back to the foreground` / `re-reads the counters and the resume entry after a foreground switch`）；D5 见上；D6 复选框 `box-sizing: content-box` + `padding: 10px` 把触控区撑到 44×44（`learning.css:1055-1068`）；D7 选择区校验改为 `role="alert"` + 非 muted 色（用例 `states the §2.4 selection bound as an alert, not a polite aside`）。
- **观察项**：D8 **已修**——`PendingReviewSession.tsx` 占位组件删除，接缝类型移到 `reviewSessionHandle.ts`，`LongtermDashboard` 无 `renderSession` 时不再渲染占位会话；D10 **已修**——错题本表格行头 `th scope="row"`（拼写）移到首列、复选框列移到末列；D11 **已修**——指标单元格值与视觉隐藏说明之间加空格分隔。**D9 未修**（视觉隐藏模式抽公共类属设计系统改动，登记为后续项）、**D12 未修**（引入 `axe-core` 需要新增依赖，归属 #55-C 统一决定）。

#### 遗留项

> 回填：#53-D（前端缺陷修复）已逐条处理，见下。每条给出「已修 + 修法 + 验证用例」或「未修 + 原因」。

- **L1（阻断）——已修** 核对报告 D1 的播放中提交误判 `again`。修法：`ReviewSession.tsx:96` 引入派生闸门 `audible = spelling !== null && audio !== "failed"`，`:114-131` 的 `playAudio` 在**播放开始**（`setAudio("playing")`）即开闸、`speak()` reject 即关闸（§8.4「只有音频成功进入可听播放状态后才允许提交拼写评分」）；`:168-179` 在 `!audible` 时**不提交**任何评分，只写 `ungraded` 并由 live 区播报 `ungradedNotice`（`session.ts:129`），实现「无法可靠确认时宁可不计错」。没有选择「播放中禁止提交」，因此不需要额外的阻塞提示；反过来补了 `audioNotice`（`session.ts:124`）在 live 区一次性告知「正在朗读本词，可以同时开始拼写」。验证：`longterm-review-session.test.tsx` → `grades a correct answer typed while the audio is still playing`（`speak` 保持 pending，断言 `attemptResult === "good"`、`isCorrect === true`）、`never scores a spelling when the audio could not be played`（断言 `submitAttempt` 未被调用、重试成功后闸门重开）、`keeps an entry audibly heard when a later replay fails`（重放失败后拼写不提交，但「显示答案」仍按 §2.3 记 `again`）。**§14.2-11 的前端侧至此可判定关闭**（后端/存储侧仍按 #55 结论）。
- **L2 ——已修（D2–D7 六条全修）** D2：`session.ts:116` 的 `WAIT_NOTICE` 不含秒数，`ReviewSession.tsx:270-289` 把 live 区（一次性文案）与秒数（live 区外的 `role="timer"`，隐式 `aria-live="off"`）拆成同一行的两个节点，视觉位置不变。D3：确认区常驻 DOM + `hidden` 切换 + `role="alertdialog"` + `aria-labelledby`/`aria-describedby` + 焦点移入 + `Escape` 关闭 + 焦点归还触发按钮（`ReviewSession.tsx:400-447`）。D4：`useLongtermDashboard.ts:80-95`、`useActiveFormalSession.ts:56-70`、`useReviewSession.ts:457-479` 三个 hook 监听 `visibilitychange`，回 `visible` 时 `refresh()` 或 `adopt()` 纯读重读（并重算被节流的倒计时），参照既有先例 `features/spelling/Spelling.tsx:144`。D5：见「可访问性结论摘要」。D6：`learning.css:1055-1068`。D7：`EarlyPractice.tsx:294-306`。验证用例见核对报告 §8 的「验证用例」列。
- **L3（TTS 真机）——未修（需真机，非本波次可做）** §8.4 的三级回退（来源音频 → 平台原生 TTS → WebView TTS）、权限拒绝、设备不可用**未做真机验证**。前端直接复用既有 `speak()`，#53 未新增回退逻辑；§14.1 第 866 行「TTS 与首页/详情在 macOS/iOS 一致」因此**未验收**，归属 #55-C（对应 P11）。
- **L4（seekdb 运行时）——未修（依赖 #55-A 解除 `#[ignore]`）** 本节无 seekdb 运行时结论：#53 未新增 Rust 代码，存储侧仍是 `tests/contract/*.rs` 的 Memory + `--features sqlite`，`#[ignore = "requires real macOS ARM64 seekdb runtime (make init)"]` 的用例数量与 #55 基线快照一致，#55-A 未解除前 §14.2-13 的双后端一致性对本节结论无影响。
- **L5（跨 issue）——未修（跨 issue，非本波次范围）** §8.1 要求「清除、来源状态改变后必须失效首页计数」；`handle.refresh()` 目前只在本会话提交/放弃后触发（`useReviewSession.ts:347,409`），#51 的清除入口与 #52 的来源状态入口尚未接入。理由：两个入口不在 #53 的 `src/ui/**` 前端范围内（属 #51/#52 的 Rust 与 IPC 侧），需要对应 issue 的持有者接上 `handle.refresh`；本波次只在前端侧补了「回前台重读」作为兜底（D4），不能替代 #51/#52 的显式失效。
- **L6（清理）——已修** 核对报告 D8：`PendingReviewSession.tsx`（含 `TODO(#53-B)` 与「答题页面由 #53-B 落地」）已删除，接缝类型移到新文件 `reviewSessionHandle.ts`（14 行，只含 `LongtermReviewSessionHandle`）；`LongtermDashboard.tsx:146-149` 改为 `{reviewing && renderSession?.(session)}`，无接缝时不再渲染占位会话；`longterm-dashboard.test.tsx` → `opens the review flow without creating a session on the home page` 改为自带接缝替身，保留了「首页不创建会话」的原断言。
- **L7（无 UI 缺陷，记录备查）——维持原判** §2.4 的组大小 5–100「可配置」当前只有常量默认 20（`native/longterm.ts:338`、`LongtermReview.tsx:40`），首页无调整控件。§2.4 只要求可配置，故不判为缺陷。
- **L8** 与 #55 小节的联动：本节关闭 P7（§14.2-11 的前端用例已补，且 D1/L1 修复后「播放中提交」不再写出错误的 `again`，P7 的前端侧条件满足）与 P11（#53 已落地）。**P7 的前端侧已可关闭，P11 仍需真机**；归属 #55-C/#55-D，请按本节与核对报告更新结论（本节不代改 #55 小节）。
