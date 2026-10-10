# 用户存储重构验收记录

2026-10-07，独立工作区 `codex/user-storage-schema`，基于 main 的 `bf0d4c1344b32eb7fe3fd2f159a171ea73dc5441`。以下命令全部成功退出，最终验证期间未继续修改运行时代码。

| 命令 | 结果 | 本地证据 |
| --- | --- | --- |
| `DOCS_TEST_URL=http://127.0.0.1:5178 make test` | 前端 104 个文件、1082 项测试；脚本 196 项、零跳过；Rust workspace、格式、Clippy、许可证检查通过；已配置的在线聊天及转写测试通过 | `build/full-test.log` |
| `make test-db` | 真实 seekdb 核心 64 项、应用存储 7 项、AI 配置 4 项、语音持久化及跨进程重开测试通过；持久化和表结构集成通过 | `build/database-test.log` |
| `DOCS_TEST_URL=http://127.0.0.1:5178 make test-apple` | macOS Debug canonical 构建、回归套件、SQLite 125 项、Swift/ObjC 原生回归、iOS 模拟器 Debug canonical 构建、iOS device Cargo check、3 项 bundle 测试通过 | `build/apple-test.log` |
| `make test-ios-smoke` | 已启动 iPhone 18 Pro / iOS 27 模拟器：提示音、后台语音、PCM 输出、26 字母拼读、原生朗读推进、文件分享通过 | `build/ios-smoke.log` |

额外前端类型检查、文档服务实际访问检查和暂存差异空白检查通过。构建输出与日志保留在工作区 `build/`，未清理缓存。iOS device Cargo check 有 34 条现有平台警告，编译检查成功；不能据此声称全部平台零警告。

## 已验证的关键行为

- 无关设置不使当前答题失效；学习状态删除再创建及词书内容变化使旧题请求失效。
- 普通答对、答错均产生可去重的答案事实；同一 operationId 重试不重复计数，非法或不可导出的 ID 在写入前拒绝。
- SQLite 核心写入故障和提交故障完整回滚；重开后可以使用原 operationId 重试。真实 seekdb 验证事务、CAS、去重和恢复行为。
- 词语资料失败不回滚已保存答案；任务重开可恢复；用户编辑及明确清空的资料不被自动补全或读取投影覆盖。
- 新格式往返保留答案和小回执；0.9.2 合成格式样本可导入；重复 JSON 字段、孤立回执、缺失词书及过期预览拒绝覆盖目标。
- 前端命令串行发布已提交投影；未知结果保留原请求进行确认；连续计时不写库，实际保存时合并时间。

## 验收边界

本次交付为当前实际存储和事务重构，不代表初始完整设计的所有阶段完成。实际表结构、协议及未完成项见 `user-storage-relational-redesign.md` 第 12 节；独立题目 UUID 表、统计重建、完全逐记录拆分、定时退避任务、大备份流式处理及性能基线仍未实现。

0.9.2 fixture 按 release 格式构造，未使用真实用户备份，也未由旧版 exporter 实际生成。尚未运行实体 iPhone 的应用学习/备份端到端验收；仅完成 device 编译检查与模拟器原生冒烟。未构建 Release、未安装正常应用、未修改用户已有数据库。内存中尚未保存的计时在异常退出时可能丢失。
