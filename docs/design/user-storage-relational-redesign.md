# 用户存储与答题事务重新设计

日期：2026-10-07。状态：下文保留最初的完整目标设计；当前实现及与目标的差异见第 12 节。未修改用户现有数据库。

## 1. 决策

按独立修改和一致性边界拆表。高频学习状态使用明确的列与题目行；配置和可变内容允许小型、受限的 JSON。导入导出使用独立的聚合协议，不再要求物理存储为整用户 JSON。

废弃 `ql_user_documents` 作为运行时数据源，废弃整用户 `app-state-version` 作为答题前置条件。保留 `operationId` 幂等、题目身份校验和核心事务原子性。学习会话、配置、词书内容、词语资料各自维护版本。

新版本导入导出按新 schema 定义，单向支持导入 QuickLang 0.9.2 备份。0.9.2 无需读取新备份；不提供旧格式导出，不保留旧运行时存储或双写路径。已有本机数据库的转换是另一个明确授权的操作；本设计不删除、转换或修改本机数据。

## 2. 当前源码与失败边界

- `src/schema/ql_user_documents.sql`：每个用户一行，`schema_version / revision / payload`。
- `src/crates/storage-seekdb/src/user_documents.rs`：`UserDocument` 同时包含 profile、settings、library、learning、content、ai；`save_user_document` 校验整个文档并重写 payload。其 UPDATE 只有用户条件，没有 revision 条件；不要把现状误认为完整的 SQL CAS。
- `src/crates/storage-seekdb/src/longterm_v2/ordinary.rs`：普通答错读取整个用户文档、检查整用户版本，修改当前会话和每日活动，更新错词卡片，补全资料，保存整用户文档，生成整用户投影，并保存带投影的事件回执。
- `src/crates/storage-seekdb/src/longterm_v2/mod.rs`：上述工作在外层事务中完成；`metadata::retain` 的校验、词典查询、资料 UPDATE 失败会使答题回滚。
- `src/crates/storage-seekdb/src/native.rs`：当前工作区已存在嵌套事务加入外层事务的改动。这是独立的事务实现问题，表拆分不能替代对 BEGIN、COMMIT 和连接状态的检查。
- 长期错词本已使用 card、session、session_item、event 四表，但很多业务字段仍在 payload 中，资料与排程共用 card 行。
- `user_library.rs` 已可从内置目录解析词书，并保存维护差异；不应再次复制所有内置词条到每个用户。
- `user_backup.rs` 已聚合用户与 vocabulary 数据，证明单文件导出可以与多表存储分离。

用户提供的失败分析是本设计的输入。已查看“优化背诵进度保存与布局”和“排查 mac 本机存储不可用”两个会话；后者另有词书副本保存与维护界面问题。尚未从会话记录定位到与粘贴分析完全相同的那一轮，不能将这些不同故障混为同一个已复现根因。

源码支持“大文档耦合、冲突范围过大、资料失败传播”的判断；尚未测量步骤耗时，也未证明所有数据库失败均由 JSON 大小导致。

## 3. 逻辑表结构

下表是目标逻辑模型。名称、主键、查询索引和关键列明确；实际 seekdb/SQLite DDL 在实施时分别生成并验证，不把示意 SQL 直接加入启动目录。

| 表 | 主键/唯一约束 | 关键列与职责 |
| --- | --- | --- |
| `ql_user` | PK user_id | name、level、profile_revision；用户身份 |
| `ql_user_setting` | PK (user_id, setting_key, scope_id) | value_json、revision；scope_id 为空串表示全局，配置一项一行 |
| `ql_user_library_selection` | PK user_id | selected_book_id、revision；当前选择 |
| `ql_user_book` | PK (user_id, book_id) | title、base_book_id、content_revision；用户自建书或对内置书的维护覆盖 |
| `ql_user_book_item` | PK (user_id, book_id, item_id)，UNIQUE (user_id, book_id, position) | word_ref、position、override_json；内置词语引用或自定义内容 |
| `ql_learning_progress` | PK (user_id, mode, book_id) | learned_count、resume_item_id、revision；跨轮次学习进度 |
| `ql_learning_checkpoint` | PK (user_id, mode, scope_id) | cursor_ref、repeat_index、elapsed_ms、revision；自动飘词、句子和闪卡的恢复位置 |
| `ql_learning_slot` | PK (user_id, mode, book_id) | active_session_id、revision；当前轮次指针，避免依赖部分唯一索引 |
| `ql_learning_session` | PK (user_id, session_id) | mode、book_id、book_content_revision、state、phase、round、current_question_id、earned_count、revision、created_at、updated_at |
| `ql_learning_question` | PK (user_id, question_id)，UNIQUE (user_id, session_id, queue_order) | session_id、item_id、word_ref、round、queue_order、status、required_correct、achieved_correct、revision；每轮每次出现是独立题目 |
| `ql_learning_answer` | PK (user_id, answer_id)，UNIQUE (user_id, question_id, attempt_no) | session_id、question_id、attempt_no、operation_id、answer_raw、is_correct、used_hint、occurred_at、local_day、timezone_offset_minutes；不可变答题事实 |
| `ql_learning_counted_item` | PK (user_id, session_id, item_id) | answer_id、local_day；同轮次单词首次计数事实 |
| `ql_learning_daily` | PK (user_id, local_day, mode) | studied_count、correct_count、wrong_count、duration_ms；可重建统计投影 |
| `ql_daily_checkin` | PK (user_id, local_day) | checked_in_at；签到事实 |
| `ql_operation_receipt` | PK (user_id, operation_id) | command_kind、command_hash、answer_id、session_id、applied_revision、result_json、created_at；小型持久回执 |
| `ql_word_enrichment_job` | PK (user_id, card_id) | spelling_identity、status、input_json、generation、attempts、next_attempt_at、last_error；资料补全可恢复任务 |
| `ql_user_content` | PK (user_id, content_kind, content_id) | revision、payload_json；尚无专用表的对话/生成课程按条存储 |
| `ql_user_ai_profile` | PK (user_id, profile_id) | revision、portable_config_json；非敏感模型配置 |
| `ql_user_ai_selection` | PK user_id | active_profile_id、active_transcription_id、revision；模型选择 |

现有 `ql_word` 和公共词书表继续作为共享内容源；existing interpretation、listening 专表保持其职责。敏感凭据继续留在独立凭据存储，不混入配置 JSON 或备份。

设置 value_json 和内容 payload_json 必须逐条校验、限长。过滤、排序、唯一约束、调度和并发判断所需字段必须是列，不放入 JSON。以上行类型不再套 settings/library/learning/content 四个大 JSON。

### 长期错词本调整

保留现有长期学习业务边界，不在本轮合并普通背诵与长期复习的算法：

- `ql_longterm_card`：只存学习身份与排程，包括 display_spelling、normalized_spelling、schedule_step、interval_days、due_at、error_count、mastered_at、position、revision 等明确列；去掉重复表示这些字段的 payload。
- 新 `ql_longterm_word_metadata`：PK (user_id, card_id)，meaning、phonetic_us、phonetic_uk、example、example_translation、translations_json、sentences_json、revision、field_sources_json。与 card 行分离，编辑资料不改变排程版本。每字段标明 dictionary/supplied/user 来源，允许用户明确清空字段。
- 长期 session/item 的状态、版本、游标和计数提升为列；大的队列不能重新塞进 session.payload。
- `ql_longterm_event` 保存业务事件，移除 command hash 和整返回快照；幂等统一进入 `ql_operation_receipt`。普通答错同时关联 answer_id，使其不再需要用户文档来解释事实。
- 在逐表实现中保留需要的查询索引，而不是删掉所有 payload 后忽略已有业务字段。

## 4. 题目身份与版本

`question_id` 是本轮某次出题的持久身份。同一单词在首轮、错题重试、后续轮次具有不同 question_id。不能只用 word_id 或队列下标检查旧请求。

题目指向稳定 item_id/word_ref；session 绑定词书内容版本。词书在答题期间被重排或删除时，旧会话必须明确返回 `CONTENT_CHANGED` 并要求刷新或重新开始。仅修改无关释义可使用独立资料版本，不必使会话失效。

答题命令使用：userId、operationId、sessionId、questionId、expectedSessionRevision、expectedQuestionRevision、answer、hint/reveal 标记和提交时区。服务器从题目解析单词并判断答案，不依赖前端传整套进度。

- profile_revision：编辑用户资料。
- setting.revision：编辑具体配置项。
- session.revision / question.revision：推进题目、反馈与轮次。
- checkpoint.revision：计时与自动播放恢复；计时不改变答题版本。
- card.revision / metadata.revision：排程与资料分别校验。
- 数据库 schema 版本、备份 formatVersion、软件版本各自独立。

答对、答错、提示后答题统一进入后端命令。前端不再“答对自己写 JSON，答错另走事务”；下一词和创建/结束轮次也使用明确命令，禁止通用 setState 覆盖学习状态。

## 5. 核心答题事务

事务前：校验长度、枚举、时区；规范化输入；生成稳定命令哈希。词语资料不是答题语义，不计入答题哈希，也不允许它的可选字段校验拒绝合法答案。发生重试时保持同一 operationId、同一原始命令。

事务内按固定顺序执行：

1. 检查 `(user_id, operation_id)` 回执。哈希相同立即返回原应用结果；不同返回 `IDEMPOTENCY_CONFLICT`。必须先于题目版本检查，否则成功后的重试会被新版本拒绝。
2. 读取所属 session、当前 question、相关词书身份。检查所有权、内容版本、当前题目、可答状态和预期版本。
3. 以 CAS 推进会话/题目；写入不可变 answer；更新跨轮次 progress。CAS 失败回滚整个事务。反馈阶段和下一题推进规则沿用产品行为，不因拆表自动改变。
4. 首次计数按 `ql_learning_counted_item` 的持久唯一标记保证。重试轮次不重复增加 studied_count；每日统计从后端事实增量更新，不由前端上传整天数组。
5. 错误时插入/更新错词 card 排程、错误次数及长期 event；并幂等登记 enrichment job。没有释义也可以创建最小卡片。现有立即可复习与 lapse 调度规则不因拆表变化。
6. 写入小型 receipt，与上述事实一起提交。任何核心写入失败均回滚。

计时单独提交 checkpoint 增量，使用 timer operationId/序号去重，以免重发重复累计。开始/暂停记录可以另存按时间片的事实；与每日 duration 聚合在同一小事务中完成。

答题写入次数仍有数次，但每次修改的内容有界，且不再读写整个用户。拆表不会消除磁盘满、驱动异常或 COMMIT 结果未知，需要分别分类处理。

### CAS 的实现约束

更新必须包含所有权与版本条件，例如：

```sql
UPDATE ql_learning_session
SET revision = revision + 1, updated_at = :now
WHERE user_id = :user_id AND session_id = :session_id
  AND revision = :expected_revision
  AND current_question_id = :question_id;
```

必须确认恰好一行成功，零行返回冲突。现有 execute 返回结果行不能假定等同 affected rows；实施前核对本地驱动接口，提供适配器 mutation-result 能力或经过验证的引擎专用检查。不能用无条件 UPDATE 再读 revision 代替 CAS 成功证明。

事务与连接只能由一个 storage worker 使用，禁止跨线程重用；事务锁覆盖完整 BEGIN 到 COMMIT，不能只锁单条 SQL。未来多连接情形还须验证相同 operationId 的唯一键竞争处理：失败请求回滚后重新查询已提交回执，不能把唯一键错误泛化为重复成功。

## 6. 小回执与界面恢复

result_json 只保存本次确定的 answerId、questionId、sessionId、appliedRevision、反馈与计数变化、可选 cardId。其上限在实施中固定，例如 8 KiB；不保存释义、全部用户状态或整个词书。

响应将 `appliedResult`（不可变、可重放）与 `currentSession`（提交后读取的最新投影）分开。重试可返回原结果和更高版本的当前会话；前端仅接受同会话、版本不低于本地的投影。不能用旧回执覆盖已经推进的界面。

提交成功后资料查询或投影生成失败时，状态为“答题已提交，显示数据待刷新”；同 operationId 重试仍返回成功回执。数据库返回 COMMIT 错误且结果不明时，恢复连接并查 operationId 决定，不能生成新 operationId 再计一次。

回执不设置自动短期 TTL；没有明确的重试最长周期和最终事实去重机制前，清理回执会破坏幂等。用户删除相关数据时按明确的隐私删除策略同步清理，禁止靠保留旧整用户快照恢复已删除内容。

## 7. 资料补全的恢复机制

任务登记随答题提交，资料读取与实际补全在提交后的小事务完成。任务可合并，同一 card 每次变更增加 generation；worker 只有在 card 身份、任务 generation 和 metadata revision 仍匹配时才能应用结果。

- 来源优先级：用户维护 > 合法输入资料 > 本地词典。用户明确清空的字段不被当成“缺失”覆盖。
- 可选输入超长或损坏只记录资料任务错误，不能撤销已保存答案。
- 查询词典在核心事务外；合并时重读最新资料，使用 CAS，冲突后重新合并。
- 持久输入经过裁剪与限长，不能在 job 中重新保存用户快照。
- 启动及后台恢复 pending/可重试任务；持久化 attempts、next_attempt_at、last_error，采用有界退避。
- 卡片被删除则删除任务和资料；任务不能重新创建已删除卡片。异步执行前后均检查身份。

这只异步处理非关键资料。答案、错词排程、学习计数和回执仍在一个核心事务内，避免引入答案已记录但排程永久缺失的问题。

## 8. 索引与跨引擎约束

除各表主键外，至少需要：session(user_id, state, updated_at)、question(user_id, session_id, status, queue_order)、answer(user_id, session_id, occurred_at)（answer 表需显式 session_id 外键列）、answer(user_id, local_day)、receipt(user_id, session_id)、job(status, next_attempt_at)、book_item(user_id, book_id, position)。错词查询保留 due、position、error_count 等现有索引。

所有关联包含 user_id，引用校验禁止跨用户。时间用毫秒整数、revision 用非负整数，scope_id 不用 NULL，以免唯一键含 NULL 的语义差异；枚举和范围在领域层与支持的数据库约束中验证。seekdb 是否支持所需 FK、CHECK、affected rows 必须实测；不能依赖未验证的约束能力。应用层在同一事务校验引用与删除依赖，SQLite 可增加已验证的外键约束。

`src/schema/*.sql` 是 seekdb 的规范 schema；`sqlite_schema.sql` 与 schema_catalog 的断言必须同步。SQLite 即使后续不作为 iOS 生产后端，只要仍被测试/备用构建使用，就必须能验证同样的存储语义。当前 iOS seekdb 集成由另一个会话推进，不能根据历史记忆假定当前生产后端永远是 SQLite。

## 9. 单文件导入导出

### 格式原则

1. 新版本备份以新 schema 的实体、身份与引用关系为准，不保留 `user.settings/library/learning/content` 大文档结构来约束新设计。备份是可移植协议，不是直接导出引擎内部表或 DDL。
2. 新版本可以导入 0.9.2 备份，通过边界转换进入同一新模型、同一校验与写入流程。
3. 0.9.2 不需要支持新备份；新版本仅导出新格式。

### 新格式路径

新格式包含 manifest（format、formatVersion、exportedAt、内容目录身份）、用户资料、配置、用户词书/覆盖、学习会话与题目、答案事实、统计、错词资料/排程/事件及可移植内容。公共词库仅保存目录版本和必要的自定义内容；不存在的词书不能仅靠静默套用下标恢复。

导出在一致性读取事务内按用户、表、主键排序流式写出，不先构建整用户内存 JSON。文件可为一个 JSON 或压缩包，物理多表不影响用户操作。大型导出会持有快照，需测量其对写入的影响，不能宣称提交后查询天然一致。

备份包括小回执及其引用，或在恢复时更换明确的存储 epoch 并使所有旧排队命令失效；首版选择导出小回执，以维持未收到回复的操作去重。pending 补全任务可从缺失资料重建；已保存的用户资料必须导出。密钥、设备路径、缓存不导出。

导入先在事务外验证文件大小、条数、枚举、唯一性、引用和内容目录，再在事务内原子替换目标用户范围的数据；目标用户 ID、session/question/card/operation 等所有引用一致重绑定，其他用户不受影响。失败保留目标原数据。不能分批发布半个用户；大文件可用 staging 表和最终事务切换，但需要独立实现与测试。

### 0.9.2 单向导入

以发布标签 `v0.9.2` 的代码定义为依据：用户备份 `format=quicklang-user-backup`、`schemaVersion=1`，包含 appVersion、exportedAt、user，以及可选 vocabulary。user 包含 profile/settings/library/learning/content/ai；vocabulary 使用 `format=quicklang-longterm`、`version=2`。appVersion 用于记录来源，结构识别与校验以实际格式标识和版本为准，不只凭软件版本字符串猜测。

导入分为 `decode -> convert -> validate -> preview -> commit`：新格式 decoder 与 0.9.2 decoder 分开，均转换为当前版本的 `ImportModel`；只有当前版本 repository 负责落库。旧 decoder 是导入边界适配，不进入日常读写链路。

| 0.9.2 数据 | 转换规则 |
| --- | --- |
| user.profile/settings/ai | 拆成用户、逐项配置、模型配置与选择，保留可移植值，不导入密钥 |
| user.library | 正式导出只有 selected-book；依靠匹配的公共词库或目标用户已有自建词书解析。旧备份不能恢复未导出的词书内容，预览必须显示缺失引用，不能虚构内容或按相似书名匹配 |
| user.learning | 转换进度、checkpoint、活动统计、签到；从可恢复会话构建新的 session/question 身份，并保留阶段、反馈、重试队列、恢复位置和鼓励计数 |
| user.content | 按记录分拆内容，对现有专表使用对应导入器，完整重绑定内部引用 |
| vocabulary | 分拆资料与排程，保留备份实际包含的 cards/sessions/sessionItems/events 及其关系，不将已有错误次数再次作为新答题累加 |

转换生成的所有 ID 在单次导入计划内稳定；预览与提交绑定文件 digest、目标用户和目标数据变更标记。没有确认的词书身份不能将 queue 下标直接当成新 word_ref。缺失目录或自建书时阻止完整恢复并说明需要的内容；任何跳过策略需明确选择，不能静默丢弃。

旧备份没有普通逐题完整答案事实与独立操作回执。转换只保存真实存在的状态与历史：已有每日统计作为历史基线，后续新答案增量独立累计，重建统计时合并基线；已计数单词由恢复会话的 counted/阶段规则转换，防止继续学习重复计数。不得伪造过去每道题的答案、时间或 operationId。旧长期 events 可转换为已有事件事实，但不假定它们覆盖普通答对历史。

为旧格式恢复创建新的命令存储 epoch，并使导入前排队请求失效；旧备份不包含的回执不能声称已恢复。恢复会话后，前端从新身份重新拉取题目并产生新命令。仅对新版本的原生备份维持其实际携带回执的恢复规则。

上线前仍须明确已有本机数据库的保全与转换操作；支持导入备份不等于授权自动迁移本机库。检测到旧存储时不能自动清库或让用户看见“空账户”。

## 10. 实施顺序与验收

1. 建立领域类型、逐表 repository、seekdb/SQLite schema 与 mutation-result/CAS 能力；在全新临时库测试，暂不改本机库。
2. 将 profile、settings、选择项、词书差异、AI 和逐条内容迁出文档，改相关调用方；保持模块各自拥有数据。
3. 将普通学习 session/question/progress/checkpoint 拆出；统一答对/答错后端提交，替换前端泛化保存和整用户版本协议。
4. 改长期卡片资料、事件与回执；实现可恢复补全；提交后投影与前端版本应用规则一起更新。
5. 实现新格式导入导出、0.9.2 单向导入转换及用户删除；移除 user_documents 运行时路径、旧快照回执与过时兼容分支，保留明确要求的 0.9.2 导入边界。

必须覆盖的场景：

- 修改语音设置/切换用户资料同时答题，答题不受无关版本影响；计时不冲突。
- 同题双提交只有一次生效；相同 operationId 重试不加计数；不同哈希复用 operationId 被拒绝。
- 先成功再下一词，再重放旧回执，界面不回退；App 在提交后丢回复、重启后可确认答案已保存。
- 各核心 SQL 与 COMMIT 注入失败，答案/进度/错词/统计/回执全部一致；结果未知时按回执确认。
- 释义查询失败、资料超长、补全与用户编辑竞争、删除后后台恢复，不影响答案且不覆盖用户内容。
- 答对、答错、提示、重试轮次、中文背诵、学习位置与鼓励计数保持现行产品语义。
- 词书重排/删除不把旧下标映射成另一词；多用户隔离与删除依赖完整。
- 单文件导出恢复全部有效状态；非法引用、缺失目录、重复键与中途失败不覆盖目标数据。
- 使用 v0.9.2 格式 fixture 覆盖设置、计时/恢复位置、签到/统计、反馈/重试会话、模型配置、内容和长期排程/事件；转换后继续答题不重复计数。缺失词书明确阻止恢复，未知版本明确拒绝，预览后文件或目标数据变化拒绝过期提交。
- 0.9.2 导入后再次导出只生成新格式，能够在新版本完整恢复；无旧格式导出与旧运行时双写路径。

先运行相关 Rust/前端测试和真实 seekdb 集成，再按实际改动运行 `make test` / `make test-db` / 必要 `make test-apple`。桌面使用 canonical `make build`（Debug）；需要发布/安装才运行 `make release`。影响 iOS 存储则运行相应 canonical iOS 构建并记录真机是否验证。保留现有 build 缓存，不并行写同一 native 输出。

记录改造前后每次答题涉及行数、JSON 编解码字节、事务时长分位数、冲突率和错误类别。仅在实测后判断性能改善；当前交付只完成源码支撑的设计。

## 11. 测试设计与交付门槛

测试随每个实现阶段交付，不能在全部改造完成后才补。以行为和数据不变量为依据，不以测试数量、SQL 字符串匹配或单一覆盖率作为完成标准。复用现有 ordinary_error、longterm、user-backup、backup-coordination 和 storage-failure 测试基础设施，并替换已经退出的整文档协议断言。

### 分层覆盖矩阵

| 层级 | 必须覆盖 | 有效证据 |
| --- | --- | --- |
| 领域单元测试 | 两种背诵模式；答对/错、提示/揭示、首轮/重试；会话结束、恢复位置、计数与调度边界 | 输入命令及前后领域状态，固定时钟；非法转移明确拒绝 |
| Repository 契约 | 所有权、唯一键、引用、CAS 零行/一行、逐项配置隔离、题目身份、删除依赖 | SQLite 与真实 seekdb 执行相同核心场景，独立 SQL 查询结果验证 |
| 核心事务集成 | 每个关键写入点失败、提交失败、提交结果未知、重复提交 | 重开连接后检查答案、计数、排程、事件、回执的一致性，不能只断言返回错误 |
| 并发集成 | 相同/不同 operationId 的同题竞争；设置/计时/答题并行；资料编辑与补全竞争 | 用 barrier/latch 控制交错，检验最终事实及冲突类型，不用 sleep 猜测时序 |
| 恢复集成 | 提交前/后终止、回复丢失、任务执行中终止、删除与恢复竞争 | 子进程与磁盘临时库，重新启动后检查去重与任务恢复 |
| 导入导出 | 新格式往返、0.9.2 转换、无效数据、预览失效、导入中途失败 | 固定 fixture、规范化内容比较、其他用户不变、失败后目标原数据不变 |
| 前端 | 不每秒落库；答题/返回保存累计时间；失败可重试；旧回执不回退；用户切换拒绝旧请求 | fake timer、可控 IPC promise 与渲染行为，核对写入次数、命令身份、显示状态 |
| 平台与端到端 | 实际学习、退出/重开、导出/恢复；对应平台存储初始化 | canonical 构建及实际启动结果，明确 macOS/iOS 和测试后端，缺失项不得写成通过 |

### 核心不变量

- 任意提交成功的 operationId 只产生一次业务效果；重试次数不改变已保存答案、错误次数和学习计数。
- 一个 question 的同一 attempt_no 只有一个答案；同一学习轮次、同一 item 首次学习只计一次。
- 答案、会话/题目转移、错词排程、当日统计和回执要么全部提交，要么全部未提交。
- 当前题目属于当前用户/会话；题目内容身份与受绑定的词书版本一致。
- 统计等于旧导入基线加新计数事实；重建投影不能丢旧基线或重复累计新答案。
- 删除后不存在关联资料、任务或包含删除内容的可重放回执；补全不得复活卡片。
- 导出与导入的新格式往返保留有效数据和关联；规范化仅忽略明确允许变化的导出时间、用户重绑定与新命令 epoch，不忽略丢失字段。

### 故障与并发用例

故障注入枚举每个核心写入步骤：会话 CAS、题目 CAS、答案 INSERT、首次计数标记、progress、daily、card、event、job、receipt、COMMIT。每次从干净 fixture 开始，失败后通过独立读取与重开数据库证明没有半提交。另测“提交实际成功但客户端收到错误”的分支，使用同一 operationId 确认成功；不得把所有 commit 错误都模拟成回滚。

同题竞争至少测试：相同 operationId/相同哈希、相同 operationId/不同哈希、不同 operationId/相同题目版本，以及第一次已经提交但回复延迟时第二次开始。实际架构为单 worker 时，在 worker 队列上控制提交顺序；若适配器支持多连接，再用真实连接检验唯一键和 CAS 竞争，不能并发复用不安全连接。

资料任务至少测试 pending 重启、执行后未确认重启、重复执行、generation 过期、metadata CAS 冲突、用户修改及明确清空、缺失词典、资料损坏/超长、卡片删除。资料失败后核心答案仍成功，任务错误可查询且可重试。

### 0.9.2 固定样本

从 `v0.9.2` 的实际 exporter 在合成用户库生成并登记 fixture 来源，不把新转换器输出反过来当旧输入。样本不包含真实用户数据或密钥；除完整样本外，覆盖 vocabulary 缺省、已有反馈、重试中、完成轮次、计时 checkpoint、内置书、目标已有自建书、缺失词书、跨用户 ID 重绑定和内容关联。

预期转换结果独立列出关键字段、计数基线和可恢复状态。导入后执行下一题和重试轮次，再导出新格式、恢复到另一干净库，确认统计没有增加两次、排程没有被重置、资料没有丢失。对无法恢复的字段在预览中明确说明并断言，不制造历史事实。

恶意/损坏输入覆盖：重复 JSON 字段和主键、跨用户引用、孤立题目/事件、不支持版本、截断文件、错误枚举、非法时间/版本、过深 JSON、超长字段、超量记录和文件大小上限。解析层检测重复字段，不能先解析到会覆盖重复键的通用 map 再声称严格拒绝。

### 计时与界面回归

内存计时沿用本分支方向：连续计时不写数据库，在实际保存动作合并累计时间。测试至少覆盖答对、答错后下一次保存、返回、暂停/隐藏、重试保存失败、开始新轮次、切书、切用户及卸载，确认计时不会错误归入其他会话，也不会因重试重复累加。异常终止前尚未落库的内存时间可能丢失，这一行为需明确保留，不能测试或宣称已持久化。

答题 IPC 测试包含按钮连点、慢响应、提交成功后投影失败、旧响应晚到、原 operationId 重试、版本冲突刷新、导入后 epoch 变化。反馈和下一词推进应与后端确认结果一致。

### 性能与完成证据

使用小用户、长历史和大内容三类合成数据集，比对修改无关内容大小前后的答题读写字节与事务耗时，验证答题路径不读取/重写整用户。记录样本数、数据规模、引擎版本和环境；不设未经基线测量的绝对毫秒门槛，也不把一次耗时作为结论。大备份测试验证流式内存规模、临时文件失败清理与快照一致性。

每个实现阶段记录测试名、命令、后端、结果和证据路径。最终门槛是：上述关键场景已有可执行测试并通过；相关测试套件与必要 canonical 构建通过；至少有真实 seekdb 的事务、CAS、去重、导入回滚和重开恢复证据。SQLite 或 mock 全绿不能替代真实 seekdb 验证。未验证平台与未完成测试必须列出，不能标记整个重构完成。


## 12. 当前实现与验收边界

实现位于从 main 创建的 `codex/user-storage-schema`，工作区为独立 managed worktree。运行时已删除整用户物理表和答题的整用户 revision 前置检查。`UserDocument` 仅为缓存、校验和备份组装的视图，不是存储单元。

### 实际物理结构

| 表 | 实际职责 |
| --- | --- |
| ql_user | 身份及整用户导入失效 token |
| ql_user_setting / ql_user_library_entry | 独立配置和选择键，各自 revision |
| ql_user_book / ql_user_book_item | 自定义书头、按位置拆开的 words / wordIds |
| ql_learning_state / ql_learning_component | 独立学习状态 header；queue、wrong、counted、needs、retry、days、legacyDays 分行，写入差异项 |
| ql_learning_answer | 普通答对和答错的不可变事实，operationId 唯一 |
| ql_operation_receipt | 普通答题小回执，上限 8 KiB，无用户快照和可失效的卡片资料 |
| ql_longterm_word_metadata | 与卡片排程分离的词语资料；用户编辑后禁止自动补全覆盖，包括明确清空 |
| ql_word_enrichment_job | 答题事务内可靠登记，提交后尝试；失败保留 attempts / last_error，重开及后续命令恢复，每次每用户最多 16 项 |
| ql_user_content / ql_user_ai | 内容按业务 key 拆分、模型配置独立保存 |

普通答题仅组装当前学习状态、相关活动、开始位置和当前词书。一次事务内保存进度、活动、答案、必要的错词排程、事件、任务及回执。正确性由后端判定。回执去重先于当前题版本检查，随后从当前库生成投影，旧重试不会恢复旧快照。前端答题与普通保存共用写入队列，在交出队列前发布已提交投影。提交失败后冻结原答案和 operationId；确认该请求前禁止学习状态保存和修改答案，仍可按原请求重试。

当前题身份采用 `(user, study_key, revision, item_id)`。revision 在状态变化时递增；删除再创建以用户当前 revision 为起点，避免旧代请求复用零版本。当前书词语变更会推进关联学习 revision。此方案替代最初目标中单独 session/question UUID 表；当前未实现独立题目表或按答案事实重建所有统计的工具。

计时在内存累计，实际保存前合并；保存失败保留待保存时间。切换学习上下文清除旧上下文内存计时，隐藏页面停止累计。异常终止前尚未落库的时间可能丢失。

### 当前备份协议

只导出 `format: quicklang-user-backup, formatVersion: 2`，包含 profile、settings/library/learning/content 键值行数组、ai、vocabulary、answers 和 receipts。所有用户维护词书随新格式导出，凭据不导出。0.9.2 `schemaVersion: 1` 仅作为导入边界；保留其真实统计和恢复位置，不构造旧普通逐题答案。旧格式未携带的词书必须在目标存在，缺失时拒绝导入。

导出在一致性事务内组装并序列化，维持现有 32 MB（32,000,000 字节）上限；当前没有实现流式大型归档。导入严格拒绝重复 JSON 字段、重复 entry/operation、孤立回执、不支持版本、无效数据和过期预览。用户状态、长期词本、答案回执及凭据清理同事务完成。独立新默认目录为 macOS/iOS `seekdb-1.4.0-relational-v3`；旧目录保留。显式指定旧数据库时，初始化拒绝原地覆盖。

0.9.2 fixture 为按 release 格式构造的合成样本，并非真实用户导出；相关旧格式恢复、反馈、重试、词书引用、内容和长期词本边界还由现有 user_backup / longterm / sqlite 套件覆盖。

### 与完整目标的差异

最初目标中的逐题 UUID 专用表、各内容记录/AI profile 完全逐行化、长期 card/session payload 去重、统一全部长期操作回执、字段级资料来源、定时退避 worker、从逐题事实重建统计、大文件流式归档与性能基线测量均未完成。不能把当前实现称为最初设计所有步骤和全部测试矩阵已经完成。当前验证针对实际实现和现有回归套件；测试证据以 `build/` 日志为准。
