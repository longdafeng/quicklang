# 单词库完整性扫描与补全

扫描范围：项目内置的 17,844 条单词、全部 WebP 配图，以及 Mac 当前 seekdb 数据库和连接的 iPhone 17 Pro 数据库快照。iPhone 当前采用 seekdb；另发现的 SQLite 目录不是本次更新的活动数据库。

初始缺失：美式音标 1,054 条、英式音标 622 条；共 1,203 个词缺至少一种音标。`semiconductor` 的释义只有 `n. n.`，`slue` 的释义只有 `v. =slew`，两者没有中文。缺失记录合计 1,205 条。英文例句及中文翻译没有空字段，全部 17,844 张配图通过原有文件、格式、大小和 SHA-256 验证。

Mac 有 10 条自建词，必需学习字段均完整。iPhone 有 60 条自建词，其中 `adj.`、`adjustable`、`advent`、`AIDS`、`air-conditioning` 共 5 条缺音标；所有自建词的对应配图均存在。

补全主要使用项目 `.env.test` 中已经配置的 AI 词典编辑服务，只传送待补词的拼写、已有释义和例句。响应须通过拼写匹配、非空内容、中文字符和音标格式校验；中断进度保存在忽略的 `build/word-library-audit/`。这属于字段完整性校验，并不代表全部音标、例句语义和译文经过人工逐条审核。

19 条冷僻词、缩写或异常拼写单独处理。下列证据用于确认词条和参考发音；英美变体在来源未独立给出时可能依据发音规则推定，记录在词条 attribution。`hur` 按字母拼读；`hypertherm`、`neodoxy`、`tecnology` 的读音标为参考音标，不冒充独立词典核验结果。

- [Merriam-Webster: liman](https://www.merriam-webster.com/dictionary/liman)、[lepidopter](https://www.merriam-webster.com/dictionary/lepidopter)、[paysage](https://www.merriam-webster.com/dictionary/paysage)、[venenous](https://www.merriam-webster.com/dictionary/venenous)：将词典的读音符号转写为 IPA；部分英式变体为推定。
- [Collins: gynaecocracy](https://www.collinsdictionary.com/us/dictionary/english/gynaecocracy)、[mimetism](https://www.collinsdictionary.com/dictionary/english/mimetism)、[tellural](https://www.collinsdictionary.com/dictionary/english/tellural)、[Dictionary.com: reflet](https://www.dictionary.com/browse/reflet)：使用词典参考读音，并区分转写与方言推定。
- [Wiktionary: pernoctation](https://en.wiktionary.org/wiki/pernoctation)：提供英美 IPA；[hypertherm](https://en.wiktionary.org/wiki/hypertherm) 的医学义与当前释义对应。
- [Merriam-Webster: impayable](https://www.merriam-webster.com/dictionary/impayable) 确认英语中存在这一法语借词；[法语词条](https://en.wiktionary.org/wiki/impayable)提供原词发音。本次两栏均采用法语参考音标，并在释义中说明其性质。
- [旧版眼科学词典](https://upload.wikimedia.org/wikipedia/commons/4/40/Pocket_ophthalmic_dictionary%2C_including_pronunciation%2C_derivation_and_definition_of_the_words_used_in_optometry_and_ophthalmology%2C_%28IA_pocketophthalmic00lewi%29.pdf) 的 oxyopia 和 [Century Dictionary](https://upload.wikimedia.org/wikipedia/commons/a/a7/The_Century_dictionary_-_an_encyclopedic_lexicon_of_the_English_language-_prepared_under_the_superintendence_of_William_Dwight_Whitney_%28IA_centurydictipt1500whituoft%29.pdf) 的 paleocrystic 提供读音拼写，IPA 为转写及方言推定。
- [Wiktionary: refocillate](https://en.wiktionary.org/wiki/refocillate) 确认古词释义；本次读音属于参考转写。
- `Rusia` 和 `behavious` 保留原词书键，释义明确提示非标准拼写；参考音标对应 Russia 和 behaviours/behaviors，不将原拼写当成标准英文词。原释义保存到 original_meaning。

更新后的内置数据：中文释义、美式音标、英式音标、英文例句、中文例句翻译及对应图片均无空缺。修复词条的 version 从 1 更新为 2；素材及图片 manifest 的校验和同步更新。

用户明确选择先自行导出 Mac 和 iPhone 数据，再删除数据库重新开始。因此本次不提供旧词库修订更新或自建词迁移代码，新建数据库直接导入补全后的内置词库。当前设备数据库未被改写，也未安装更新包；清库与恢复由用户在完成导出后操作。

复查命令：

```sh
node scripts/audit-word-library.mjs
node scripts/word-images.mjs verify
node --test tests/unit/scripts/word-library.test.mjs tests/unit/scripts/word-library-audit.test.mjs tests/unit/scripts/word-images.test.mjs
```

`--repair` 可使用既有服务补全后续缺失数据；无法可靠生成的字段会保留在 unresolved.json 并阻止本次批次发布，不能靠空串或占位文本通过检查。CLI `init-word-library <seed> <database> <runtime> --audit` 可导出实际数据库的词条字段；不加 `--audit` 则执行已有的初始化导入，不覆盖旧词条。

## 最终验证

- 全量字段扫描：17,844 条，零缺项；没有空字段、常见占位文本或不含英文的英文例句。
- 图片校验：17,844 张全部通过；图片内容本身没有逐张人工审核。
- 词库与配图脚本测试：14 项通过。
- 最终 seekdb 词库测试：3 项通过，覆盖完整导入、分批启动、重复导入、缺表修复及学习状态保留。
- `make release`：macOS ARM64 Release 成功，签名及 ZIP 解包校验通过。
- `IOS_DB=SEEKDB QUICKLANG_IOS_ARCHIVE_ONLY=1 make release_ios`：iOS 真机 ARM64 Release 归档成功。
- 两个构建包中的 words.jsonl 与最终源码逐字节一致。没有安装、清库或设备导入操作；Apple UI 自动化和完整测试矩阵未运行。
