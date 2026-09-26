# 用户设置持久化

同声翻译、自动飘单词、单词强化、背诵复用当前用户上一次保存的设置。有效修改自动保存，无需再次确认；重新进入页面或重启应用后恢复。不同用户独立，词书起始位置还按词书区分。

## seekdb 表结构

定义：`src/schema/ql_user_settings.sql`。

```sql
CREATE TABLE IF NOT EXISTS ql_user_settings (
  user_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  setting_key VARCHAR(256) COLLATE utf8mb4_bin NOT NULL,
  setting_value JSON NOT NULL,
  PRIMARY KEY (user_id, setting_key)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;
```

| 字段            | 含义                                          |
| --------------- | --------------------------------------------- |
| `user_id`       | 当前用户 ID；无用户上下文时使用 `__default__` |
| `setting_key`   | 设置名称，可包含词书 ID                       |
| `setting_value` | JSON 值，可以是对象、数值、字符串或布尔值     |

联合主键保证每个用户的同一个设置仅有一条记录。更新使用 upsert，不覆盖其他设置。用户档案和学习进度仍由原有存储负责。

## 设置键与默认值

| setting_key             | JSON 值示例                                                                                                                 | 默认值                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `interpretation`        | `{"source":"mixed","inputLanguage":"ja","targetLanguage":"zh","recognizerId":"asr","translatorId":"chat","translate":true}` | 系统音频、英语输入、中文输出、开启翻译；模型从现有 AI 配置选择  |
| `interpretation-model`  | `"chat"`                                                                                                                    | 当前 AI 配置，用于历史记录的翻译/总结                           |
| `interpretation-target` | `"zh"`                                                                                                                      | 中文，用于历史记录的翻译/总结；选中历史会话时使用该会话目标语言 |
| `auto-count`            | `100`                                                                                                                       | 100                                                             |
| `auto-repeats`          | `1`                                                                                                                         | 1                                                               |
| `auto-gap`              | `3`                                                                                                                         | 3 秒                                                            |
| `auto-start:<bookId>`   | `1`                                                                                                                         | 1                                                               |
| `flash-count`           | `100`                                                                                                                       | 100                                                             |
| `flash-repeats`         | `1`                                                                                                                         | 1                                                               |
| `flash-gap`             | `10`                                                                                                                        | 10 秒                                                           |
| `flash-start:<bookId>`  | `1`                                                                                                                         | 已学位置的下一词，最多为词书末尾                                |
| `spell-gap`             | `3`                                                                                                                         | 3 秒；正确后自动继续，支持 0–600 秒                             |
| `spell-count`           | `100`                                                                                                                       | 100                                                             |
| `spell-start:<bookId>`  | `1`                                                                                                                         | 已背诵位置的下一词，最多为词书末尾                              |

同声翻译只保存模型配置 ID，不在此表保存 API Key。播放状态、录音状态和导航搜索等临时状态不作为设置恢复。

## 加载、迁移与故障处理

- 复用现有 `app_state_list` / `app_state_write` IPC 和串行事务队列；后端识别以上设置键，将其路由至 `ql_user_settings`。
- 首次读取时，将 `ql_app_state` 中已有的有效 JSON 设置迁移至新表；新表已有值优先。插入与旧记录删除在同一个事务中完成。
- 设置查询或迁移失败时保留旧数据，返回不含设置的快照，页面使用默认值。用户档案和进度仍正常加载。
- JSON 损坏、类型错误、数值越界、起始位置超出当前词书范围时，使用对应默认值。读取默认值不会自动覆盖数据库。
- 表单的空值、未完成输入和无效数值仅作为临时草稿，不写入数据库；保存失败触发现有存储错误提示，并回退至已提交设置。
- 数据库整体无法打开或用户档案无法读取时，仍沿用现有应用启动错误处理；默认设置不能代替数据库或用户档案。
