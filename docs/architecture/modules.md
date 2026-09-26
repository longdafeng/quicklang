# 模块功能与关键流程

本文按 2026-09-20 仓库实际代码说明当前实现。路径均相对仓库根目录；“已实现”表示存在实际实现，不代表本次文档核查已运行对应系统集成测试。整体边界见[整体架构](./overview)，下图展示学习、AI 与持久化的主要分支。

> 静态 SVG 尚未重新导出，仍含旧 localStorage 保存链路，不代表当前实现；请使用下方已更新的交互图及本文说明。

[打开交互流程图](/architecture/quicklang-learning.html)

这是学习主流程概览，各模块的细节和错误分支在下文展开；不是每个模块内部的完整调用图。同声翻译的原生采集、独立 AI 请求与 seekdb 历史存储以[专节](#interpretation)为准，不由该图完整覆盖。

## 1. 入口、运行边界与数据分层

`src/ui` 承载可复用界面及前端交互逻辑；`src/app` 负责桌面 IPC、AI 请求、存储协调和本机专有能力；`src/server` 是独立服务骨架；`src/crates` 承载共享 Rust 层。领域层不依赖任何入口，共享 crates 不反向依赖入口。桌面 Cargo 包名为 `quicklang-app`，库名为 `quicklang_app`，可执行程序为 `quicklang`。详细约束见[目录职责与依赖约束](./overview#目录职责与依赖约束)。

前端入口为 `src/ui/src/main.tsx`，挂载 `src/ui/src/app/App.tsx`。`App` 先等待 seekdb 应用状态加载完成，再组合设备级 `AIProfilesProvider`、`SpeechStartup` 和用户学习页面；加载失败显示错误和重试，不以默认空状态覆盖数据库；菜单由 React 状态控制，不是服务端路由。用户切换后以用户 ID 重新挂载 `LearningApp`。

桌面入口为 `src/app/src/main.rs` → `src/app/src/lib.rs::run`。Tauri 注册存储、拼写评估、AI 配置、AI 请求和语音命令；React 功能模块通过 `src/ui/src/adapters/desktop.ts` 统一调用原生命令与订阅事件，该适配层封装 Tauri SDK；持久化要求原生 seekdb，不提供浏览器存储降级。持久化统一不等于所有业务下沉 Rust，也不改变临时状态和静态资源的职责：

- **seekdb 应用状态 `ql_app_state`**：本地用户资料、选书、自建词书及内置书覆盖内容、生词表、闪卡与拼写进度、会话文字记录、生成情境及设备语音设置，以键/字符串值保存。
- **seekdb 同声翻译专用表**：会话、原始 WAV 分段、转写、实时翻译与历史分析结果，通过 `interpretation_repository` 读写，音频经 Base64 IPC 传输后保存在数据库。
- **打包最终词库**：浏览器与桌面共用 `src/ui/public/content/word-library/` 的 17,844 个单词和 14 本内置词书（60,897 个有序成员），前端通过 `fetch` 读取。另有 `App.tsx` 内定义的两本示例书。
- **seekdb 1.4.0**：真实持久化 Rust 复习状态/事件、初始化后的规范词库、听力材料原始音频及训练状态、设备 AI 配置与加密凭据、增强音色下载选择及已安装缓存。
- **系统钥匙串**：仅保存 AI 凭据加密主密钥；各服务 API Key 的密文保存在 seekdb，明文只在显式解析后进入运行时内存。
- **临时内存/文件**：练习录音 Blob、播放 Object URL、会话聊天上下文、自动背诵当前位置；原生朗读生成临时 WAV，读取后由临时文件对象清理。

seekdb 默认数据目录为 `~/Library/Application Support/io.github.longdafeng.quicklang/seekdb-1.4.0/`，由 Tauri 的 `app_data_dir()` 加版本子目录确定；`QUICKLANG_DATA_DIR` 可覆盖。全部应用持久化数据进入该数据库目录；系统钥匙串仅保留加密主密钥。数据库备份仍不包含 Keychain、打包静态资源或未保存的临时录音，且不等于已经实现完整备份恢复功能。不读取或迁移旧 localStorage/IndexedDB 数据，不以浏览器存储作为失败回退。

## 2. 词库加载、查询与维护

### 2.1 读取与查询

入口为 `features/library/books.ts`、`features/search/WordSearch.tsx` 和 `App.tsx`（均在 `src/ui/src/` 下）。内置词书读取 `word-library/` 中已经生成并提交的最终数据：`loadBook` 获取 `wordbooks.jsonl` 与 `words.jsonl` 并适配为学习界面的 `Word[]`。`legacy-map.jsonl` 仅保留 49,436 条固定来源映射用于追溯，UI 不读取旧 ID 或旧位置。60,897 个最终词书成员与来源映射数量不能混作同一计数。不再维护每本书独立的旧 JSON 数据副本。

选书成功后，内置书按需加载；当前用户保存的同 ID 词书覆盖内置内容。加载失败显示重试入口，切书或卸载以 `AbortController` 避免旧响应覆盖新选择。

查询页并发加载未被用户覆盖的内置书，合并内存中的示例书/自建书/覆盖书，按 NFKC、去首尾空白、转小写后的英文或中文释义做包含匹配。排序优先完全匹配，其次英文前缀，其余包含匹配；同一词在不同书中独立展示，每页 20 条。`Promise.allSettled` 保留成功书的结果，失败书单独提示“结果可能不完整”，可重新加载。

**实现边界**：查询与词库维护当前未通过 Tauri 访问 `ql_word` 或 `wordbook`；不是 seekdb 全文、向量或 SQL 搜索。覆盖书虽通过应用状态写入 seekdb，但不直接读写规范词库表；数据库已有规范词库和导入机制，不意味着 UI 查询已切换数据源。

### 2.2 编辑、插入、导入与进度处理

入口为 `features/library/LibraryMaintenance.tsx`、`addWord.ts`、`progress.ts`，保存动作由 `App.tsx::saveBook` 承接。

- 创建词书、改名、编辑条目及删除条目保存至 seekdb 应用状态中的当前用户 `books` 键。新增可选书首、书尾、指定词前/后；界面检查重复拼写和插入锚点。
- 新增只输入英文时，`resolveNewWord` 先逐书精确查找规范化拼写。命中则复制资料并生成新 ID；**全部本地查找成功且未命中**才解析 AI 配置并请求生成。某本书读取失败会终止，不会悄悄改走 AI。
- AI 返回必须是完整 JSON 或单个完整 JSON 围栏，字段集合、长度、拼写一致性、音标、释义、双语例句均经过验证。失败不插入，输入可保留；取消、切书和过期响应不写入。日志记录阶段而不记录查询词、服务响应或密钥。
- JSON 导入限制 10 MB，要求书名及非空单词数组，每词至少有非空 `spelling`、`meaning`；新书使用新 ID，条目分配顺序 ID。格式或保存失败显示错误。
- 插入新词时，`remapLibraryProgress` 用既有词 ID 重映射闪卡位置及拼写队列、错词索引和剩余正确次数；删除流程请求重置对应闪卡与拼写进度。生词表按剩余 ID 过滤。
- 词书及关联学习进度通过 `app_state_write` 在单个 seekdb 事务中原子批量提交；等待提交成功后才更新已确认状态。失败保留原状态并提示，不使用跨浏览器键的尽力补偿。

## 3. 本地用户、生词表与学习进度

入口为 `features/users/profiles.tsx`、`Users.tsx`、`features/study/shared.tsx`、`Progress.tsx`。

用户是本地学习档案，含 ID、名称和 A1–C2 等级，不是登录账户。注册表保存于 `quicklang:profiles`，最近用户为 `quicklang:last-user`；学习键通常为 `quicklang:user:<用户ID>:<业务键>`。创建与切换校验重复名称、合法 ID/等级和存储可写性；失败时提示，不宣称切换或资料保存成功。这些键现在属于 seekdb 应用状态，不是浏览器存储键；不复制或迁移旧浏览器学习档案。

`useSaved` 使用启动时加载的共享应用状态，持久化经异步 seekdb 写入完成。`app_state_list` 加载键/字符串值，`app_state_write` 原子提交批量修改；调用方等待提交后再确认动作成功，失败提示保存错误，不把仅内存更新当成已保存，也不回退到浏览器存储。

生词表位于用户作用域 `vocabulary`，按书 ID 保存词 ID 列表；拼错自动加入，也可手动收藏或移除。移出生词表不会清除拼写会话内部的错词复习任务。

进度页只读取 `flash:<书ID>` 与 `spell:<书ID>` 的 `learned`，分别展示强化学习和背诵位置，损坏数据按 0 处理并把数值限制在书长以内。拼写 `learned` 包含已经作答的错词，不代表掌握度；这不是 Rust 调度状态、到期队列或全部学习行为的汇总。

## 4. 拼写、强化学习与自动背诵

### 4.1 拼写背诵

入口为 `features/spelling/Spelling.tsx`、`session.ts`，依赖 `adapters/runtime.ts::evaluateSpelling` 和共享语音模块。

设置数量后建立索引队列，朗读当前词，提交答案时桌面调用 `evaluate_spelling` → `quicklang_typing_engine::evaluate`。Rust 做 NFKC/小写规范化、按 Unicode 字符位置比较，返回是否正确、差异位置和建议评级。浏览器由 `runtime.ts` 执行相似的本地判断，并不调用 Rust。

当前 UI 提交的 `hint_count`、`backspaces` 均为 0；页面使用结果中的 `correct` 更新前端会话，不把 `suggested_rating` 提交给调度器。首次作答推进 `learned`，错误词加入生词表。首轮结束显示正确率及耗时；确认后每个错词还须答对两次，按 `needs` 计数保留未完成队列，最终进入 `done`。会话和计数保存在 `spell:<书ID>`，支持恢复。评估失败提示重试，不作为错误答案计入；朗读错误单独提示。

**已专项核实 `rate_card` 调用关系**：`adapters/seekdb.ts` 定义 `loadStoredReview` 和 `submitStoredReview`，后者调用 `rate_card`；但当前 `src/ui/src` 没有页面导入或调用这两个函数。`Spelling`、`Flashcard`、`AutoRecite` 均未连接 Rust 复习提交。因此“UI 拼写评分自动原子写入 Rust 复习事件并更新 SM-2”不符合当前实现。适配器和后端通路已实现，产品页面接线尚未完成。

### 4.2 强化学习闪卡

入口为 `features/flashcard/Flashcard.tsx`。以用户作用域 `flash-count`、`flash-gap`、`flash-repeats` 保存设置，以 `flash:<书ID>` 保存 `{ learned, end }`。允许按位置或分页导航开始一段学习。

正常流程为重复朗读英文 → 每次停顿 → 显示中文和例句 → 再停顿 → 推进下一词；Enter 可提前揭示或推进，文本输入场景不劫持快捷键。页面卸载/切词中止旧播放；朗读失败显示卡面和错误，停止错误状态下的自动推进，用户可重读或手动操作。这是位置式学习，不是四档评级或按到期时间抽卡。

### 4.3 自动背诵

入口为 `features/auto-recite/AutoRecite.tsx`。每词按“英文整词 → 去掉词性缩写的中文释义 → 逐字母 → 整词复读 → 间隔”循环，设置可控制数量、次数、间隔和起始位置。暂停/导航会中止当前异步语音链，继续时重读当前词；语音失败停止运行并显示错误。

次数、间隔、数量保存在用户作用域 `auto-*`；会话区间、当前位置、暂停和完成状态只在组件内存中，不写闪卡/拼写进度，也不提交 Rust 复习。`machine.ts` 虽含逐字显示状态机，但当前 `AutoRecite.tsx` 没有导入它，不能用该文件名推断正在使用的页面流程。

## 5. 听说练习、AI 陪练与录音

入口为 `features/conversation/Conversation.tsx`、`lessons.ts`、`Recorder.tsx`、`ai.ts`。普通听说和 AI 陪练共用 `Conversation`，后者传 `coachOnly`，不是独立服务。

材料来自内置短对话、当前词书例句及 AI 生成情境。普通模式包含朗读、字幕提示、听写比较、理解选择题、录音回听和脱稿表达；本地听写/理解/自评不要求 AI 已配置。AI 生成发送目标例句词或词书前五词，验证生成结构后最多保留十组，存入用户 `generated-lessons:<书ID>`。

文字练习记录保存于 `conversation:<书ID>`，最多最近 200 次；首次与重试、是否使用提示分别记录。重要提交先等待 seekdb 应用状态写入成功，失败不把该步骤标为成功。AI 反馈前先保留原回答，成功后另记反馈与模型；发送给服务的聊天历史仅保留最近八条，当前聊天状态在内存中。

会话录音用 `getUserMedia`/`MediaRecorder`，最长 60 秒、上限 8 MB，仅当前练习暂存，可下载；隐藏/卸载释放麦克风和对象 URL。权限拒绝、不支持格式、录音错误或超限均显示错误。**录音不会自动上传**：点击转写才调用模型，得到文字后由用户核对，再单独请求反馈。当前没有本地 ASR，也没有声学发音评分；听写差异和 AI 文字反馈不应称为口音/发音评测。

## 6. 听力材料库与多轮训练

入口为 `features/listening/Listening.tsx`、`model.ts`、`repository.ts`、`ai.ts`、`Recorder.tsx`、`PhraseCards.tsx`。持久化链路为 `listening_repository` → `StorageService` → `storage-seekdb/src/listening.rs`。

### 6.1 材料与数据库

导入 MP3/M4A/WAV/OGG/WebM，单文件非空且不超过 8 MB。桌面把音频编码为十六进制随元数据传 IPC，落在 `ql_listening` 的音频列和 JSON payload 中；按 `(owner_id, material_id)` 隔离用户。音频读取同样走十六进制并验证格式，不依赖外部音频路径。

新增材料以版本 0 提交，后端事务内锁定记录并检查版本，保存后返回递增版本；更新不能替换原始音频。删除同时移除材料、音频和训练元数据。版本过期返回 `VERSION_CONFLICT`，提示重新打开训练；非法 ID、音频、过大元数据或缺失材料拒绝操作。批量导入中间失败会明确提示此前成功导入的材料保留，不伪装为整批回滚。

前端用 Promise 队列串行保存状态，写入成功后才应用新版本和训练状态；失败显示保存错误。浏览器模式显式使用组件内存材料和 Blob Map，离开页面即丢失，不回退到 localStorage/SQLite。

### 6.2 训练与 AI

导入 SRT/VTT，或显式上传整段音频获取 `verbose_json`、segment 时间戳。字幕检查数量、非空文本、顺序、非重叠和音频时长；失败不替换有效字幕。时间轴来自 ASR，不由语言模型估算。

训练顺序为精听 → 跟读 → 盲听 → 复述，支持片段变速/循环、难句收藏、原句语境词汇闪卡、AI 翻译讲解和复述反馈。词汇闪卡要求摘录文本出现在当前字幕句中，随材料保存，不与词书生词表或 Rust 卡片复习自动合并。

`model.ts::advance` 在 TypeScript 中安排七轮间隔：6 小时、1 天、2 天、4 天、7 天、14 天、28 天；未到期可自由练习但不推进轮次，第七轮完成后标记完成。它使用 `Date.now()`，与 Rust `quicklang-sm2-v1` 是两套独立逻辑。

听力练习录音最长两分钟，只在当前页面保留；原材料音频持久化不等于跟读录音持久化。练习时长、字幕、收藏、笔记和复述草稿随材料状态保存。跟读匹配度是转写文字的有序词匹配，不是发音分。AI 取消/超时、播放失败、麦克风权限失败和保存失败分别提示；AI 复述反馈本身在当前组件状态中展示，不等同于持久化的复述草稿。

## 同声翻译：原生采集与历史分析 {#interpretation}

入口为 `features/interpretation/Interpretation.tsx`，采集编排、AI 调用、历史持久化和数据结构分别在同目录 `capture.ts`、`ai.ts`、`repository.ts`、`model.ts`。它不是 `Conversation` 的录音模式，也不复用听力材料仓库。

### 采集与实时处理

`App.tsx` 在首次进入启动页或历史页后保持 `Interpretation` 挂载，切换其他菜单只隐藏组件，因此录音可继续；切换学习用户或卸载会取消前端处理并请求停止原生采集。桌面窗口销毁及应用退出也会触发 Rust 清理。

- `start_interpretation_capture` → `src/app/src/interpretation_capture.rs` → `native/interpretation_capture.m`。macOS 使用 ScreenCaptureKit 采集系统/混合声音，纯麦克风使用 AVAudioEngine；需相应系统录音、麦克风权限。非 macOS 原生启动返回不支持，浏览器不提供替代采集。
- 原生输出 16 kHz、单声道、16 位 PCM WAV，常规分段为 80,000 帧（5 秒）。`interpretation-audio` 事件携带会话 ID、序号、Base64 WAV 与结束标志，只发往主 WebView；停止时发送末段，整段边界上也发送结束标记。
- 前端按会话及序号过滤重复/旧事件，先提交 seekdb 音频，再由单个 worker 串行转写、按需翻译。**开始采集即启用自动分段上传**，不是每段另点“转写”；识别与翻译可选择不同设备 AI 配置。
- 待处理队列达到 12 段时请求停止采集并继续处理已保存数据，不主动丢弃队列。保存失败会提示相关分段未持久化并请求停止；转写/翻译失败保留已保存音频和已取得的转写。不能据此承诺系统崩溃、配额不足或进程退出时完全无损。
- 停止后等待末段事件、持久化队列和 AI worker，再保存 `complete` 或 `interrupted`；末段确认最多等 3 秒，超时明确提示可能缺少最后一段。“实时”在此是分段请求，不是流式 ASR、连续 token 推送或语音到语音翻译。

### 历史、重试与分析

`repository.ts` 通过 `interpretation_repository`、`StorageService` 访问 seekdb 的 `ql_interpretation_session` / `ql_interpretation_chunk` 表，按学习用户查询会话，按会话和序号保存分段。音频经 Base64 IPC 传输，在数据库中持久化；操作等待数据库提交成功。会话仅保存白名单字段和模型配置 ID，不保存运行时 API Key。这是本地档案分组，不是远程权限控制。不打开 IndexedDB，也不导入旧浏览器历史。

历史页按序合并 WAV 以回放/导出，支持对缺失转写的分段重新识别；该重试不会重跑已有转写的实时翻译。全文分析按最多 10,000 个 UTF-16 代码单元分段（避免截断代理对），先完整翻译，再分段摘要并归并为会话摘要。每次分析以独立 `run` 保存模型配置 ID、目标语言、部分结果及完成/失败/取消状态，不覆盖实时翻译。异常关闭遗留的 recording/processing/running 状态会显示为未正常结束，不宣称后台自动恢复。

### 对外请求边界

`interpretation/ai.ts` 显式调用 `resolveAIProfile` 获取所选配置，不使用会话页面的 `resolveRuntime` 缓存入口。桌面通过 `interpretation_transcribe` / `interpretation_transform` 调用 `src/app/src/interpretation_ai.rs`，直接请求兼容服务的 `audio/transcriptions` / `chat/completions`，不经过 QuickLang server 或 `coach.rs`。

该通路使用 10 秒连接超时、90 秒请求超时，音频上限 8,000,000 字节、文本上限 200,000 字节、响应上限 1,000,000 字节；只接受 HTTPS 或本机 HTTP，拒绝地址内凭据/查询/锚点及重定向。转写空文本作为静音结果接受，文本处理拒绝空输出和 `finish_reason=length` 截断。前端取消会阻止后续处理、忽略过期响应，但没有取消已发出 Rust 网络请求的 IPC。浏览器 fetch 分支不等于浏览器具备完整采集及配置能力。

## 7. 语音设置、原生朗读与增强音色

入口为 `features/speech/speech.ts`、`native.ts`、`silence.ts`、`SpeechStartup.tsx` 和 `features/settings/SpeechSettings.tsx`。设备级口音、音色 URI、语速保存在 `quicklang:speech-settings`，不按学习用户隔离。

桌面流程为刷新 `speech_voices` → 选择本机音色 → `speech_render` → `src/app/src/speech.rs` 使用 `/usr/bin/say` 生成 PCM WAV → 返回字节 → 前端调整边缘静音并用 `Audio` 播放。文本通过标准输入传给 `say`，语速及音色先校验；临时 WAV 读取后清理，Object URL 播放结束后撤销。取消可阻止待返回音频开始播放或停止当前 Audio；当前没有用于中止 Rust 中既有 `say` 子进程的取消 IPC。浏览器走 Web Speech API，不使用该本机命令链。

默认美式音色优先 Nathan Enhanced、Samantha Enhanced、普通 Samantha，再按语言/质量等条件选择；缺音色或渲染失败拒绝本次朗读，不宣称发音成功。

`SpeechStartup` **后台检查，不阻塞主界面挂载**。先读取数据库“已确认安装”缓存及用户拒绝下载记录，再枚举音色；缺少偏好增强音色时可发起下载辅助。`voice_download.rs` 用进程级互斥避免重叠操作，桥接 `src/app/native/voice_download.m` 的 macOS 辅助功能自动化，缺权限返回 `permissionRequired`，无法自动完成返回手动流程。打开权限页面不代表已经获得权限，点击下载也不代表安装完成；重新枚举确认后才写缓存。

下载拒绝记录 `speech-enhanced` 与安装确认 `speech-enhanced-available` 存在 `ql_listening` 的保留 owner `__quicklang_device__` 下，不是新的独立语音设置表。检查失败显示非阻断提示，可以继续使用并稍后重试。

## 8. AI 配置、凭据与请求边界

入口为 `features/settings/SystemSettings.tsx`、`AIProfiles.tsx`、`aiProfilesRepository.ts`；原生命令在 `src/app/src/ai_profiles.rs`，数据与加密在 `src/crates/storage-seekdb/src/ai_profiles.rs`。

### 8.1 元数据与密钥

设备级多配置列表/活动配置保存于 `ql_ai_profiles` 单例 JSON 记录，不跟随学习用户切换。列表仅返回服务地址、模型、名称和 `hasApiKey`；增删改、选中配置通过数据库完成。密钥操作显式区分 preserve/replace/clear，不能把空输入一律解释为删除密钥。

API Key 用 AES-256-GCM 加密，随机 nonce、版本化密文并绑定配置 ID。32 字节主密钥存于 macOS 默认钥匙串，service 为 `com.quicklang.ai-profiles`，account 为 `master-key-v1`。普通列表、删除、激活及不更改凭据的元数据操作不需解密；替换密钥、显式解析等才访问钥匙串。

会话、听力及词库补词实际发起 AI 动作时，`resolveRuntime` 调用 `ai_profile_resolve`；同声翻译则通过 `resolveAIProfile` 直接调用同一解析命令。存储线程取得拥有独立所有权的密文快照后，把钥匙串读取/解密放到阻塞任务，不将原生数据库句柄跨线程传递。明文返回前端运行时内存，后续请求再经 IPC 传给 Rust 网络层，故不能写成“密钥永远不进入前端”。`AIProfilesProvider` 对 `resolveRuntime` 的缓存使用代次管理，配置修改/重载会清缓存并阻止使用过期解析结果；同声翻译直接解析的路径不复用该缓存机制。

数据库失败使配置操作不可用并提示重读确认；钥匙串不可访问、主密钥丢失、格式异常或密文认证失败时停止解析，不降级明文存储。缺失主密钥的恢复入口要求用户明确确认，且后端确认主密钥确实缺失后才清除全部已存凭据，保留配置以便重新填写；主密钥仍在或钥匙串访问失败不擅自清除。

不再读取、迁移或清理旧 `quicklang:ai-settings` 及浏览器迁移回执；已在 seekdb 中的配置和密文保留。浏览器页面不提供等价的持久化 AI 配置服务。

### 8.2 对外请求

`features/conversation/ai.ts` 为会话、词库补词和听力讲解复用请求封装；桌面调用 `coach_chat`/`coach_transcribe`/`listening_transcribe`，由 `src/app/src/coach.rs` 的 reqwest 直接访问用户配置的 OpenAI 兼容服务，**不是访问 QuickLang 本地 server**。浏览器请求辅助函数有直接 fetch 分支，但当前应用 AI 配置 provider 为原生数据库模式，不能由此宣称浏览器 AI 配置流程完整可用。

地址必须为 HTTPS 或本机 HTTP，拒绝 URL 内凭据、查询参数和锚点；禁止重定向。Rust 设置 10 秒连接超时、60 秒请求超时和 256 KB 响应限制，并校验模型、消息、录音类型/大小。服务状态码错误、网络失败、超限或无效 JSON 返回可理解的错误，不输出原始密钥。

前端的取消信号在浏览器会取消 fetch；桌面在 IPC 前后检查并忽略过期结果，但没有取消既有 reqwest 请求的专门命令，因此取消界面不等于服务端立即停止处理。

## 9. Rust 复习业务与持久化契约

入口为 `src/crates/domain/src/lib.rs`、`typing-engine/src/lib.rs`、`scheduler/src/lib.rs`、`storage-api/src/lib.rs`、`application/src/lib.rs`。

- `domain` 定义词事实、卡片类型、四档评级、复习状态/事件和结构化 `AppError { code, message, retryable }`。定义存在不代表每种卡型都有对应 UI。
- `typing-engine` 为纯拼写判断，不自行保存状态。`suggested_rating` 只是建议。
- `scheduler::schedule` 是独立实现且显式版本化的 SM-2-inspired 变体 `quicklang-sm2-v1`，不是 FSRS。Again 安排一分钟后的学习/重学；其他评级按次数、间隔和 ease 推进复习；非法状态、时间及溢出拒绝执行。
- `storage-api` 定义 `Clock` 和 `ReviewRepository`，要求事件追加与版本比较更新原子提交，返回 `Applied` 或 `AlreadyApplied`。
- `application::rate_card` 校验标识 → 查事件去重 → 加载原状态 → 比较 `expected_version` → 用注入时钟调度 → 带算法版本创建事件 → 仓库提交。

成功时，seekdb 事务通过 `FOR UPDATE` 锁定状态并再次核对事件/版本，将事件写入 `ql_review_event`、新状态写入 `ql_review_state`。同一事件 ID 与同一请求重试不重复安排复习；复用 ID 指向不同卡或评级返回 `EVENT_CONFLICT`；旧版本返回可重试的 `SESSION_STALE`，应重新加载，而不是盲目重放为新事件。

Tauri 的 `load_review_state` 通过 `ensure_card` 在不存在时创建初始状态；`rate_card` 本身不会自动创建不存在的卡。当前这两种请求还受词库初始化状态门控。复习表以 `card_id` 为键，并没有 UI 档案 owner 字段，也未见将用户档案和 UI 词 ID 自动映射为数据库复习卡的完整接线。后续接入需要明确 ID/用户隔离及重试语义，不能假设已经实现。

## 10. seekdb 运行时、迁移与词库初始化

核心为 `src/crates/storage-seekdb/src/lib.rs`、`native.rs`、`word_library.rs`，线程调度为 `src/app/src/storage.rs`。

### 10.1 运行时与线程所有权

当前固定原生运行时为 macOS ARM64 seekdb 1.4.0。开发态资源在 `deps/cache/seekdb-runtime`，发布态在应用 Resources 的 `seekdb`。驱动用 `libloading` 加载 `libseekdb.dylib` 的固定 C ABI，打开数据目录并建立本地 Unix socket 连接；不请求 TCP 监听端口，创建/使用数据库 `quicklang`。其含原生引擎与驱动依赖，不是 SQLite，也不是占位内存仓库。

数据库连接在专属工作线程创建并使用，句柄明确不实现跨线程 Send/Sync。Tauri 以容量 32 的有界请求队列提交操作，异步等待回复；队列满、线程退出或回复通道断开返回可重试 `DB_UNAVAILABLE`。

打开时检查平台、运行时文件、目录符号链接、目录权限和排他 `quicklang.lock`；验证 `quicklang-engine-version` 及引擎版本。并发占用返回 `DB_LOCKED`，未知旧目录/版本拒绝原地初始化，缺运行时/ABI/版本不匹配分别失败；`SEEKDB_BIN` 覆盖被拒绝，避免偏离固定引擎。

### 10.2 迁移和两阶段就绪

所有建表语句统一存放于 `src/schema/*.sql`，一张表一个文件。Cargo 构建脚本自动发现目录中的 SQL，按文件名排序并嵌入程序；新增文件无需修改初始化代码或表名单。启动先验证定义，再逐表查询 `information_schema.TABLES`，已有表跳过，缺表依次创建并复查。所有必需表成功后才允许持久化就绪，词库补表也复用这一流程。不维护旧版 schema 兼容链，不自动 ALTER 或重建已有表。DDL 可能自动提交，失败重启后继续补缺，不宣称整个建表批次有事务回滚。

基础库打开完成即可令 `phase=ready`、`persistence_ready=true`；随后独立线程校验词库种子，数据库线程分批导入，每批之间可处理业务请求。`library_phase` 从 validating/importing 到 ready/error，独立于基础存储状态。

词库未就绪时仅 `Load`/`Rate` 返回 `LIBRARY_NOT_READY` 或 `LIBRARY_UNAVAILABLE`；AI 配置、听力与语音偏好仍可使用已就绪的基础库。词库失败不会自动把整个数据库标成不可用。前端另有应用状态加载门禁，必须成功加载 seekdb 中的状态才开放依赖持久化的页面；这不表示必须等待完整词库导入或后台语音检查完成。

### 10.3 规范词库

唯一最终词库的开发路径为 `src/ui/public/content/word-library`，发布时原样打包到 Resources 的 `word-library`；浏览器也读取同一份数据。`LibrarySeed::load` 校验 manifest 格式、schema version、允许文件集合、校验和、计数和词书成员关系；`LibraryImport` 分批补充缺失数据，已完成批次可在下次启动继续修复，不覆盖已有词或书。

实际表为 `ql_word` 与 `wordbook`：前者以保留大小写的 NFKC 英文拼写为主键，保存释义、音标、例句、来源/许可、修改标志与版本；后者以原生 `VARCHAR(256)[]` 保存有序拼写列表，**不是 JSON 数组列**。这与 UI 基于书内 `Word.id`、小写查询匹配及 seekdb 应用状态中的覆盖书是不同表示；尚无 UI 编辑自动双写数据库的流程。

## 11. sync、server 与 OceanBase 预留边界

`src/crates/sync-core/src/lib.rs` 只实现 `PushBatch` DTO 校验：设备 ID、最多 500 个事件、事件标识/时间及批内去重。没有后台上传器、拉取协议、持久化 outbox、冲突合并、身份认证或端到端同步通路。

`src/crates/storage-oceanbase/src/lib.rs::OceanBaseAdapter::connect` 仍直接返回 `DB_NOT_CONFIGURED`，未集成服务端存储。这个结论不能套用到已经实现的桌面 `storage-seekdb`。

`src/server/src/main.rs` 启动 Axum，监听 `127.0.0.1:4318`，支持 Ctrl-C 优雅退出；`lib.rs` 中 `/health/live` 返回 alive，`/health/ready` 和 fallback 返回 503、`DB_NOT_CONFIGURED`。没有可用的词库/账户/复习同步 API。构建脚本编译 server 二进制，但 Tauri 启动逻辑没有启动该 server，也不通过它转发 AI 请求。

iOS 有 Tauri 移动入口/配置，Windows 有打包配置分支；当前固定嵌入式运行时只支持 macOS ARM64，初始化也限制 macOS 15+ Apple Silicon。配置文件存在不代表其他平台已具备完整可运行产品。

## 12. 内容、初始化、测试与发布工具

入口为 `scripts/tasks.mjs`，由 Make 等外层入口调用。工具产物主要位于 `deps/cache/`、`build/`、`dist/`，不应与应用用户数据混为一谈。

### 12.1 最终内容与导入

- `src/ui/public/content/word-library/` 是唯一维护的最终数据：`words.jsonl` 包含 17,844 个单词，`wordbooks.jsonl` 包含 14 本词书及 60,897 个有序成员。
- `legacy-map.jsonl` 保留 49,436 条历史来源映射，`merge-conflicts.jsonl` 保留合并冲突；同时携带 `manifest.json`、`source-manifest.json`、`LICENSE` 和 `ATTRIBUTION.md`。AI 编写例句保留 `quicklang-ai-authored` 标记，不冒充上游原例句。
- 开发、初始化和发布直接校验并消费最终词库，不执行内容生成，也不依赖本地上游仓库。来源清单中的历史路径和哈希仅用于追溯，不要求这些文件存在。
- `src/crates/storage-seekdb/src/bin/init-word-library.rs` 直接校验并导入最终数据，只补齐缺失记录，不覆盖已有用户编辑或词书顺序。浏览器、桌面开发和发布均消费同一份最终数据，不重新生成。

### 12.2 初始化与开发

`scripts/bootstrap/init.mjs` 检查 Node.js 22.12+、macOS 15+ ARM64、开发工具；持有初始化锁，选择网络，安装项目内固定 Rust/npm 和锁定依赖，准备经校验的 seekdb 运行时，再构建导入器、校验最终词库并初始化用户数据库。因此 `make init` **确实可能写入默认应用数据目录**，不只是下载构建依赖。

`bootstrap/network.mjs`、`download.mjs`、`process.mjs`、`toolchain.mjs`、`npm.mjs`、`seekdb.mjs` 分别封装网络/下载、命令执行、工具链和运行时准备。任务调用失败即报告非零结果，不把缺依赖或校验失败当成功；初始化锁只对确认已退出的本机进程自动恢复。`dev` 直接启动 Tauri 并使用最终词库，不执行内容生成。

### 12.3 验证与发布

`test` 包含许可检查、Rust fmt/clippy/测试、前端类型和测试、脚本测试；`test-db` 另行运行需真实运行时的 ignored 测试。普通单测通过不能替代 seekdb 系统集成验证；覆盖率任务区分普通 Rust 与数据库执行结果。`compliance/check.mjs` 负责许可合规检查，`testing/rust-coverage.mjs` 处理 Rust 覆盖率门槛。

`build` 校验离线运行时与许可、使用最终词库、构建前端和 server，再以 locked/offline 方式打包未签名桌面应用，复制到 `dist/<平台>-<架构>`。`install` 在 macOS 构建后复制到用户 Applications 或 `INSTALL_DIR`，拒绝覆盖既有安装和符号链接安装目录。

`release/package.mjs` 为 macOS ARM64 制作一体化 ZIP：复制新 app，核验词库/运行时哈希、可执行权限、ARM64 架构及动态链接可迁移性，检查许可和驱动重建源码；压缩后解压再次验证，通过后才发布 ZIP 与 SHA-256 到 `dist/releases/`。内容来自应用包与构建种子，不复制发布者个人数据库。发布包仍未做 Apple Developer ID 签名和公证；用户无需安装开发工具，但在线 AI 仍需服务配置及网络。

## 13. 阅读与后续接线时的关键约束

1. 区分“数据库能力已实现”和“当前 UI 已调用”：Rust `rate_card`、规范词库都已存在，但对应学习页/查询维护页尚未接入。
2. 区分三种学习状态：seekdb 应用状态中的位置/错词会话、TypeScript 听力七轮安排、Rust SM-2-inspired 复习事件，当前不是同一调度系统。
3. 区分本地用户和设备设置：用户资料/学习进度按 ID 隔离；AI 配置和语音设置设备共享；当前没有远程账户权限模型。
4. 区分基础库与词库就绪，不能让词库初始化失败的说明掩盖仍可用的听力/设置能力。
5. 区分临时练习录音、seekdb 原始听力音频、seekdb 同声翻译音频和发往外部 AI 的内容；同声翻译启动后自动上传分段，会话练习录音需手动触发转写。不要把文字匹配包装成声学评分。
6. 区分开发/发布脚本的跨平台分支与已固定可用的平台；不要把 server/OceanBase/sync 的预留接口描述为可用云同步。
