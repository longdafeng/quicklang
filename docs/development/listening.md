# 听力训练

QuickLang 的听力训练独立实现 Echo Loop 介绍中的训练方法，沿用 React/TypeScript、Tauri/Rust 和 seekdb，没有引入 Flutter、SQLite 或第三方项目代码。

## 使用

1. 创建或选择本机用户，在侧栏进入「听力训练」。
2. 批量导入自己的 MP3、M4A、WAV、OGG 或 WebM 音频，每段最多 8 MB。
3. 打开材料，导入 SRT/VTT 字幕（最多 400 KB / 3000 片段），或点击「发送音频并生成 AI 字幕」。字幕必须有真实时间轴；不估算或由语言模型猜测时间戳。
4. 依次完成精听、跟读、盲听和复述。支持倍速、句子循环、片段定位、难句收藏、AI 翻译/意群/词汇讲解、录音回听，以及单词和意群的语境闪卡。
5. 复述可输入文字或录音转写；草稿在失焦或点击保存时写入。完成后安排七轮复习，每轮相对于上轮实际完成时间间隔 6 小时、1 天、2 天、4 天、7 天、14 天、28 天。未到期可自由练习，不能提前推进正式复习。

材料库显示到期状态、训练时长和断点，打开材料恢复阶段与当前句子。到期提示在应用内显示，应用关闭时不发送系统通知。词汇闪卡是材料内的自由复习，与整段材料的七轮调度分开；不改变原来的单词复习算法。

## 架构

- `src/mac_ui/src/features/listening/model.ts`：字幕校验、训练状态机、七轮调度、文字对齐纯函数。
- `Listening.tsx`、`Recorder.tsx`、`PhraseCards.tsx`：材料库、播放器、录音和语境闪卡。
- `repository.ts`：类型化 Tauri IPC，复用当前 Profile ID；桌面数据库失败不会回退到浏览器存储。浏览器仅提供明确标记的临时页面预览，离开页面后丢失材料。
- `src/shell/src/storage.rs`：所有听力读写进入现有专用数据库线程，使用有界请求队列。
- `src/crates/storage-seekdb/src/listening.rs`：seekdb 仓库，复合主键隔离用户，版本检查防止旧页面覆盖新进度。
- `V0004__listening.sql`：新增独立表，不修改旧迁移校验和。首次写入将音频 BLOB 与 JSON 元数据原子保存。后续保存只更新元数据与版本，不重新上传音频。删除在事务中同时删除音频和元数据。

录音只在当前页面保留，离开页面释放麦克风、媒体 URL 并中止前端 AI 请求。学习音频完整保存于 seekdb；未添加其他持久化数据库。浏览器预览不作为生产存储后备。当前 JSON 元数据上限 500 KB；每次桌面读取音频会通过 IPC 搬运完整文件，因此限制为 8 MB。大文件流式播放和分块转写可在后续扩展存储接口时加入。

## AI 与语音边界

复用「系统设置」的 Base URL、对话模型、转写模型和当前会话密钥。对话走现有 `coach_chat`；录音文字转写走 `coach_transcribe`；字幕走新增 `listening_transcribe`，请求 `verbose_json` 和 segment 时间戳。服务不支持时显示错误并建议导入字幕，不使用伪时间轴。

点击相应发送按钮后才发送音频、原句或复述至用户配置的服务。跟读展示有序文字匹配度，不把 ASR 文字匹配冒充发音评分。录音最长两分钟；浏览器或麦克风不可用时可输入文字。

## 验证

- `npm test`：包含字幕校验、全部七轮调度、重复词对齐、用户隔离调用、数据库读取/保存失败和断点恢复测试。
- `npm run build`：TypeScript 检查和 Vite 生产构建。
- `cargo check --locked --offline -p quicklang-shell`：验证 Rust/Tauri 接口。
- `cargo test --locked --offline -p quicklang-storage-seekdb listening::tests -- --include-ignored --nocapture`：在 macOS ARM64 上用真实 seekdb 验证音频与进度重开恢复、用户隔离、版本冲突和删除事务。测试数据库保留在 `build/test-databases/`。

真实麦克风和外部模型服务需要在配置服务后进行设备验收；自动测试不调用外部付费模型。
