# 单词库：两张表

采用用户确认的简单模型：一个英文 spelling 对应一条完整单词记录，一本书保存一个
按学习顺序排列的 spelling 数组。单词的固定信息使用普通列，仅额外例句使用 JSON 数组。
无需释义表、例句表、来源表或词书关联表。

状态：已接入 `make init`，生成数据并在真实 seekdb 验证完整导入。应用启动会应用缺失迁移，
但前端词书读取暂未切换到数据库，学习记录的旧 ID 也尚未改为拼写主键。
正式 DDL：`src/migrations/embedded/V0003__word_library.sql`。
seekdb 支持 `VARCHAR(256)[]`，不支持 `TEXT[]` 和数组默认值。

## 初始化与生成数据

```sh
make init
# 隔离数据库（make dev 使用同一变量即可连接）
QUICKLANG_DATA_DIR=/absolute/path/to/database make init
```

默认路径与 macOS Tauri 一致：`~/Library/Application Support/io.github.longdafeng.quicklang/seekdb-1.4.0/`。
当前嵌入式运行时仅支持 macOS ARM64。已运行的应用持有数据库锁时，初始化报 DB_LOCKED；
退出应用后重试，不会绕过锁或删除数据库。

`generate-word-library.mjs` 从仓库内已带释义和例句的 11 本词书生成 `build/content/word-library/`：

- `words.jsonl`：17,844 行，每行字段直接对应 ql_word 普通列及 extra_examples。
- `wordbooks.jsonl`：11 行，每行仅 id、title、words（导入后为原生 ARRAY）。
- `legacy-map.jsonl`：49,436 个原始位置、旧 ID、章节和新拼写/位置映射。
- `merge-conflicts.jsonl`：单值音标等字段的冲突清单；变体同时保留在 attribution。
- `manifest.json`：数据计数、输入/输出 SHA-256；另附上游清单、许可与署名文件。

最终有 49,425 个词书成员：同一本书内因纠错或规范化产生的重复拼写保留首次位置。
合并保留所有释义及句对，默认例句优先使用上游句子，剩余句子放 extra_examples。
未知源时间记 0，生成结果不依赖当前时间。生成文件的 JSONL 是交换格式，不改变数据库列类型。
`make init` 不依赖未纳入仓库的上游 checkout；更新上游内容使用 `make content`。

导入器在打开数据库前校验清单哈希、列类型、长度、中文释义/句对非空、重复键及引用。
迁移使用既有文件锁和版本校验，支持已有 V0002 数据库升级。数据导入采用单个事务、每批 100 词。
同 spelling/id 已存在时保留整条记录（即使 user_modified=false），不覆盖自定义内容或词书顺序。
它是初始化补缺流程，不是内容包覆盖升级功能。事务失败回滚本次全部数据写入，建表 DDL 可留存并重试。

## 单词表 ql_word

| 字段 | 类型 | 说明 |
|---|---|---|
| spelling | VARCHAR(256) COLLATE utf8mb4_bin，主键 | 英文拼写或短语，如 abruptly、bring about |
| language | VARCHAR(16) | 默认 en |
| meaning | TEXT，必填 | 完整中文释义；多个义项分行存储，保留词性文本 |
| phonetic_us / phonetic_uk | VARCHAR(256) | 美式、英式音标 |
| example / example_translation | TEXT | 默认英文例句及中文翻译，必须同时存在或同时为空 |
| example_source / example_license | VARCHAR(256) / VARCHAR(64) | 默认例句来源、许可 |
| example_generated | BOOLEAN | 默认例句是否由 AI 补充，默认 false |
| extra_examples | JSON 数组，可空 | 除默认例句之外的其他句对及来源 |
| definition_source | VARCHAR(256) | 释义来源 |
| source_url / source_revision | TEXT / VARCHAR(128) | 来源地址、修订号 |
| license_spdx / attribution | VARCHAR(64) / LONGTEXT | 许可标识、署名与补充来源说明 |
| original_spelling / original_meaning | VARCHAR(256) / TEXT | 纠错前的拼写、释义 |
| user_modified | BOOLEAN | 是否经用户编辑，默认 false |
| version | BIGINT | 内容版本，更新时递增，防止覆盖并发修改 |
| created_at / updated_at | BIGINT | UTC Unix 毫秒 |

普通学习界面直接读取 `meaning`、音标、`example` 和 `example_translation`，不需要解析 JSON。
`meaning` 是完整释义文本，不再同时维护 translations 数组；导入时保留每个义项的原始文本，
以换行连接。它不承诺恢复原数组边界，也不需要从中重新解析结构化词性。

下面用 JSON 展示一条数据库记录，仅 `extra_examples` 列本身是 JSON 类型；时间等字段省略：

```json
{
  "spelling": "abruptly",
  "language": "en",
  "meaning": "adv. 突然地",
  "phonetic_us": "/əˈbrʌptli/",
  "phonetic_uk": "/əˈbrʌptli/",
  "example": "The road ends abruptly.",
  "example_translation": "道路突然到头了。",
  "example_source": "quicklang-ai-authored",
  "example_license": "CC-BY-SA-4.0",
  "example_generated": true,
  "extra_examples": null,
  "user_modified": false,
  "version": 1
}
```

例句只是字段结构示例。只有一个例句时 `extra_examples` 存 NULL；有更多例句时存：

```json
[
  {
    "textEn": "She stopped abruptly.",
    "textZh": "她突然停了下来。",
    "source": "quicklang-ai-authored",
    "license": "CC-BY-SA-4.0",
    "generated": true
  }
]
```

额外例句数量不固定，保留一个 JSON 列可以同时满足两张表和不丢弃已有例句的要求。
默认例句只放在普通列中，不在该数组重复。服务层验证每个额外例句的中英文、来源和许可；
数据库 CHECK 只验证外层是数组。默认例句的 CHECK 允许双空，以便补齐流程暂存缺例句的记录；
发布离线词库前仍须检查中文释义、英文例句和中文翻译均为非空文本。

来源许可不统一时，在 attribution 保留各义项的来源、署名及许可说明，例句单独记录许可。
用户自有内容不能自动赋予 CC 许可。来源包的完整清单、哈希和旧 ID 映射保留在导入归档中。
更新普通字段可以直接执行 SQL，无需重写整个内容 JSON；多个关联字段在同一事务内更新。

## 词书表 wordbook

仅保留三个字段，不建立关联表，也不需要 position。

```sql
CREATE TABLE wordbook (
  id VARCHAR(128) COLLATE utf8mb4_bin PRIMARY KEY,
  title VARCHAR(256) NOT NULL,
  words VARCHAR(256)[] NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

`words` 是原生字符串数组；`SHOW CREATE TABLE` 将其显示为 `ARRAY(VARCHAR(256))`。
256 是每个拼写的字符长度上限，不是一本书的单词数量上限，与 ql_word.spelling 一致。
当前 seekdb 不允许此列声明默认值，创建空书时必须显式传入空数组。
数组的文本输入输出形似 JSON，并不意味着底层列是 JSON 类型。

```sql
INSERT INTO wordbook (id, title, words)
VALUES ('empty', '空词书', '[]');

INSERT INTO wordbook (id, title, words)
VALUES ('ink-cet4', '大学英语四级', '["abruptly","abandon","practice"]');
```

以上仅为固定值示例，实际写入必须经安全参数传递/数据访问层完成，不能拼接用户输入。
应用验证数组元素存在于单词表，禁止 NULL、空拼写及重复拼写，保留大小写和顺序。
三字段词书不存章节、书级来源等元数据；现有章节和署名保留在词库包/迁移归档。

## 读取与修改

原生 ARRAY 的默认文本输出不会可靠地转义引号/反斜杠，不能直接当作 JSON 解析。
导入器使用 `array_to_string` 配合 U+001F 分隔符读取成员并验证顺序；单词主键禁止控制字符，
因此该分隔符不会出现在有效拼写中。空数组独立处理，NULL 元素会在校验时被拒绝。
SQL 字符串通过 UTF-8 十六进制字面量传递，不拼接原始用户文本。

词书输入先进行数组文本编码，再以安全字面量写入原生 ARRAY。实际测试覆盖引号、反斜杠及中文。
本次没有接入学习界面的读取，也不声称数组中间插入是常数时间操作。

## 主键与更新规则

- 当前只存英文词库，spelling 就是主键，不再另造内容 ID。
- 保存时统一 NFKC 并去掉首尾空白。保留大小写、内部空格及连字符，使用 `COLLATE utf8mb4_bin`，
  避免把 US 和 us 等可能不同的词错误合并。新建词条时可提示大小写近似项供选择。
- 普通内容更新不改 spelling，所有书立即共享更新。使用 version 作乐观锁。
- 改名/拼写纠错需在同一事务中创建新键、更新所有词书数组以及学习记录引用、再删除旧键。
  目标键已存在时需先合并内容，不能覆盖。保留旧 spelling/ID 映射供进度迁移。
- 从一本书移除一个词，只修改该书数组；不删除共享单词。
- 删除共享词前检查所有书和学习记录的引用。ARRAY 中的字符串引用不能逐元素用普通外键保护，
  这些检查必须在应用服务层实现。所有书目写入、改名、删除需经统一写入服务串行协调，
  再配合事务；词书读取后修改需持有 `SELECT ... FOR UPDATE` 行锁，避免“检查后又被引用”的竞争。
- 书内重复 spelling 默认拒绝；导入历史重复项时明确去重并迁移旧位置映射。后续若需要
  有意重复练习可放宽此规则，数组本身能够表达重复。

## 当前数据迁移

已有 JSON 中同一 spelling 可能来自多个历史 ID。导入时按上述 spelling 规则聚合，
合并、去重释义与例句，保留来源，并将旧 ID 映射保存为迁移归档。当前纠错数据存在不同 ID 同拼写的记录，
不能简单采用“最后一条覆盖前一条”。合并时默认例句采用固定优先级：既有人工/上游例句，
再取 AI 补充例句；其余例句仍保留。有冲突的音标或释义保留原始来源并报告。

先建立 old ID → spelling 映射，再转换每本书的数组。若书内去重，保留首次出现顺序，并将章节信息保留在迁移归档，
并生成旧序号 → 新序号映射。生词表、正在进行的学习会话、已学位置和原生 card_id 引用
须一起迁移，不能仅更换词库而留下旧引用。自建词书的局部 ID 需要连同 book_id 一起映射。

先完成内存校验，再在事务中写入单词和词书；校验引用、数量与例句完整度后提交。
用户修改过的内容以 user_modified 标记，后续数据包更新必须保护它。
初始化导入器已经实现；现有学习会话、card_id 的正式迁移以及前端切换仍是后续工作。
旧 ID 映射现在仅保存为归档，不修改已有学习进度。

## 验证

`make test-db` 先生成种子，再验证真实 seekdb：完整导入、从 V0002 升级、关闭重开、重复导入、
用户释义/词书顺序及学习记录保留、错误时全事务回滚、带引号/反斜杠/中文的拼写读写。
脚本测试覆盖大小写保留、NFKC 合并、书内去重和旧位置映射、例句合并及缺失内容拒绝。
测试数据库独立保存在 build/test-databases 下，不改用户数据库。
