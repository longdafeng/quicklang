# QuickLang

QuickLang 是一款面向个人的英语学习应用，将单词背诵、听说训练和同声翻译放在同一个工作流中，支持 macOS 与 iPhone。

最初，因为孩子学习英语时常常磨蹭、背单词效率不高，我把自己学习单词的方法整理成了这个应用，希望让每一次练习更专注、学习成果更容易看到。

## 功能与界面

按当前 macOS 界面的 **4 个功能分组、16 个二级菜单** 展示（2026-10-10 更新；设置不展示截图）。每个一级菜单对应一个章节，二级菜单作为截图图注，每行最多展示三张。

学习进度、查询、单词练习和飘例句截图来自本机 macOS 应用，其余截图来自当前源码的 macOS 界面预览，使用展示数据。学习进度展示本机真实学习记录；单词与例句以熟悉的名词 family（家庭／家族）为例。图片显示宽度为 400 像素，高度按原图比例缩放；窄屏会进一步缩放，点击可查看原图。长内容在界面内部滚动。截图仅展示界面，不代表原生录音、识别或翻译服务的运行验收。

### 单词背诵

<table>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/progress.png"><img src="docs/images/menus/progress.png" alt="单词背诵 · 学习进度" width="400"></a><br>
      <strong>学习进度</strong>：查看背诵、中文背诵与今日复习的每日合计，以及生词表掌握量和各词书累计进度。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/books.png"><img src="docs/images/menus/books.png" alt="单词背诵 · 选书" width="400"></a><br>
      <strong>选书</strong>：按学习目标选择内置或自建词书，分别保存各词书的学习进度。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/auto.png"><img src="docs/images/menus/auto.png" alt="单词背诵 · 自动飘单词" width="400"></a><br>
      <strong>自动飘单词</strong>：按设定的数量、朗读次数和间隔自动展示单词、释义及例句。
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/flash.png"><img src="docs/images/menus/flash.png" alt="单词背诵 · 强化学习" width="400"></a><br>
      <strong>强化学习</strong>：通过朗读、停顿回忆和词义展示加深单词记忆。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/spell.png"><img src="docs/images/menus/spell.png" alt="单词背诵 · 背诵" width="400"></a><br>
      <strong>背诵</strong>：听发音输入单词并检查拼写，拼错的单词自动加入生词表。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/chinese-spell.png"><img src="docs/images/menus/chinese-spell.png" alt="单词背诵 · 中文背诵" width="400"></a><br>
      <strong>中文背诵</strong>：看配图和中文释义，输入对应的英文单词并检查拼写。
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/longterm.png"><img src="docs/images/menus/longterm.png" alt="单词背诵 · 复习" width="400"></a><br>
      <strong>复习</strong>：按生词表到期排期完成正式复习，并查看正确率、掌握量和错误统计。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/longterm-notebook.png"><img src="docs/images/menus/longterm-notebook.png" alt="单词背诵 · 生词表" width="400"></a><br>
      <strong>生词表</strong>：管理跨词书的生词、导入导出词条，并选择单词提前练习。
    </td>
    <td width="33%"></td>
  </tr>
</table>

### 同声翻译

<table>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/interpretation-start.png"><img src="docs/images/menus/interpretation-start.png" alt="同声翻译 · 启动" width="400"></a><br>
      <strong>启动</strong>：选择音源和识别语言，通过系统浮层显示本地实时字幕；可选双语翻译，并在本机保存录音。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/interpretation-history.png"><img src="docs/images/menus/interpretation-history.png" alt="同声翻译 · 历史记录" width="400"></a><br>
      <strong>历史记录</strong>：回放本机录音，查看同一时间轴的原文与中文字幕，并生成会议纪要、润色或深度分析。
    </td>
    <td width="33%"></td>
  </tr>
</table>

### 听说训练

<table>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/sentence-auto.png"><img src="docs/images/menus/sentence-auto.png" alt="听说训练 · 飘例句" width="400"></a><br>
      <strong>飘例句</strong>：按设定节奏自动展示并朗读双语例句，练习句子听读。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/conversation.png"><img src="docs/images/menus/conversation.png" alt="听说训练 · 听说练习" width="400"></a><br>
      <strong>听说练习</strong>：围绕练习材料完成听写、理解题、录音跟读和脱稿表达。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/listening.png"><img src="docs/images/menus/listening.png" alt="听说训练 · 听力训练" width="400"></a><br>
      <strong>听力训练</strong>：导入音频与字幕，通过精听、跟读、盲听和复述训练听力。
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/ai-coach.png"><img src="docs/images/menus/ai-coach.png" alt="听说训练 · AI 陪练" width="400"></a><br>
      <strong>AI 陪练</strong>：用文字或语音回答场景问题，获取表达反馈并继续回答追问。
    </td>
    <td width="33%"></td>
    <td width="33%"></td>
  </tr>
</table>

### 工具

<table>
  <tr>
    <td width="33%" valign="top">
      <a href="docs/images/menus/search.png"><img src="docs/images/menus/search.png" alt="工具 · 查询" width="400"></a><br>
      <strong>查询</strong>：检索单词并查看释义、音标和例句。
    </td>
    <td width="33%" valign="top">
      <a href="docs/images/menus/maintenance.png"><img src="docs/images/menus/maintenance.png" alt="工具 · 词库维护" width="400"></a><br>
      <strong>词库维护</strong>：创建和编辑词书，在指定位置插入、编辑或删除单词及其资料。
    </td>
    <td width="33%"></td>
  </tr>
</table>

「设置 → 导入导出」位于系统设置之后、关于 QuickLang 之前，可保存或系统分享当前用户备份，也可导入用户备份和生词表 JSON。用户备份导入前会预览并确认替换；备份不包含 API Key、录音、音频文件、设备权限或普通词书内容。

## 开始使用

1. 在“设置 → 用户设置”中创建或选择用户，再在“单词背诵 → 选书”中选择词书。
2. 用自动飘单词或强化学习熟悉单词，再通过背诵、中文背诵检查记忆。
3. 拼写错词会加入生词表；在“复习”中完成到期练习，或在生词表中选择单词提前练习。
4. 使用 AI 陪练、远程转写或翻译前，在“设置 → 系统设置”配置相应模型与服务。

内置 14 本词书，包含初中、高中、四级、六级和考研词汇，并提供中文释义和双语例句；基础词书学习可以离线使用。AI 服务需要相应配置和网络，音频采集、录音和设备端识别还需要系统权限。

今日学习合计由背诵、中文背诵和正式复习组成，正式复习同一天同一单词只计一次；提前练习不计入该正式复习指标。总进度中的“复习”显示已掌握词数／生词表总词数，强化学习单独累计。

### 获取应用

[直接下载 QuickLang 1.0.0 ZIP](https://github.com/longdafeng/quicklang/releases/download/v1.0.0/QuickLang-1.0.0-macos-arm64.zip)。用户只需下载这一个 ZIP，校验文件可按需下载。

访问 [GitHub Releases](https://github.com/longdafeng/quicklang/releases)，以实际发布的安装包和平台说明为准。macOS 安装包解压后，将 `QuickLang.app` 放入应用程序目录；未经过 Apple 公证的开发包可能需要在系统隐私与安全设置中允许打开。

iPhone 的源码构建、签名和安装步骤见 [iOS 开发指南](scripts/ios-README.md)。当前学习记录保存在设备本地，尚未提供自动跨设备同步。

### 用户设置与数据

“设置”还提供用户管理、系统配置和关于页面。不同用户分别保存学习记录；用户设置中的 JSON 备份包含用户设置、学习进度、大模型配置和完整生词表导出内容，不导出或替换普通词书内容；保留选书状态，学习进度恢复到当前已有或内置词书。完整生词表 JSON 导入会恢复词条顺序、排期、掌握状态、复习历史和会话；TXT 或单词列表导入只合并单词；生词表页面仍可单独导入、导出。

API Key、音频文件、录音和设备权限不包含在普通用户 JSON 备份中。导入前会预览并确认替换当前用户，其他用户不受影响；音频文件需要另行保存。只使用当前支持的备份结构，具体内容以导出和导入预览为准。

## 从源码运行

项目采用 **Tauri 2、React / TypeScript、Rust**；macOS 使用 seekdb，iOS 默认使用 SQLite，可通过 `IOS_DB=SEEKDB` 构建切换到 seekdb。当前源码版本为 **0.9.2**，macOS 包的最低系统版本按当前配置为 **27.0**，iOS 包配置为 **18.0**；各系统语音和采集能力还受设备及系统 API 支持限制。

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

### iPhone 构建与数据库选择

iPhone 默认使用 **SQLite**；通过环境变量 `IOS_DB=SEEKDB` 可在构建时选择 **seekdb**。构建需要 macOS 和完整 Xcode，首次使用先执行 `make ios-init`，并在 Xcode 配置 Apple 账号与签名。真机安装前需连接并解锁 iPhone，完成“信任此电脑”和开发者模式设置；签名与设备选择详见 [iOS 开发指南](scripts/ios-README.md)。

```sh
# Default iPhone backend: SQLite
make build_ios
make release_ios
make install_ios

# Build and install iPhone apps with seekdb
IOS_DB=SEEKDB make build_ios
IOS_DB=SEEKDB make release_ios
IOS_DB=SEEKDB make install_ios

# Build a simulator app with seekdb
IOS_DB=SEEKDB IOS_TARGET=simulator make build_ios
```

`build_ios` 构建 Debug，`release_ios` 构建 Release；`install_ios` 会构建或复用所选后端的 Release 产物，再安装并启动。也可通过 `IOS_DB=SQLITE` 显式选择 SQLite；值不区分大小写。后端选择参与构建缓存判定，切换时不会复用另一后端的应用产物。

使用 seekdb 前，需在本地 seekdb 项目中准备与真机或模拟器匹配的 `SeekDB.framework`。可通过 `QUICKLANG_SEEKDB_IOS_FRAMEWORK` 指定完整 framework 路径：

```sh
IOS_DB=SEEKDB \
QUICKLANG_SEEKDB_IOS_FRAMEWORK=/absolute/path/to/SeekDB.framework \
make install_ios
```

QuickLang 会验证、打包并签名该 framework；缺少或不匹配时会停止构建，不会自动下载引擎或回退到 SQLite。默认产物位置与 framework 准备要求见 [iOS seekdb 集成说明](scripts/ios-README.md#issue-5ios-动态-seekdb-集成)。默认 SQLite 构建无需准备该 framework。

SQLite 和 seekdb 分别使用设备沙箱中的 `sqlite-relational-v3` 与 `seekdb-1.4.0-relational-v3` 数据目录。切换后端不会自动迁移、删除或共享已有学习数据；此选择不改变 macOS 默认的 seekdb 后端。

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
