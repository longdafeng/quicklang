# 0.7 长期复习 UI 可访问性核对（#53-C）

> 权威依据：`docs/design/0.7/long_learn.md` 的 §8.1（第 635–644 行）、§8.3（第 659–664 行）、§8.4（第 666–675 行）、§6.2/§6.3/§6.4（第 515–550 行）、§9.1/§9.2（第 677–729 行）、§12.3（第 828–836 行）、§14.1 第 866 行与 §14.2 第 871–886 行；issue #53 验收标准第 4 条「macOS/iOS 布局、键盘/触控和可访问性完成验收」。
> 核对基线：分支 `issue/45-longterm-learning`，提交 `7d91520c`（#53-A 首页）与 `855e1db0`（#53-B 答题与提前练习流程）。#53-C 只核对，不改 `src/ui/**` 与 `tests/unit/ui/**`。
> **修复轮次（#53-D）**：本报告的结论由 #53-D 在同一分支上修复并回填；§8 的 D1–D12 与 §1–§7 的每条缺陷后附「修复状态 + 验证用例」，未修项写明原因。修复只动 `src/ui/**` 与 `tests/unit/ui/**`，未改任何 Rust 代码。
> 核对方式：静态通读 + 只读取证（`grep`/读文件）+ 定向测试读取验证。**未执行真机 VoiceOver / TalkBack、动态字体与真机 TTS**，相关项一律标注「未覆盖/待真机」。
> 对比度按 WCAG 2.1 SC 1.4.3 相对亮度公式计算，取自仓库实际色值。

## 0. 结论摘要

| 维度 | 通过 | 缺陷 | 未覆盖/待真机 |
| --- | --- | --- | --- |
| 语义结构与标题层级 | 5 | 1 | 0 |
| `aria-label` / `scope="row"` / 名称 | 6 | 2 | 0 |
| `aria-live` / `role` / `aria-busy` | 4 | 2 | 0 |
| 键盘可达与焦点顺序 | 7 | 2 | 1 |
| 对比度与既有设计系统一致性 | 6 | 2 | 1 |
| 屏幕阅读器文案（含 `--` 与倒计时） | 4 | 2 | 0 |
| 错误提示可感知性 | 5 | 1 | 0 |
| **小计** | **37** | **12** | **2** |

第 8 节另列 12 条跨切面发现（D1–D12），其中 D2–D7 与上面的缺陷条目是同一问题的两个视角（D1 为独立缺陷）。

**必须修复（阻断 #53 关闭）**：`D1`（播放中提交把正确拼写判为 `again`，违反 §2.3 并虚增 lapse/易错）、`D2`（倒计时每秒刷新 `aria-live` 区域，朗读器播报洪泛）。

**建议修复**：`D3`–`D7`。**观察项**：`D8`–`D11`。

**修复后状态（#53-D，2026-10-04 23:0x-23:2x）**：上表 12 条缺陷中 **9 条已修**（S6 未修；A7、A8、L5、L6、K8、K9、C7、C8、E6、R5、R6 全部随 D1–D11 修复），跨切面 12 条中 **10 条已修**（D9、D12 未修）。复核后的口径：

| 维度 | 通过 | 缺陷（已修） | 缺陷（未修） | 未覆盖/待真机 |
| --- | --- | --- | --- | --- |
| 语义结构与标题层级 | 5 | 0 | 1（S6） | 0 |
| `aria-label` / `scope="row"` / 名称 | 6 | 2（A7、A8） | 0 | 0 |
| `aria-live` / `role` / `aria-busy` | 4 | 2（L5、L6） | 0 | 0 |
| 键盘可达与焦点顺序 | 7 | 2（K8、K9） | 0 | 1（K10） |
| 对比度与既有设计系统一致性 | 6 | 2（C7、C8） | 0 | 1（C9） |
| 屏幕阅读器文案（含 `--` 与倒计时） | 4 | 2（R5、R6） | 0 | 0 |
| 错误提示可感知性 | 5 | 1（E6） | 0 | 0 |
| **小计** | **37** | **11** | **1** | **2** |

**仍然不得据此把 issue #53 验收第 4 条勾为完成**：K10（真机 VoiceOver/TalkBack 全流程）与 C9（动态字体）保持未覆盖，iOS 窄屏布局与真机 TTS 回退链同样未跑（§9）。

## 1. 语义结构与标题层级

| # | 结论 | 证据 | 说明 |
| --- | --- | --- | --- |
| S1 | 通过 | `src/ui/src/shared/app/LearningApp.tsx:103`、`src/ui/src/shared/app/pages.ts:12` | 页面唯一 `<h1>` 取 `pages.ts` 的路由 label（长期复习），长期复习页内只用 `<h2>`，无跳级（h1→h2）。 |
| S2 | 通过 | `LongtermDashboard.tsx:87-90`、`ReviewSession.tsx:261-263`、`EarlyPractice.tsx:190-192` | 每个 `<section>`/`<article>` 都用 `aria-labelledby` 指向自身 `<h2>`（`longterm-dashboard-title` / `longterm-session-title` / `longterm-selection-title`）。 |
| S3 | 通过 | `LongtermDashboard.tsx:86-149`、`ReviewSession.tsx:260-452` | 会话视图是 `<article>` 而非 `<div>`；`role="group"` 只用于按钮组（`ReviewSession.tsx:239,302,328`、`EarlyPractice.tsx:196,209`），未滥用 `group` 代替 `region`。 |
| S4 | 通过 | `ReviewSession.tsx:186-256` | `loading`/`empty`/`failed`/`completed`/`abandoned` 五个分支各自是独立 `<article>`，同一时刻只渲染一个，`longterm-session-title` 这个硬编码 id 不会重复。 |
| S5 | 通过 | `LearningApp.tsx:131-134` | `page === "longterm"` 才渲染 `LongtermReview`，不会与背诵/听写页的同名 id 同屏。 |
| **S6** | 缺陷（中）→ **未修** | `LongtermDashboard.tsx:87-148` | 开启会话后，DOM 顺序仍是「指标面板（含 `返回今日复习首页`、`刷新指标`）→ 会话面」。焦点由 `ReviewSession.tsx:106` 的 `input.current?.focus()` 移到输入框，键盘用户无碍；但**屏幕阅读器虚拟光标**（VoiceOver swipe / NVDA browse）必须先穿过整张指标表与两个按钮才到达题目。**#53-D 未修**：加 `inert` 或调整 DOM 顺序都只能靠真实 VoiceOver/NVDA 确认朗读顺序是否真的改善，而 K10（真机走查）本轮未覆盖；jsdom 只能断言属性、不能断言虚拟光标路径，风险大于收益。登记为 K10 真机走查项。 |

## 2. `aria-label` / `scope="row"` / 可访问名称

| # | 结论 | 证据 | 说明 |
| --- | --- | --- | --- |
| A1 | 通过 | `LongtermDashboard.tsx:36`、`:40` | 指标表 `aria-label="长期学习统计指标"`，四个 `<th scope="row">` 与数值一一配对；定向用例 `longterm-dashboard.test.tsx:70` 用 `getByRole("rowheader", { name: "7 日正确率" })` 断言，等于把 `scope="row"` 写进了测试。 |
| A2 | 通过 | `EarlyPractice.tsx:247-259` | 错题本表 `aria-label="错题本卡片列表"` + 五个 `<th scope="col">`。 |
| A3 | 通过 | `EarlyPractice.tsx:270-280` | 每行复选框有 `aria-label={`选择 ${card.displaySpelling}`}`，不会读成裸的「复选框」。 |
| A4 | 通过 | `EarlyPractice.tsx:196-221`（未改动） | 筛选与排序各是一个带名字的 `role="group"`（`筛选错题本` / `排序错题本`），两组同名按钮（`全部`/`最近答错` 等）因此不会歧义。 |
| A5 | 通过 | `ReviewSession.tsx:327-343` | 输入框用显式 `<label htmlFor="longterm-answer">英文拼写</label>`，`getByLabelText("英文拼写")` 在 4 个用例中被用作定位锚点。 |
| A6 | 通过 | `LearningApp.tsx:111-115`、`LongtermDashboard.tsx:143-145`、`ReviewSession.tsx:448-450`、`EarlyPractice.tsx:193-195` | 路由副标题、空态与「提前练习不改变到期时间」都写成完整句子，不依赖颜色或图标传达含义。 |
| **A7** | 缺陷（低）→ **已修** | `EarlyPractice.tsx:246-286` | 行头 `<th scope="row">`（拼写）原位于第 **2** 格、第 1 格是复选框 `<td>`，朗读器按列序走时先听到裸复选框。**已修**：拼写移到第 1 列、复选框列移到末列并保留 `选择` 的 `<th scope="col">`；行头与 `aria-label={`选择 ${spelling}`}` 语义不变。用例 `longterm-early-practice.test.tsx` → `reads the wrong book with the §8.2 default page and shows each card once` / `freezes every generation of one card as its own entry`（均以 `rowheader` 与 `getByLabelText("选择 …")` 定位）。 |
| **A8** | 缺陷（低）→ **已修** | `LongtermDashboard.tsx:41-47` | 单元格文本曾是 `{row.value}` 与视觉隐藏的 `row.detail` **相邻无分隔**，朗读器会连读成「12 张今日到期 12 张卡片」。**已修**：两者之间加一个空格（`{" "}`），视觉无变化、朗读分成两个事实。用例 `longterm-dashboard.test.tsx` → `renders the four §8.3 metrics and offers the 今日复习 entry` / `shows -- and never 0% when the 7-day denominator is zero`。 |

## 3. `aria-live` / `role` / `aria-busy`

| # | 结论 | 证据 | 说明 |
| --- | --- | --- | --- |
| L1 | 通过（修复后仍成立） | `ReviewSession.tsx:270-283` | 评分结果与等待提示放在**常驻**的 `role="status" aria-live="polite"` 节点里（内容为空时节点仍在），这是 live region 的正确写法；用例 `longterm-review-session.test.tsx:434` 断言了 `aria-live="polite"`。 |
| L2 | 通过 | `LongtermDashboard.tsx:94`、`EarlyPractice.tsx:232`、`ReviewSession.tsx:190` | 三处加载态都用 `role="status"` 文案（正在加载长期学习指标… / 正在读取错题本… / 正在准备本轮复习…），配合 `aria-busy`。 |
| L3 | 通过 | `LongtermDashboard.tsx:92`、`ReviewSession.tsx:279`、`EarlyPractice.tsx:231` | 三个数据区都写了 `aria-busy={…}`（`true`/`false` 都显式输出），提交中/读取中状态对 AT 可读。 |
| L4 | 通过 | `LongtermDashboard.tsx:95-100`、`ReviewSession.tsx:314-318,382-386`、`EarlyPractice.tsx:233-238,307-311` | 失败与提示用 `role="alert"`（assertive），错误可被立即打断播报。 |
| **L5** | 缺陷（中）→ **已修** | `ReviewSession.tsx:270-289` + `session.ts:110-131` + `useReviewSession.ts:457-474` | 倒计时文案 `waitNotice(waitMs)` 里含 `formatCountdown(waitMs)`，而 `waitMs` 每秒由 `COUNTDOWN_TICK_MS = 1000`（`useReviewSession.ts:111`）的 `setInterval` 递减，同一个 `aria-live="polite"` 节点每秒变一次 → 朗读器每分钟播报约 60 次。**已修**：拆成同一行的两个节点——live 区只写一次性文案 `WAIT_NOTICE = "这张卡在等待，稍后自动刷新。"`（`session.ts:116`，不含秒数），秒数移到 live 区**之外**的 `<span class="longterm-countdown" role="timer">`（隐式 `aria-live="off"`，可按需读取、不会被逐秒播报），视觉位置不变（`.longterm-notice-row` flex 行）。用例 `longterm-review-session.test.tsx` → `keeps the countdown seconds out of the live region`（断言 status 节点无 `0:nn`、timer 节点有「剩余 0:4」且无 `aria-live="polite"`）；`longterm-session-rules.test.ts` → `keeps the seconds out of the polite announcement`。 |
| **L6** | 缺陷（低）→ **已修（随 D2 一并处理）** | `ReviewSession.tsx:280-283`、`session.ts:124-126` | 朗读按钮的可见文字在「重新朗读」↔「朗读中…」之间切换，却没有任何 live 区域播报播放状态。**已修**：把 `audio` 接入同一个一次性 live 区，`audioNotice("playing")` 返回「正在朗读本词，可以同时开始拼写。」（顺带明确告知播放中即可作答，正对应 D1 的「播放开始即开闸」）；`idle`/`failed` 返回空串，失败仍由独立 `role="alert"` 承担。用例 `longterm-session-rules.test.ts` → `keeps the seconds out of the polite announcement`（断言三个状态）。 |

## 4. 键盘可达与焦点顺序

| # | 结论 | 证据 | 说明 |
| --- | --- | --- | --- |
| K1 | 通过 | `src/ui/src/shared/styles/base.css:68-74` | 全局 `button/input/select/a:focus-visible { outline: 3px solid #b28b48; outline-offset: 4px }` 自动覆盖 #53 的所有控件（焦点环 3.14:1，满足 SC 1.4.11 的 3:1）。 |
| K2 | 通过 | `ReviewSession.tsx:319-325`、`:340`、`:344` | 提交按钮在 `<form>` 内且带 `enterKeyHint="done"`，回车即提交；`onSubmit` 里 `preventDefault`。 |
| K3 | 通过 | `ReviewSession.tsx:298-317,326-341,349-368,386-446` | 所有交互都是真 `<button type="button">`/`type="submit"`，无 `onClick` 挂在 `div`/`span` 上；放弃确认与取消各是一个按钮。 |
| K4 | 通过 | `ReviewSession.tsx:100-107` | 新条目到达时 `input.current?.focus()`，焦点随题走；用例 `longterm-review-session.test.tsx:436` 断言 `input).toHaveFocus()`。 |
| K5 | 通过 | `useReviewSession.ts:288,315,395` | `writing.current` 串行化 + `busy` 禁用按钮，键盘快速回车不会重复提交；用例 `longterm-review-session.test.tsx:298-314`。 |
| K6 | 通过 | `LongtermDashboard.tsx:106-116` | 首页入口是 `<button>`，用例 `longterm-dashboard.test.tsx:61-64` 显式 `entry.focus()` 后断言仍有焦点。 |
| K7 | 通过 | `EarlyPractice.tsx:264-269` | 复选框是原生 `<input type="checkbox">`，空格键切换，不需要自绘键盘处理。 |
| **K8** | 缺陷（中）→ **已修** | `ReviewSession.tsx:400-447` | 放弃二次确认曾是**内联替换**：`放弃本轮` / `返回首页` 被卸载、确认区新按钮挂载，焦点在点击瞬间落到 `<body>`（SC 2.4.3），且不是模态、没有 `role="alertdialog"`。**已修**：确认区常驻 DOM、只用 `hidden` 切换（触发按钮永不被卸载）；加 `role="alertdialog"` + `aria-labelledby`/`aria-describedby` + `tabIndex={-1}`；`confirming` 变 true 时把焦点移进确认区；`Escape` 与「继续复习」等价。用例 `longterm-review-session.test.tsx` → `moves focus into the abandon confirmation and hands it back`。 |
| **K9** | 缺陷（低）→ **已修** | `ReviewSession.tsx:413-419,437-443` | 焦点从确认区退回时曾没有归还策略（点「继续复习」后焦点回到 `body`）。**已修**：`abandonTrigger` ref 在「继续复习」与 `Escape` 两条关闭路径上都把焦点归还触发按钮。用例 `longterm-review-session.test.tsx` → `moves focus into the abandon confirmation and hands it back`。 |
| **K10** | **未覆盖/待真机（#53-D 维持不勾选）** | — | §12.3 第 836 行要求的「macOS 与 iOS 的键盘、触控、前后台切换、可访问性标签和动态字体」需要 VoiceOver/TalkBack 实机走查；本轮只有 jsdom 断言，**不得据此把 issue #53 验收第 4 条勾为完成**。 |

## 5. 对比度与既有设计系统一致性

计算式：WCAG 相对亮度，`(L1+0.05)/(L2+0.05)`。底色 `.study-card` 为 `#fff`（`base.css:214-222`），页面底 `#f5f6f1`（`base.css:9`）。

| # | 结论 | 前景 / 背景 | 比值 | 说明 |
| --- | --- | --- | --- | --- |
| C1 | 通过 | `#263c35` / `#fff` | **11.80** | 正文继承色。 |
| C2 | 通过 | `#4f6349` / `#fff` | **6.54** | `.longterm-metrics th`（`learning.css:926-928`）与 `.longterm-cards thead th`（`:1015-1017`）。 |
| C3 | 通过 | `#2f4634` / `#fff` | **10.26** | 指标数值 `.longterm-metrics td`（`:930-934`）。 |
| C4 | 通过 | `#263c35` / `#fdf3ef` | **10.81** | `.longterm-failure` 正文（`:957-967`）继承正文色。 |
| C5 | 通过 | `#617652` / `#fff` | **4.97** | `.badge`（`base.css:165-170`），新用法在 `LongtermDashboard.tsx:87`、`ReviewSession.tsx:219`、`EarlyPractice.tsx:191`。 |
| C6 | 通过 | `#b28b48` / `#fff` | **3.14** | 全局焦点环，达 SC 1.4.11 的 3:1（非本 issue 引入）。 |
| **C7** | 缺陷（中）→ **已修（作用域内）** | `#66705f` / `#fff` | **4.57**（页底 `#f5f6f1` 上 **4.18**） | 既有 `.muted`（`base.css:228-232`，`#849081`，白底 3.34:1）未达 4.5:1，而 #53 把它用在了承载**事实**的文案上：`LongtermDashboard.tsx:91`（正确率口径）、`:144`（空态）、`ReviewSession.tsx:209`（今日无到期卡）、`:244-247`（终态与计数）、`:264-268`（**进度** `第 3 / 20 张`）、`:448-450`（**提前练习不改变到期时间**）、`EarlyPractice.tsx:193-195`（同一条区分说明）、`:297`（已选计数）。**已修**：`learning.css:980-982` 新增长期复习作用域的 `.longterm-muted`（`#66705f`），#53 的 16 处使用点全部改为 `muted longterm-muted`（`.longterm-muted` 与 `.muted` 同特异性但 `learning.css` 在 `base.css` 之后加载，故生效）。**`.muted` 本身未全局调暗**——影响面覆盖全部页面，属产品/应用负责人决策，登记为待决策项（见 §11）。 |
| **C8** | 缺陷（低-中）→ **已修** | `learning.css:1055-1068` + `mobile.css:19-23` | 触控区 44×44 | 错题本复选框曾写死 `24px × 24px`，而 `mobile.css:21-23` 的 44px 最小高度规则**显式排除** checkbox（`input:not([type="checkbox"])`），iOS 上可点区域就是 24×24。**已修**：`box-sizing: content-box` + `padding: 10px`，绘制仍是 24×24、命中区 44×44，与同批按钮的 `min-height: 44px`（`learning.css:1021-1027`）一致。用例 `longterm-early-practice.test.tsx` → `reads the wrong book with the §8.2 default page and shows each card once`（`mobile.css` 规则本身仍需真机 iOS 复核，登记为 §9 待真机项）。 |
| **C9** | **未覆盖/待真机（#53-D 维持不勾选）** | — | — | §12.3 的**动态字体**：新增样式全部用 px（`font-size: 22/24/18/14px`），iOS 动态字体不会缩放。与既有设计系统一致（`:root { font-size: 15px }` 但各处仍写 px），属现状延续；建议长期改 `rem`，本 issue 不作为阻断。 |

## 6. 屏幕阅读器文案

| # | 结论 | 证据 | 说明 |
| --- | --- | --- | --- |
| R1 | 通过 | `dashboard.ts:76-89,105-137`、`LongtermDashboard.tsx:41-47`、`learning.css:937-948` | **§8.3 的 `--` 有口播说明**：可见值是 `--`（分母为 0，绝不 `0%`），紧跟一个视觉隐藏（`position:absolute` + `clip-path: inset(50%)` + 1px）的句子「最近 7 日没有正式复习首次作答，正确率暂无数据」。用例 `longterm-dashboard.test.tsx:67-84` 同时断言了「有 `--` 无 `0%`」「有这句说明」「真 0 仍显示 `0%`」。这是本次核对里做得最扎实的一条。 |
| R2 | 通过 | `dashboard.ts:84-89` | 非 0 但四舍五入归零的真值渲染为 `<1%` 而不是 `0%`，用例 `longterm-dashboard.test.tsx:86-94` 覆盖，避免「读成 0%」的误导。 |
| R3 | 通过 | `session.ts:80-83`、`ReviewSession.tsx:264-269` | 进度拆成两个 `<span>`（`第 3 / 20 张` 与「计入今日复习统计」/「提前练习不计入今日到期」），注释明确说明「让每个事实有自己的标签」；用例 `longterm-review-session.test.tsx:428`、`longterm-session-rules.test.ts:79-90` 覆盖。 |
| R4 | 通过 | `useReviewSession.ts:121-149`、`dashboard.ts:62-74`、`session.ts:145-157` | 每个 §9.2 稳定码都有中文句子，无码失败走通用技术性失败句「技术性失败，未记录任何作答，请重试。」；**原生 message 一律不上屏**（§9.2「默认不把 SQL 文本或文件路径发给 UI」），用例 `longterm-session-rules.test.ts:125-137`、`longterm-dashboard-ipc.test.ts:65` 断言。 |
| **R5** | 缺陷（中）→ **已修（随 L5）** | 见 L5 | 修复后状态 | **倒计时播报**：秒级数字不再进入 polite live 区，改由 live 区外的 `role="timer"` 承载（隐式 `aria-live="off"`），一次性文案「这张卡在等待，稍后自动刷新。」承担播报。用例 `longterm-review-session.test.tsx` → `keeps the countdown seconds out of the live region`。 |
| **R6** | 缺陷（低）→ **已修（随 L5）** | `ReviewSession.tsx:270-289` + `session.ts:95-104` | — | 一次性结果与逐秒倒计时曾共用同一个 live 节点，`outcome` 会被倒计时文本顶掉。**已修**：两者分属不同节点（live 区只放一次性文案、`role="timer"` 只放秒数），`outcome ? gradeNotice(...) : …` 的优先级显式写在 live 区里。用例 `longterm-review-session.test.tsx` → `submits the entry version verbatim and advances from the response`（结果文案仍出现在 status 节点）+ `keeps the countdown seconds out of the live region`。 |

## 7. 错误提示可感知性

| # | 结论 | 证据 | 说明 |
| --- | --- | --- | --- |
| E1 | 通过 | `LongtermDashboard.tsx:95-100`、`ReviewSession.tsx:222-233,382-386`、`EarlyPractice.tsx:233-238` | 每处失败都同时具备：可读中文句子 + `role="alert"` + 内联「重试」按钮；重试走显式动作而不是自动重发。 |
| E2 | 通过 | `useReviewSession.ts:348-380` | §9.2 的三类失败语义分开落地：`LONGTERM_ITEM_NOT_READY` 走 `nextAvailableAt` 倒计时；`VERSION_CONFLICT`/`IDEMPOTENCY_CONFLICT`/`SESSION_FINISHED` 丢弃 pending token 并重读条目（§9.2「刷新对象后由用户动作决定」「不得自动重试」）；其余（含 §8.4 技术失败与存储失败）**保留当前题与 pending 尝试**，重试重发同一条命令。 |
| E3 | 通过 | `ReviewSession.tsx:314-318` | TTS 失败有独立 `role="alert"`，并明确告知「未记录任何作答」（§14.2-11、§8.4）。 |
| E4 | 通过 | `EarlyPractice.tsx:121-132` | `LONGTERM_CURSOR_INVALID` 不重试旧游标，而是清空列表回到第一页并给出说明（§9.2「从首页重查」）。 |
| E5 | 通过 | `LongtermDashboard.tsx:142-146` + 用例 `longterm-dashboard.test.tsx` → `never claims an empty day while the read is still pending` | 空态只在 `status === "ready"` 时才敢声明，读取未完成时不谎称「今日无到期卡」（避免把技术失败说成事实）。 |
| **E6** | 缺陷（低）→ **已修** | `EarlyPractice.tsx:294-306` + `learning.css:1014-1019` | — | 选择区的校验文案（「请至少选择 1 张卡片…」/「提前练习最多选择 100 张卡片」）曾放在 `role="status"`（polite）里且用 `.muted` 13px 渲染，而它是**用户必须处理的阻塞条件**（提交按钮被禁用）。**已修**：拆成两个节点——计数留在 `role="status"`（polite），校验句改为独立的 `role="alert"` 节点 `.longterm-selection-error`（`#8a3a1c`，白底 7.77:1，非 muted）。用例 `longterm-early-practice.test.tsx` → `states the §2.4 selection bound as an alert, not a polite aside`（断言 `role="alert"`、`className` 不含 `muted`、选中后该 alert 消失）。 |

## 8. 其他跨切面发现（与可访问性/交互相关）

> 「状态」与「验证用例」两列为 #53-D 回填。「已修」指代码已改且有用例覆盖；「未修」必须写明原因。用例名可在 `tests/unit/ui/` 直接 grep。

| # | 严重度 | 位置 | 问题 | 建议 | 状态 | 验证用例 |
| --- | --- | --- | --- | --- | --- | --- |
| **已修** | 采纳「播放开始即开闸」，并把失败也纳入闸门：`:96` `const audible = spelling !== null && audio !== "failed"`；`:114-131` `playAudio` 在 `setAudio("playing")`（即 `speak()` 调用瞬间）开闸、`speak()` reject 时关闸；`:168-179` `!audible` 时**不提交**任何评分，只写 `ungraded` 并由 live 区播报 `ungradedNotice`（`session.ts:129`），实现 §8.4「无法可靠确认时宁可不计错」与 §14.2-11「技术失败不写事件」。播放中提交的正确拼写判 `good`（无 lapse、无排期重置）；`显示答案`/`跳过这张` 仍是学习者主动动作，按 §2.3 照记 `again`。 | `longterm-review-session.test.tsx` → `grades a correct answer typed while the audio is still playing`（`speak` 保持 pending，断言 `attemptResult === "good"`、`isCorrect === true`）/ `never scores a spelling when the audio could not be played`（断言 `submitAttempt` 未被调用 + live 区说明 + 重试后闸门重开）/ `keeps an entry audibly heard when a later replay fails` |
| **已修** | 见 L5：一次性 `WAIT_NOTICE` 在 live 区，秒数在 live 区外的 `role="timer"`。 | `longterm-review-session.test.tsx` → `keeps the countdown seconds out of the live region`；`longterm-session-rules.test.ts` → `keeps the seconds out of the polite announcement` |
| **已修** | 见 K8/K9：`hidden` 切换 + `role="alertdialog"` + 焦点移入 + `Escape`/「继续复习」归还焦点。 | `longterm-review-session.test.tsx` → `moves focus into the abandon confirmation and hands it back` |
| **已修** | 三个 hook 各加一个 `visibilitychange` 监听：`useLongtermDashboard.ts:80-95` 与 `useActiveFormalSession.ts:56-70` 调 `refresh()`；`useReviewSession.ts:457-479` 在 `answering` 时调 `adopt()`（**不用** `load()`，避免在 learner 正看着的题上闪 loading）并 `setNow(Date.now())` 重算被节流的倒计时。三条路径都是纯读，不写入、不重选卡、不清等待。 | `longterm-dashboard.test.tsx` → `re-reads the counters when the window comes back to the foreground`；`longterm-review-session.test.tsx` → `re-reads the entry when the window comes back to the foreground`；`longterm-review-route.test.tsx` → `re-reads the counters and the resume entry after a foreground switch`（三个用例都断言 `hidden` 状态不触发读取） |
| **已修** | 见 C7：`learning.css:980-982` 新增 `.longterm-muted`（`#66705f`，白底 4.57:1），#53 的 16 处 `.muted` 使用点全部切换；`.muted` 全局色值未动，留作待决策项。 | 无独立用例（样式断言由 `longterm-early-practice.test.tsx` → `states the §2.4 selection bound as an alert, not a polite aside` 间接覆盖「非 muted」）；对比度为按 WCAG 公式复算，见 §10 |
| **已修** | 见 C8：`box-sizing: content-box` + `padding: 10px`，命中区 44×44、绘制仍 24×24。真机 iOS 仍需复核（§9 第 4 项）。 | 样式无 jsdom 断言（jsdom 不计算布局）；间接覆盖见 `longterm-early-practice.test.tsx` → `reads the wrong book with the §8.2 default page and shows each card once` |
| **已修** | 见 E6：计数留在 polite `role="status"`，校验句改为独立 `role="alert"` + `.longterm-selection-error`（`#8a3a1c`）。 | `longterm-early-practice.test.tsx` → `states the §2.4 selection bound as an alert, not a polite aside` |
| **已修** | 删除 `PendingReviewSession.tsx`，接缝类型移到 `reviewSessionHandle.ts`（14 行，仅 `LongtermReviewSessionHandle`）；`LongtermDashboard.tsx:146-149` 改为 `{reviewing && renderSession?.(session)}`，无接缝时不再渲染占位会话（真实路由永远传 `renderSession`）。 | `longterm-dashboard.test.tsx` → `opens the review flow without creating a session on the home page` 改为自带接缝替身，保留「首页不创建会话」原断言 |
| **未修** | 实现本身正确（属观察项，非缺陷）。抽公共类要动 `base.css` 这个全仓共享样式文件，收益是纯代码风格、风险是影响所有页面，且与 D5「不要全局改 `.muted`」同一类决策，故不在本波次做；登记为后续设计系统项（§11）。 | 无（无行为变化） |
| **已修** | 见 A7：拼写行头移到首列、复选框列移到末列。 | `longterm-early-practice.test.tsx` → `reads the wrong book with the §8.2 default page and shows each card once` / `freezes every generation of one card as its own entry` |
| **已修** | 见 A8：值与视觉隐藏说明之间加空格。 | `longterm-dashboard.test.tsx` → `renders the four §8.3 metrics and offers the 今日复习 entry` |
| **未修** | 引入 `axe-core`/`vitest-axe` 需要新增依赖并锁版本，属于全仓测试基建决策，不应由 #53 单方面决定；本波次把断言从 40 处加到 45 处（新增 `getByRole("timer")`、`role="alertdialog"` 的 `toHaveAccessibleName`、`role="alert"` 的 `className` 检查）作为过渡。归属 #55-C 统一决定（§11）。 | 无 |

## 9. 未覆盖 / 待真机 / 待回填

1. **真机 VoiceOver / TalkBack 全流程（K10，保持未覆盖、不得勾选）**：§8.1 首页 → 今日复习 → 答题 → 一分钟等待 → 放弃确认 → 提前练习选卡。iOS 与 macOS 各一轮。jsdom 侧的焦点顺序（K8/K9）、live 区拆分（D2）与行头列序（A7）都已有用例，但**朗读器的实际朗读顺序与打断行为无法在 jsdom 断言**，S6（虚拟光标要先穿过指标表）也因此仍未修。
2. **真机 TTS 回退链**：§8.4 的「来源音频 → 平台原生 TTS → WebView TTS」三级回退、权限拒绝、设备不可用。前端只调用既有 `speak()`（`features/speech/speech.ts`），未新增回退逻辑；#53 未覆盖的正是 §14.1 第 866 行的「TTS 与首页/详情在 macOS/iOS 一致」。
3. **前后台切换（jsdom 已覆盖）与动态字体（仍未覆盖）**：D4 已在 jsdom 侧覆盖（三个 hook 的 `visibilitychange` 纯读重读，见 §8 的验证用例），但**后台被节流的真实行为、系统级缓存与跨窗口写入仍需真机**；C9（动态字体）保持未覆盖——#53 的新增样式仍写 px，与既有设计系统一致，不作为本 issue 的阻断项。
4. **iOS 窄屏布局**：`mobile.css` 无任何 `.longterm-*` 规则；`.longterm-cards` 是 5 列表格且 `width: 100%`，未包横向滚动容器，320pt 宽度下未实测。
5. **清理 #51/#52 的失效事件（未修，跨 issue）**：§8.1 要求「清除、来源状态改变后必须失效首页计数」。`handle.refresh()` 只在**本会话提交/放弃**后触发（`useReviewSession.ts:368,430` → `LongtermDashboard.tsx:79-84`）；#51 的清除入口与 #52 的来源状态入口尚未接到这个 `refresh`，属于跨 issue 遗留（D4 的回前台重读只是兜底，不能替代显式失效）。
6. **group size 可配置 UI**：§2.4 的「5–100 可配置」当前只有常量 `LONGTERM_FORMAL_SIZE_DEFAULT = 20`（`native/longterm.ts:338`，`LongtermReview.tsx:40` 传入），首页没有调整组大小的控件。§2.4 只要求可配置而非必须有 UI 控件，故不判为缺陷。
7. **本节与 #55 小节的联动（已更新）**：`long_learn.md` 的 `### #55 发布清单与文档校对` 中 P7（§14.2-11 无用例）与 P11（§14.1 第 866 行依赖 #53）——#53 已补 §8.4/§14.2-11 的**前端**用例，**D1 修复后「播放中提交」不再写出错误的 `again`，且无法确认可听时宁可不提交，因此 P7 的前端侧条件已满足、可由 #55-C 关闭**；P11 仍需真机（见第 2 项）。归属仍为 #55-C，请 #55-D/#55-C 按本文件更新 P7/P11 结论（本节不代改）。

8. **待决策项（不属于缺陷）**：`.muted`（`#849081`，白底 3.34:1）是否**全局调暗**——影响面覆盖全部页面（背诵、听写、对话、设置…），需产品/应用负责人决定；#53 只在自己的作用域内用 `.longterm-muted` 绕开（D5/C7）。

9. **后续设计系统项**：把 `learning.css:937-948` 的视觉隐藏模式抽成共享 `.visually-hidden`（D9）。

10. **测试基建项**：引入 `axe-core`/`vitest-axe` 并对四个长期复习视图加「零 violation」用例（D12），归属 #55-C 统一决定。

## 10. 复算命令

```text
git -C <worktree> log --oneline -2                 # 7d91520c / 855e1db0（核对基线）
npx vitest run --config tests/vitest.config.ts \
  tests/unit/ui/longterm-{dashboard,dashboard-ipc,review-route,review-session,session-ipc,session-rules,early-practice}.test.ts{,.ts}x
# 核对基线：7 files / 78 tests passed（2026-10-04 22:42）
# #53-D 修复后：7 files / 87 tests passed（2026-10-04 23:2x）；含 longterm-ipc/longterm-ordinary-error 共 10 files / 102 tests passed
npm run typecheck                                # @quicklang/ui tsc --noEmit，0 error
node scripts/format.mjs --check                  # 347 files, 0 unformatted
grep -rn 'clip-path: inset(50%)' src/ui/src/shared/styles/    # 仅 learning.css:944（D9 未抽公共类）
grep -rn 'axe' package.json                                   # 零命中（D12 未引入）
grep -rn 'visibilitychange' src/ui/src/shared/features/longterm/  # 3 处：三个 hook 各一（D4）
grep -rn 'role="timer"' src/ui/src/shared/features/longterm/      # 1 处：ReviewSession（D2）
```

**对比度复算（WCAG 2.1 相对亮度，`.study-card` 底 `#fff`、页面底 `#f5f6f1`）**：`#66705f` → 白底 **4.57:1**、页底 **4.18:1**（`.longterm-muted`，D5）；`#8a3a1c` → 白底 **7.77:1**（`.longterm-selection-error`，D7）；`#849081`（`.muted`，未改）→ 白底 3.34:1。