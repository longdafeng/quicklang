# 长期学习 JSON 导出 v2

更新：2026-10-05。本文描述整合分支当前实现，替代原六数组 v1 说明；旧 `longterm-export-v1.schema.json` 不作为本实现的合同。

## 1. 范围与当前用户

错题本导出当前用户仍保留的长期卡片、复习会话、队列项和学习事件。owner 来自当前 profile；查询按 owner 限定，sessionItems 通过 owner 的会话限定。没有来源、tombstone、删除回执或旧卡片占位。删除后重新导出不会包含已删除单词。导出的外部文件由用户保存，数据库删除不会追溯修改这些副本。

这是长期子系统导出，区别于上游通用 portable user backup。通用备份包含普通学习、词库和设置等用户文档；长期导出不包含这些内容。P5.1 已实现从导出文件导入词形，不恢复排期或历史，不能把成功导出当作可恢复完整学习状态的证明。

## 2. 实际格式

```json
{
  "format": "quicklang-longterm",
  "version": 2,
  "cards": [],
  "sessions": [],
  "sessionItems": [],
  "events": []
}
```

字段采用当前 Rust DTO 的 camelCase。envelope 没有 exportedAt、identityAlgorithm、options 或 counts，不能依赖原 v1 的这些字段。时间值为 UTC Unix 毫秒；空值保留 JSON null。

- cards：当前 Card 投影，包含 cardId、userId、词形、排期、错误数、版本及时间。
- sessions：当前 Session 投影，移除 creationOperationId 与 creationPayloadHash；保留 userId、会话类型、状态、进度和版本。
- sessionItems：当前 Item 投影，包含 session/card 引用、冻结队列、等待与答题状态。
- events：公开 Event 投影；不读出 SQL 私有 payload_hash/result_json，也不携带普通用户文档回执。

因此导出不是匿名格式：cards/sessions 保留 userId。includeRawAnswers 默认 false；关闭时 events.answerRaw 输出 null，其他行为事实保留。当前实现先读取行 payload 再将答案置 null，不能声称答案从 SQL 查询起就未被读取，也不能声称 answerRaw 字段完全省略。开启后导出原始答案。

## 3. 一致快照与分页

`longterm_v2::export_to_writer` 在同一 owner-scoped 事务中读取四表并流式序列化。cards、sessions、events 以各自主键升序 keyset 分批，每批最多 256 条；sessionItems 先按会话 ID 分页，再按该会话的 item ID 分页，不承诺所有 item 的全局主键排序。索引 `(user_id, card_id/session_id/event_id)` 避免每批全表扫描与临时排序。

生产原生文件导出直接写入 writer，不构造完整 JSON vector。测试/内部 Action::Export 的内存路径有 32 MiB 上限，大数据必须走原生流式导出。取消在批次、行和 writer 写入阶段检查；原生文件发布前再次检查取消。快照反映其读取事务的内容，不宣称导出期间后续外部删除会改变既有快照。

## 4. 原生选择与发布

前端调用 `longterm_export_json`，提交 userId、operationId、includeRawAnswers、epoch；前端不提供路径。当前仅 macOS/iOS 原生流程实现，其他平台明确返回失败。

- macOS：NSSavePanel 选择目标文件。
- iOS：输入 JSON 文件名、UIDocumentPicker 选择文件夹；已存在同名文件时确认替换。
- 原生 lease 持有 security scope 和 NSFileCoordinator accessor，直到 Rust 写入、清理和发布结束后释放。
- Rust 在目标同目录独占创建临时文件，Unix 权限 0600；完整序列化后 flush、文件 sync_all、同目录 rename。失败/取消清理自己创建的 temp，保留原目标。
- 发布与取消通过共享 registry 锁仲裁；rename 已完成后取消不能撤销已保存文件。路径最终文件的 symlink 在写入前和 rename 前检查；原生只解析祖先别名。

当前没有基于目录 descriptor 的 O_NOFOLLOW 遍历、renameat 或目录 fsync，不宣称达到旧 v1 文档所述保证。进程被强制终止可能遗留私有 temp；文件提供者的特殊行为需要平台验收。

取消绑定 owner + operation + epoch；早于注册到达的取消最多保留 64 项、60 秒。只允许一个活动导出，完成和异步任务丢弃时清理注册。页面隐藏、owner 切换和组件卸载会取消原能力；epoch guard 拒绝已失效用户文档环境的工作。

## 5. 验证证据与未覆盖范围

P6b 已验证 Rust 发布失败/取消保留原文件、symlink 拒绝、owner 范围、两后端合同，以及隔离 macOS harness 的 NSSavePanel 保存/取消、协调 lease 和写入读回。详见 `docs/analysis/p6b-verification-2026-10-05.md`。这不是完整生产应用 UI → Tauri → Rust → 文件系统端到端验收。

20,000 卡片、1,000,000 事件 Dev/SQLite 基准导出 248,498,541 字节，15.561 秒；输出到 counting sink，未测磁盘 I/O 或峰值内存。五次查询样本只是描述性测量，不能当作 P95 保证。iOS picker 的实际文件提供者权限、保存/替换/取消和真机链路仍需验收；SDK 编译、macOS AppKit harness 或 mock 布局不能替代这些结果。

## 6. P5.1 词形导入

当前错题本提供“导入单词”：选择文件、查看目标用户和词形预览、明确确认后一次提交。支持以下三种文件内容：

- UTF-8 `.txt`：一行一个词，忽略空行及文件首 BOM，支持 CRLF。
- `.json` 长期导出：`format: "quicklang-longterm"`、`version: 2`，要求 cards、sessions、sessionItems、events 都是数组，只提取每张卡片的 displaySpelling。
- `.json` 轻量词形文件：`format: "quicklang-longterm-words"`、`version: 1`、`words: string[]`。

CSV、任意 JSON、旧版本导出和通用用户备份均不接受。文件大小及实际 UTF-8 内容均最多 32 MiB；去重前源词数为 1–10,000。每个词 trim 后非空、最多 256 个 Unicode code points；前后端都要求规范化后不超过 256 个 code points。无效非空词导致整个文件拒绝，不静默跳过。预览按 NFKC + lowercase 去重并保留首次词形，后端再次权威校验和去重。预览最多展示前 100 个词，确认仍提交全部有效词形。支持 File.arrayBuffer 的环境使用 fatal UTF-8 解码并校验原始字节；兼容 File.text 回退只能校验读取后的文本及重新编码字节，不能证明原始文件没有非法 UTF-8 字节。

目标 owner 由当前 profile 决定，文件中 userId 不构成权限。预览绑定打开文件的 owner 和用户数据 epoch；切换用户、替换用户数据或异步读取迟到时丢弃旧结果。确认前冻结每个词的 operationId/candidateId UUID，原生 worker 拒绝过期 epoch。替换发生在写入期间时，保留同步提交互斥直至旧请求结束，随后恢复选择和取消控件，不展示迟到成功信息。

导入在一个 owner 事务中执行：已有词保留全部排期、版本和事件；新词创建新 UUID、初始排期并立即到期，不向当前复习会话追加题目。批次后半部出现输入错误、身份冲突或存储失败时整批回滚。新词只写逐词 Add 事件及私有回执，不写包含其他词的批次回执，不新增 source、tombstone、operation 或导入批次表。删除词时其回执一并删除；不恢复文件中的卡片 ID、owner、排期、会话、答案或旧事件。

传输结果未知时锁住再次确认，允许刷新列表核对；不会自动重试或重新创建单词。用户明确放弃后可重新选择文件，形成新的预览与身份。实现源码与专项测试已加入 P5.1；本轮完整测试、原生构建是否通过应以最终验收日志为准，不复用 P6b/P6c 的旧数字证明新增导入功能。iOS picker 实际文件夹选择仍阻塞，词形导入实现不改变该平台验收状态。
