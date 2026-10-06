# QuickLang

QuickLang 是一款面向个人的英语学习应用，将单词背诵、听说训练和同声翻译放在同一个工作流中，支持 macOS 与 iPhone。

最初，因为孩子学习英语时常常磨蹭、背单词效率不高，我把自己学习单词的方法整理成了这个应用，希望让每一次练习更专注、学习成果更容易看到。

## 功能与界面

下面按应用菜单展示 **4 个功能分组、16 个二级菜单**，每个菜单都有截图和一句功能说明。截图来自当前源码的桌面界面预览；词条、学习记录及音频历史使用演示数据，不包含个人资料，浏览器截图不代表原生录音、识别或翻译服务的运行验收。所有截图统一使用 1440 × 1100 的应用窗口，导航栏与右侧主区域保持同高；长内容在对应区域内滚动。点击图片可查看原图。

### 单词背诵

#### 选书

按学习目标选择内置或自建词书，分别保存各词书的学习进度。

[![单词背诵 · 选书](docs/images/menus/books.png)](docs/images/menus/books.png)

#### 自动飘单词

按设定的数量、朗读次数和间隔自动展示单词、释义及例句。

[![单词背诵 · 自动飘单词](docs/images/menus/auto.png)](docs/images/menus/auto.png)

#### 强化学习

通过朗读、停顿回忆和词义展示加深单词记忆。

[![单词背诵 · 强化学习](docs/images/menus/flash.png)](docs/images/menus/flash.png)

#### 背诵

听发音输入单词并检查拼写，拼错的单词自动加入生词表。

[![单词背诵 · 背诵](docs/images/menus/spell.png)](docs/images/menus/spell.png)

#### 中文背诵

看图片和中文释义朗读英文单词，用语音识别检验记忆。

[![单词背诵 · 中文背诵](docs/images/menus/chinese-spell.png)](docs/images/menus/chinese-spell.png)

#### 复习

按生词表到期排期完成正式复习，并查看正确率、掌握量和错误统计。

[![单词背诵 · 复习](docs/images/menus/longterm.png)](docs/images/menus/longterm.png)

#### 生词表

管理跨词书的生词、导入导出词条，并选择单词提前练习。

[![单词背诵 · 生词表](docs/images/menus/longterm-notebook.png)](docs/images/menus/longterm-notebook.png)

#### 学习进度

查看背诵、中文背诵与今日复习的每日合计，以及生词表掌握量和各词书累计进度。

[![单词背诵 · 学习进度](docs/images/menus/progress.png)](docs/images/menus/progress.png)

### 听说训练

#### 飘例句

按设定节奏自动展示并朗读双语例句，练习句子听读。

[![听说训练 · 飘例句](docs/images/menus/sentence-auto.png)](docs/images/menus/sentence-auto.png)

#### 听说练习

围绕练习材料完成听写、理解题、录音跟读和脱稿表达。

[![听说训练 · 听说练习](docs/images/menus/conversation.png)](docs/images/menus/conversation.png)

#### 听力训练

导入音频与字幕，通过精听、跟读、盲听和复述训练听力。

[![听说训练 · 听力训练](docs/images/menus/listening.png)](docs/images/menus/listening.png)

#### AI 陪练

用文字或语音回答场景问题，获取表达反馈并继续回答追问。

[![听说训练 · AI 陪练](docs/images/menus/ai-coach.png)](docs/images/menus/ai-coach.png)

### 同声翻译

#### 启动

采集音频生成英文实时字幕，并按配置显示翻译和保存录音。

[![同声翻译 · 启动](docs/images/menus/interpretation-start.png)](docs/images/menus/interpretation-start.png)

#### 历史记录

查看历史字幕与译文、回放录音，并进行转写、全文翻译或摘要分析。

[![同声翻译 · 历史记录](docs/images/menus/interpretation-history.png)](docs/images/menus/interpretation-history.png)

### 工具

#### 查询

检索单词并查看释义、音标和例句。

[![工具 · 查询](docs/images/menus/search.png)](docs/images/menus/search.png)

#### 词库维护

创建和编辑词书，在指定位置插入、编辑或删除单词及其资料。

[![工具 · 词库维护](docs/images/menus/maintenance.png)](docs/images/menus/maintenance.png)

## 开始使用

1. 在“设置 → 用户设置”中创建或选择用户，再在“单词背诵 → 选书”中选择词书。
2. 用自动飘单词或强化学习熟悉单词，再通过背诵、中文背诵检查记忆。
3. 拼写错词会加入生词表；在“复习”中完成到期练习，或在生词表中选择单词提前练习。
4. 使用 AI 陪练、远程转写或翻译前，在“设置 → 系统设置”配置相应模型与服务。

内置 14 本词书，包含初中、高中、四级、六级和考研词汇，并提供中文释义和双语例句；基础词书学习可以离线使用。AI 服务需要相应配置和网络，音频采集、录音和设备端识别还需要系统权限。

今日学习合计由背诵、中文背诵和正式复习组成，正式复习同一天同一单词只计一次；提前练习不计入该正式复习指标。总进度中的“复习”显示已掌握词数／生词表总词数，强化学习单独累计。

### 获取应用

[直接下载 QuickLang 0.9.2 ZIP](https://github.com/longdafeng/quicklang/releases/download/v0.9.2/QuickLang-0.9.2-macos-arm64.zip)。用户只需下载这一个 ZIP，校验文件可按需下载。

访问 [GitHub Releases](https://github.com/longdafeng/quicklang/releases)，以实际发布的安装包和平台说明为准。macOS 安装包解压后，将 `QuickLang.app` 放入应用程序目录；未经过 Apple 公证的开发包可能需要在系统隐私与安全设置中允许打开。

iPhone 的源码构建、签名和安装步骤见 [iOS 开发指南](scripts/ios-README.md)。当前学习记录保存在设备本地，尚未提供自动跨设备同步。

### 用户设置与数据

“设置”还提供用户管理、系统配置和关于页面。不同用户分别保存学习记录；用户设置中的 JSON 备份包含用户设置、学习进度、大模型配置和完整生词表导出内容，不导出或替换普通词书内容；保留选书状态，学习进度恢复到当前已有或内置词书。完整生词表 JSON 导入会恢复词条顺序、排期、掌握状态、复习历史和会话；TXT 或单词列表导入只合并单词；生词表页面仍可单独导入、导出。

API Key、音频文件、录音和设备权限不包含在普通用户 JSON 备份中。导入前会预览并确认替换当前用户，其他用户不受影响；音频文件需要另行保存。只使用当前支持的备份结构，具体内容以导出和导入预览为准。

## 从源码运行

项目采用 **Tauri 2、React / TypeScript、Rust**；macOS 使用 seekdb，iOS 使用 SQLite。当前源码版本为 **0.8.0**，macOS 包的最低系统版本按当前配置为 **27.0**，iOS 包配置为 **18.0**；各系统语音和采集能力还受设备及系统 API 支持限制。

准备 Node.js 22.12 或更高版本、Apple Command Line Tools，以及构建 iOS 所需的完整 Xcode。初始化脚本按项目锁定版本准备 Rust、npm 和原生数据库依赖；详情见 [初始化与任务说明](scripts/README.md)。

```sh
git clone https://github.com/longdafeng/quicklang_my.git
cd quicklang_my
make init
make build
```

仅预览前端界面：

```sh
npm run dev
```

浏览器预览默认地址为 `http://127.0.0.1:1420`，不替代桌面和手机原生存储、录音、识别及分享功能。

### 常用命令

| 命令                                  | 用途                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `make test`                           | 检查格式并运行本地测试；真实 AI 模型测试需要测试配置。 |
| `make test-db`                        | 运行真实数据库持久化、并发和回滚测试。                 |
| `make review`                         | 执行 Rust Clippy、类型检查和代码边界检查。             |
| `make format` / `make format-check`   | 格式化源码／检查源码格式。                             |
| `make build` / `make release`         | 构建 macOS Debug／Release 应用。                       |
| `make build_ios` / `make release_ios` | 构建 iOS Debug／Release 应用。                         |
| `IOS_TARGET=simulator make build_ios` | 构建无签名的 iOS 模拟器 Debug 应用。                   |
| `make install` / `make install_ios`   | 使用 Release 流程安装对应平台应用。                    |
| `make test-apple`                     | 执行 Apple 平台相关验证。                              |
| `make docs` / `make docs-build`       | 启动文档站／构建静态文档站。                           |

真实 AI 模型测试使用 `.env.test`：从 `.env.test.example` 复制后填写测试配置，再执行 `npm run test:ai`。该文件被 Git 忽略，请勿提交密钥。

开发时可用 `QUICKLANG_DATA_DIR=/absolute/path` 指定独立数据库目录，并在初始化及运行时保持一致；不要让两个原生进程同时占用同一个数据库目录。

### 项目结构

| 目录                  | 职责                                     |
| --------------------- | ---------------------------------------- |
| `src/ui/src/desktop/` | macOS 界面、导航和同声翻译视图。         |
| `src/ui/src/ios/`     | iPhone 界面、导航和同声翻译视图。        |
| `src/ui/src/shared/`  | 公共学习功能、用户设置、历史及原生通信。 |
| `src/app/`            | macOS / iOS 共用的 Tauri 原生宿主。      |
| `src/crates/`         | 领域模型、复习排期、用例和数据库适配器。 |
| `src/server/`         | 独立 HTTP 服务骨架。                     |
| `tests/`              | UI、Rust、脚本和原生集成测试。           |
| `docs/`               | 产品设计、开发说明、验证记录和界面截图。 |

正式复习与生词表通过原生事务保存卡片、排期和作答记录，普通学习页面也通过原生应用状态接口保存进度。录音二进制独立存储，具体机制见 [模块说明](docs/architecture/modules.md)。

## 更多文档与许可

- [文档首页](docs/index.md)
- [产品与技术设计](docs/quicklang-product-technical-design-v1.md)
- [词库数据结构](docs/development/0.1/word-library-schema.md)
- [听力训练说明](docs/development/0.1/listening.md)
- [原生数据库依赖](deps/seekdb/README.md)

QuickLang 自有代码采用 [Apache-2.0](LICENSE) 许可证；Ink-Learner 词库单独遵循 CC BY-SA 4.0，详见 [词库署名说明](src/ui/public/content/word-library/ATTRIBUTION.md)。
