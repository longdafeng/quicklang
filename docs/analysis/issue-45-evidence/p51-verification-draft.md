# P5.1 长期错题本单词导入验证

日期：2026-10-05（北京时间）。工作树：`/Users/longda/.codex/worktrees/longterm-integration/quicklang`；分支：`codex/issue-45-review-notebook`。

本文为待主 agent 补充最终构建与解析器修复复验的草案。测试时基线 HEAD 为 `1db29d1e`，本轮 P5.1 改动尚未提交；不能将基线提交描述为包含本次导入实现。

## 实现与用户数据语义

错题本提供文件选择、预览与明确确认步骤。TXT 按非空行导入；JSON 支持 `quicklang-longterm-words` v1 词形列表，以及 `quicklang-longterm` v2 四数组导出。后者只提取卡片的 `displaySpelling`，丢弃源用户、卡片 ID、复习排期、队列、统计、事件和原始答案。完整用户备份及不支持的格式/版本拒绝导入。

文件上限 32 MiB；单批原始非空词条上限 10,000，包含重复项。词形沿用 NFKC + 小写规范，保留首次显示拼写；后端检查原词与规范化词均为非空且不超过 256 个 Unicode code points。前端预览的规范化长度检查正在补齐，最终验收需加入下述修复复验。

导入目标为预览时的当前用户，确认时固定该用户和 app-state epoch。换用户会卸载旧工作区；数据替换会撤销旧预览。过时的 native 命令在 worker 执行前被 epoch guard 拒绝；旧异步结果不能刷新替换用户或替换数据。进行中写入保留互斥直到结算，数据替换不会释放一个尚未完成的提交。结果不确定时不自动重试；用户可只读刷新列表核对，再明确放弃并重新选择文件。

后端 `Action::Import { entries }` 在现有单一数据库事务内执行。每条包含固定的 `operationId`、`candidateId`、`spelling`。新词生成初始排期、零错误数的卡片和单词级 Add event/receipt；已有词保持卡片、排期、统计、事件逐字不变。同批规范化重复项仍先检查格式和身份冲突，再计为重复。复提同 entries 返回本次效果：新增 0、已有词数；不重复写 event。

normalized spelling 去重按 owner；candidate/event 身份占用检查按全局主键，跨用户或错误载荷复用均 fail closed。后半条目失败会回滚前面已插入的卡片及事件。单词级 receipt hash 不包含整个 batch，避免二次复杂度和删除一个词后由另一个词的复合 receipt 泄漏旧信息。

删除沿用物理删除：移除该词卡片、事件和有关复习轮次，不新增来源、tombstone、批次、删除记录或历史恢复能力。重新选择文件导入是一次新显式创建，UI 生成新 UUID；没有删除历史来识别曾被删除的身份。导入不重放旧学习历史，也不将源用户数据恢复到当前用户。

## 实际验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| SQLite 导入合同 | 6 / 6 通过，0 失败；测试体 0.03 秒、编译 3.54 秒 | `build/p51-import-sqlite-contracts.log` |
| SQLite 私有 receipt 删除测试 | 1 / 1 通过；测试体 0.01 秒、编译 4.01 秒 | `build/p51-import-receipts.log` |
| 真实 seekdb 导入合同 | 6 / 6 通过，0 失败、0 跳过；完整命令 13.133 秒 | `build/p51-native-import-contracts.log` |
| 真实 seekdb 私有 receipt 删除测试 | 1 / 1 通过，0 失败；完整命令 5.219 秒 | `build/p51-native-import-receipts.log` |
| canonical `make test` | exit 0；格式、compliance、严格 Clippy、Rust workspace、TypeScript、UI 97 文件 / 977 项全通过；脚本 174 通过 / 1 跳过；完整命令 75.143 秒 | `build/p51-make-test.log` |
| 独立 UI 修复复验 | 同用户 pending write 遭遇 epoch 替换回归包含在 8 / 8 UI 测试中；独立执行与完整 suite 均通过 | `build/p51-import-independent-ui-review.log`、`build/p51-make-test.log` |
| iOS 设备架构 check | `aarch64-apple-ios` dev / debuginfo=1 库检查 exit 0；Cargo 16.77 秒，仍有 34 条平台警告 | `build/p51-ios-device-check.log` |
| 原生桌面与 simulator canonical build | 待主 agent 补充本轮结果；之前 P6c 构建不能代替 P5.1 新源码构建 | 待补充 |
| parser normalized-length 修复复验 | 待主 agent 补充；完整 suite 的 977 项数字是修复前快照 | 待补充 |

六个合同覆盖：新词/已有复习排期与事件不变、NFKC 重复、同请求幂等、删除及新身份重加、后半 receipt 冲突原子回滚、owner 隔离/全局 ID 冲突、重复词不掩盖无效身份、条数与 normalized 扩展长度拒绝。额外单测直接读取私有 `result_json`，证明删除 apple 后 banana 的 retained receipt 不包含 apple，也不存在 batch receipt。SQLite 与真实 seekdb 执行同一合同文件；真实 seekdb 是实际 native driver，不是以 SQLite 代称。

`make test` 的 native Cargo 阶段全部串行，统一项目本地 toolchain/cache 与 macOS runner；没有清理缓存、并行写同一构建输出、临时签名修改、盲目重试或测试失败。live chat/transcription 因 `.env.test` 未配置跳过，不能声明远端模型验收通过。设备架构 check 只证明库可以按设备架构检查，不证明设备打包、安装或实机操作完成。

## 三角色交叉检查与修复

三个实现者分别承担 storage、parser、UI，并对其他实现者的源码交叉只读复核。storage 实现者另持有 desktop Cargo 独占权，实际执行真实数据库和完整 suite；UI 实现者独立执行 iOS 架构 check，使用不同输出目录；parser 实现者独立执行 UI 回归。

已发现并修复的 pending-write 问题：旧代码使用 ref 控制 cancel 的 disabled 状态，epoch 替换后旧 write 结算没有 state 更新，按钮可能保持错误的禁用显示。新代码以 React `submitting` 状态驱动全部控制项，同时保留 ref 同步互斥；epoch 替换不允许第二次写入，旧结果不会回显，旧请求结束后按钮恢复。八个 UI 测试和完整 suite 通过。

待最终复验的 parser 边界问题：`"ﬃ".repeat(100)` 原长 100，规范化后长 300，之前可通过预览而被后端整批拒绝。后端已有合同验证其原子回滚；parser agent 正在加入 normalized length 检查与回归。修复前 UI 显示结果不确定，不存在部分存储更新，但不符合有效预览的边界要求。最终报告需用具体复验结果替换“正在修复”。

严格 UTF-8 是生产 `File.arrayBuffer()` + fatal TextDecoder 路径的保障。旧 `File.text()` fallback 无法检查已被替换解码的原始字节；该兼容路径不应被描述为严格 UTF-8 验证。若 parser 修复调整 fallback，主 agent 应更新这里的限制。

交叉审查证据：`build/p51-import-review.md`、`build/p51-peer-review-ui.md`、`build/p51-peer-review-storage.md`。这些报告中的历史 finding 必须结合修复复验段落读取，不能把已修复 UI 问题当作仍未解决。

## 阶段时间（北京时间）

| 阶段 | 开始 | 结束 | 耗时 |
| --- | --- | --- | ---: |
| 真实 seekdb 导入合同 | 20:12:01.739 | 20:12:14.872 | 13.133 秒 |
| 真实 seekdb receipt 删除 | 20:12:28.683 | 20:12:33.902 | 5.219 秒 |
| canonical `make test` | 20:12:48.936 | 20:14:04.080 | 75.143 秒 |

机器可读真实起止时间见 `build/p51-stage-timings.json`。三个阶段间隔包括只读交叉审查；各阶段耗时是完整命令 wall-clock，不是纯测试执行时长。SQLite 日志仅提供 compiler/test 内部时长，未为其补造观测起止或完整 wall-clock。没有获取或记录子任务 token 消耗。

## 验收限制

本轮后端事务、owner 隔离、幂等、删除隐私有两种真实数据库合同证据；文件解析与 UI 协调有实际 unit/integration suite 证据。尚未执行 production App 完整文件选择 → 确认 → native 导入 → 用户切换的端到端点击流程，32 MiB/10,000 全新词的 native 延迟和峰值内存未测。源码使用 hash sets 和逐词固定大小命令 hash，证明避免 quadratic batch hashing，但不能据此声称大量导入性能达标。既有词仍有多个 indexed identity/read 检查；10,000 新词约 70,000 SQL execute calls 的常数成本未基准测量。

此前 P6c 的 iOS 文件夹选择器点击验收仍被缺少 Simulator UI 阻塞，本轮导入是浏览器文件 input，不自动等于该导出 picker 阻塞已解决。没有执行 Release、生产安装、Git push 或 main 合并。

## Final normalized fix and UI verification update

The normalized-length fix is complete and independently reviewed. The parser checks NFKC/lowercase code-point count before deduplication. The new regression validates TXT/JSON rejection and exact 256/257 expanded boundaries. Complete final UI execution passed 97 files / 978 tests. Command wall-clock was 16.064 seconds, from 2026-10-05 20:16:03.704 CST to 20:16:19.768 CST. Evidence: `build/p51-final-ui.log`, `build/p51-final-ui-timings.json`. Earlier pending-fix wording and 977-test suite snapshot above are historical; this update resolves the parser finding. Native canonical build results remain for root to add.
