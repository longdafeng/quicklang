# 0.7 长期学习模块 · 模型官网价调研与费用换算口径

> 关联 Issue：[#45](https://github.com/anomalyco/opencode/issues/45) 0.7.0 长期错题学习记录与长期复习
> 配套文档：[`long_learn_execution_report.md`](./long_learn_execution_report.md)（执行报告主档）
> 查证时间：**2026-10-04 22:40–22:50 CST**（下文所有"查证时间"均为该窗口）
> 数据源：各模型**厂商官方定价页** + **OpenCode Zen 官方定价页** + 二次核证（隐匿模型社区追踪站）
> 状态：🟡 **草稿** — 费率版本 `v2026-10-04-01`，收尾时需按「刷新指引」复核一次

---

## 1. 结论摘要（TL;DR）

| #   | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 本项目全部 8 个可用模型**都通过 OpenCode Zen 免费通道**调用，OpenCode Zen 官方定价页对它们一律标注 **Input / Output / Cached Read = "Free"**，即**实际支付 $0**。                                                                                                                                                                                                                                                                                                        |
| 2   | 但"实际支付 $0"不等于"无价可考"。其中 **3 个有真实厂商官网牌价**（LongCat-2.5-Preview / MiMo-V2.6-Flash / Ling-3.1-Flash），可换算出"若按官网付费通道"的**真实成本口径**。                                                                                                                                                                                                                                                                                               |
| 3   | 另外 5 个（**Fledge Alpha / Space Bunny / Big Pickle / Nemotron 3.5 Lightning / Muse Spark 1.3 Contributor**）调研结论分两类：<br>• **Fledge Alpha / Space Bunny / Big Pickle** = **隐匿模型（stealth model）**，厂商未公开、底层未认领 → **无公开定价**。<br>• **Nemotron 3.5 Lightning / Muse Spark 1.3 Contributor** = **真实公开产品**（NVIDIA / Meta），有底层公开牌价，但**我们用的那个 SKU 在 Zen 上是 Free**，且底层牌价由第三方托管商各自加价、无单一"官网价"。 |
| 4   | **无公开定价的 3 个隐匿模型一律按 `$0` 计价，但完整保留 token 用量统计**——这是本项目的既定口径（见 §5）。**任何情况下都不得为其编造价格。**                                                                                                                                                                                                                                                                                                                              |
| 5   | **Ling-3.1-Flash 无官网价**，按**同厂 Ling-3.0-flash 现行价**作参照。已**逐列复核** `$0.021 / $0.0042 / $0.063` 的对应关系 = **输入 / 缓存读 / 输出**，**原看板假设正确**，复核依据见 §4。                                                                                                                                                                                                                                                                               |
| 6   | 8 个模型的 **`tokens_cache_write` 全库合计 = 0**，OpenCode 会话库未上报缓存写 token；且 Zen 定价表对全部 8 个模型的 "Cached Write" 列一律为 `-`。→ **缓存写单价按 0 处理并在本文档显式注明**（见 §5）。                                                                                                                                                                                                                                                                  |

---

## 2. 官方价主表（每 100 万 tokens，USD）

> 「本项目计价」列 = 执行报告费用列实际采用的费率。
> 「公开产品」= 是否有可识别的厂商与官方产品页。

| 模型                            | 模型 ID                           | 是否公开产品                                                           |                                                                                                       官方价 输入 · 缓存读 · 输出（$/1M） |                           本项目计价 | 来源 URL                                                                                                                                                                                                                                       | 查证时间   | 结论                                                                                                                                                       |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------: | -----------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LongCat-2.5-Preview**（美团） | `longcat-2.5-preview-free`        | ✅ 是                                                                  |                                                                                                                   **0.30 · 0.006 · 1.20** |                  0.30 / 0.006 / 1.20 | [longcat.chat 定价页](https://longcat.chat/platform/docs/zh/pricing/longcat-2.5) · [按量付费说明](https://longcat.chat/platform/docs/zh/api-pay-as-you-go)                                                                                     | 2026-10-04 | ✅ **有官网价，可计价**（限时折扣价，¥2 / ¥0.04 / ¥8）                                                                                                     |
| **MiMo-V2.6-Flash**（小米）     | `mimo-v2.6-flash-free`            | ✅ 是                                                                  |                                                                                                                  **0.14 · 0.0028 · 0.28** |                 0.14 / 0.0028 / 0.28 | [mimo.mi.com 模型页](https://mimo.mi.com/models/zh-CN/mimo-v2.6-flash) · [按量计费 API 定价](https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go)                                                                                               | 2026-10-04 | ✅ **有官网价，可计价**（海外价；国内价 ¥1 / ¥0.02 / ¥2）                                                                                                  |
| **Ling-3.1-Flash**（蚂蚁百灵）  | `ling-3.1-flash-free`             | ✅ 是                                                                  |                                                                        **无官网价** → 参照 **Ling-3.0-flash**：**0.021 · 0.0042 · 0.063** | 0.021 / 0.0042 / 0.063（**参照价**） | [developer.ant-ling.com 定价页](https://developer.ant-ling.com/zh-CN/docs/models/price/) · [英文版](https://developer.ant-ling.com/en/docs/models/price/)                                                                                      | 2026-10-04 | ⚠️ **Ling-3.1 未在定价表内**（页面 Last updated 2026-09-23），按同厂 3.0-flash 换算。**已复核，映射正确**（§4）                                            |
| **Fledge Alpha**                | `fledge-alpha-free`               | ❌ **否**（隐匿模型，厂商 unknown，疑似 router）                       |                                                                                                                            **无公开定价** |                               **$0** | [Zen 定价页](https://opencode.ai/docs/zen/)（Free/Free/Free）· [stealthmodels.com/fledge-alpha](https://stealthmodels.com/fledge-alpha/)（"MAKER unknown"）                                                                                    | 2026-10-04 | ❌ **无公开定价 → 按 $0 计价但保留 token 用量**。无底层厂商牌价可参照                                                                                      |
| **Space Bunny**                 | `space-bunny-free`                | ❌ **否**（隐匿模型，2026-09-23 上线，**尚未认领**，社区疑为 minimax） |                                                                                                                            **无公开定价** |                               **$0** | [Zen 定价页](https://opencode.ai/docs/zen/)（Free/Free/Free）· [spacebunny.site/stealth-models](https://spacebunny.site/stealth-models/)（"Unclaimed (MiniMax suspected)"）                                                                    | 2026-10-04 | ❌ **无公开定价 → 按 $0 计价但保留 token 用量**。若日后认领为 minimax M3 系列，可参照 [Zen MiniMax M3 = 0.30 / 0.06 / 1.20](https://opencode.ai/docs/zen/) |
| **Big Pickle**                  | `big-pickle`                      | ❌ **否**（OpenCode 隐匿模型，**未认领**）                             |                                                                                                                            **无公开定价** |                               **$0** | [Zen 定价页](https://opencode.ai/docs/zen/)（Free/Free/Free）· [spacebunny.site/stealth-models](https://spacebunny.site/stealth-models/)（点名 Big Pickle 为 OpenCode 隐匿模型）                                                               | 2026-10-04 | ❌ **无公开定价 → 按 $0 计价但保留 token 用量**。社区曾猜 GLM 系，**无证据，不作参照**                                                                     |
| **Nemotron 3.5 Lightning**      | `nemotron-3.5-lightning-free`     | ✅ **是**（NVIDIA，开源权重，OpenMDW-1.1）                             |                **本通道无公开定价**（Zen Free/Free/Free）。<br>**底层参照价（第三方托管，各家不同）**：$0.05–0.069 输入 / $0.20–0.29 输出 |                               **$0** | [Zen 定价页](https://opencode.ai/docs/zen/)（Free/Free/Free）· [build.nvidia.com 模型页](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)（NVIDIA 试用条款，**未列单独牌价**）                                                  | 2026-10-04 | ⚠️ **真实公开产品**，但**无单一官网价**（NVIDIA build 端点为试用制、不标价）。按 **$0** 计价；参照价区间见 §3.4                                            |
| **Muse Spark 1.3 Contributor**  | `muse-spark-1.3-contributor-free` | ✅ **是**（Meta）                                                      | **本通道 Free**（Zen Free/Free/Free）。<br>**底层公开牌价**：Contributor 档 **$0.10 · $0.002 · $0.20**；Standard 档 $1.25 · $0.15 · $4.25 |                               **$0** | [Zen 定价页](https://opencode.ai/docs/zen/)（Free/Free/Free + 隐私条款指向 Meta contributor 档）· [dev.meta.ai/models/muse-spark](https://dev.meta.ai/models/muse-spark) · [Meta 定价与限流文档](https://dev.meta.ai/docs/pricing-rate-limits) | 2026-10-04 | ⚠️ **真实公开产品，有官方牌价**；但我们调用的 Zen 免费 SKU 不计费。按 **$0** 计价；**该 SKU 本次 token 用量为 0**，两种口径同为 $0                         |

### 2.1 OpenCode Zen 免费档一览（8 个模型的"通道价"权威依据）

来源：[OpenCode Zen 官方文档 · Pricing 表](https://opencode.ai/docs/zen/)（页面标注 Last updated **Oct 3, 2026**）与 [Console Models 页](https://opencode.ai/v2/docs/console/models/)。两页内容一致。

| Model（Zen 目录名）             | Input | Output | Cached Read | Cached Write |
| ------------------------------- | ----- | ------ | ----------- | ------------ |
| Big Pickle                      | Free  | Free   | Free        | **-**        |
| Space Bunny Free                | Free  | Free   | Free        | **-**        |
| LongCat 2.5 Preview Free        | Free  | Free   | Free        | **-**        |
| Fledge Alpha Free               | Free  | Free   | Free        | **-**        |
| MiMo-V2.6-Flash Free            | Free  | Free   | Free        | **-**        |
| Ling 3.1 Flash Free             | Free  | Free   | Free        | **-**        |
| Nemotron 3.5 Lightning Free     | Free  | Free   | Free        | **-**        |
| Muse Spark 1.3 Contributor Free | Free  | Free   | Free        | **-**        |

Zen 对这批模型的统一说明（原文要点）：

- **Fledge Alpha / MiMo-V2.6-Flash / Ling 3.1 Flash / Nemotron 3.5 Lightning / Muse Spark 1.3 Contributor**：「available on OpenCode for a limited time. The team is using this time to collect feedback and improve the model.」→ **限时免费**，随时可能下线或转收费。
- **Big Pickle**：「a stealth model that's free on OpenCode for a limited time」→ **官方自认隐匿模型**。
- **Space Bunny Free / LongCat 2.5 Preview Free**：「free for a limited time. Its provider follows a **zero-retention policy** and does not use your data for model training.」→ 这两个是**唯一零保留**的通道。
- **Muse Spark 1.3 Contributor Free** 隐私条款：「Heavily discounted token pricing in exchange for permission to use your prompts and completions to train future Meta models」→ 见 §3.5。
- 信用卡手续费：「passed along at cost (4.4% + $0.30 per transaction)」——本项目走 free 通道，**未产生任何费用**。

> **对执行的直接影响**：Zen 上「Cached Write」列对全部 8 个模型都是 `-`（无此计价项），且本地 `opencode.db` 中 `tokens_cache_write` 全库为 0 → **缓存写单价按 0 计**，本项目实际未发生缓存写计费。已在 §5 显式注明。

---

## 3. 五个待调研模型 · 逐个详述

### 3.1 Fledge Alpha — ❌ 无公开定价

| 项               | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型 ID          | `fledge-alpha-free`（OpenCode Zen）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 是否真实公开产品 | **否**。属于"**隐匿模型（stealth model）**"范式：模型先以代号上架、厂商不署名、价格为零，官方注明开发者"has chosen to remain anonymous during this preview"。                                                                                                                                                                                                                                                                                                                                                                                               |
| 调研证据         | ① 官方 Zen 定价表标价 **Free / Free / Free**（[来源](https://opencode.ai/docs/zen/)）。<br>② 独立追踪站 [stealthmodels.com/fledge-alpha](https://stealthmodels.com/fledge-alpha/) 明确写 **"MAKER unknown"**、当前假设 **"Likely a router"**，并给出 tokenizer 指纹证据（同一 prompt 三次跑出 7,536 / 7,536 / 6,499 三种 input token 数）。<br>③ Zen 遥测页 [opencode.ai/data/unknown/fledge-alpha](https://opencode.ai/data/unknown/fledge-alpha) 路径即为 `unknown`，**Recorded spend: $0**。<br>④ models.dev 标注 **Open weights: Not listed as open**。 |
| 官方价           | **无公开定价**。无底层厂商 → 无官网牌价可参照；社区路由/指纹猜测**不构成定价依据**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 结论             | **按 $0 计价，保留 token 用量统计。严禁编造价格。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 附注             | 首次记录用量 2026-09-30，2026-10-01 上 Zen 目录，10-02 规格公布。本项目实际用量见执行报告 §2。                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 3.2 Space Bunny — ❌ 无公开定价

| 项               | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 模型 ID          | `space-bunny-free`（OpenCode Zen）；OpenRouter 上另有 `stealth/space-bunny-alpha`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 是否真实公开产品 | **否**（截至查证时间**尚未被任何厂商认领**）。                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 调研证据         | ① 官方 Zen 定价表 **Free / Free / Free**（[来源](https://opencode.ai/docs/zen/)）。<br>② [spacebunny.site/stealth-models](https://spacebunny.site/stealth-models/) 的"2026 隐匿模型全表"把 **Space Bunny Alpha（2026-09-23 上线）标为 "Unclaimed (MiniMax suspected)"**，并称社区预期 **2026-10-05 结束免费窗口**。<br>③ 该站引用的第三方费率表把 `stealth/space-bunny-alpha` 记为 **$0.000 / $0.000**。<br>④ 猜测定依据：tokenizer 指纹指向 minimax、规格（1M 上下文）匹配 **minimax M3.1 Flash Preview**。 |
| 官方价           | **无公开定价**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 结论             | **按 $0 计价，保留 token 用量统计。严禁编造价格。**                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ⚠️ 待刷新        | 若 2026-10-05 后认领（社区预测 minimax M3.1 系列），Zen 上会转为收费。**参照锚点**：Zen 目录中 `minimax M3` = 输入 $0.30 / 输出 $1.20 / 缓存读 $0.06。Space Bunny 是本项目**唯一跑完全部后期子任务的模型**，一旦转收费，本报告费用列需重算。                                                                                                                                                                                                                                                                 |

### 3.3 Big Pickle — ❌ 无公开定价

| 项               | 内容                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 模型 ID          | `big-pickle`（OpenCode Zen）                                                                                                                                                                                                                                                                                                                           |
| 是否真实公开产品 | **否**。**OpenCode 官方文档自认**："Big Pickle is a **stealth model** that's free on OpenCode for a limited time."                                                                                                                                                                                                                                     |
| 调研证据         | ① 官方 Zen 定价表 **Free / Free / Free**（[来源](https://opencode.ai/docs/zen/)）。<br>② [spacebunny.site/stealth-models](https://spacebunny.site/stealth-models/) 明确把 Big Pickle 列为 OpenCode 提供的隐匿模型之一。<br>③ 隐私条款把它与 Fledge Alpha 并列，注明"free period 内数据可能被用于改进模型"——与 Space Bunny / LongCat 的零保留条款不同。 |
| 官方价           | **无公开定价**。                                                                                                                                                                                                                                                                                                                                       |
| 结论             | **按 $0 计价，保留 token 用量统计。严禁编造价格。**                                                                                                                                                                                                                                                                                                    |
| 附注             | 社区曾流传"Big Pickle 是 GLM 系"的猜测，**无官方证据，不予采纳、不作定价参照**。                                                                                                                                                                                                                                                                       |

### 3.4 Nemotron 3.5 Lightning — ⚠️ 真实公开产品，但本通道无公开定价

| 项               | 内容                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型 ID          | `nemotron-3.5-lightning-free`（OpenCode Zen）                                                                                                                                                                                                                                                                   |
| 是否真实公开产品 | **✅ 是**。**NVIDIA Corporation** 自研，30B 总参 / 3B 激活的 MoE（Mamba-2 + MoE + Attention 混合架构），**开放权重**，许可为 **OpenMDW License Agreement v1.1**，1M 上下文，2026-08-11 发布（[官方模型页](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)）。                                   |
| 本通道定价       | **Zen 侧 Free / Free / Free**（[来源](https://opencode.ai/docs/zen/)）。NVIDIA build.nvidia.com 侧为 **API Trial（试用）**，**模型页未列任何 token 单价**，只给 [NVIDIA API Trial Terms of Service](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf)。 |
| 底层参照价       | **无单一官网价**。第三方托管商各自加价、区间如下（**仅供参照，不作为本项目计价依据**）：<br>• DeepInfra：**$0.05 输入 / $0.20 输出** 每 1M<br>• Qubrid：**$0.069 输入 / $0.29 输出 / $0.0069 隐式缓存** 每 1M（约为 list 价 8 折）<br>• kingy.ai 综述：约 **$0.05 输入 / $0.25 输出**                           |
| 结论             | **本通道按 $0 计价，保留 token 用量统计。**若按 DeepInfra 区间（$0.05 / $0.20）折算其用量，量级约 **$0.023**；按 Qubrid 区间约 **$0.031**。差异不影响本报告结论（本项目实际支付 $0）。                                                                                                                          |
| ⚠️ 合规提示      | Zen 隐私条款明确：Nemotron 免费端点属 **NVIDIA free endpoints**，"**Trial use only — do not submit personal or confidential data**"，且使用会被记录用于安全审计与产品改进。                                                                                                                                     |

### 3.5 Muse Spark 1.3 Contributor — ⚠️ 真实公开产品，有官方牌价，但本通道 Free

| 项                        | 内容                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型 ID                   | `muse-spark-1.3-contributor-free`（OpenCode Zen）                                                                                                                                                                                                                                                                                                           |
| 是否真实公开产品          | **✅ 是**。**Meta** 的模型，"trained for agentic workflows and optimized for competitive coding performance"，走 `/v1/responses` 端点（`@ai-sdk/openai`）。                                                                                                                                                                                                 |
| **官方牌价（Meta 官网）** | **Contributor 档**：输入 **$0.10** · 缓存读 **$0.002** · 输出 **$0.20** 每 1M<br>**Standard 档**：输入 **$1.25** · 缓存读 **$0.15** · 输出 **$4.25** 每 1M                                                                                                                                                                                                  |
| 本通道定价                | Zen 侧对 `muse-spark-1.3-contributor-free` 标 **Free / Free / Free**（[来源](https://opencode.ai/docs/zen/)）——即 Zen 用 Meta contributor 档**再加一层免费**，实际不收费。                                                                                                                                                                                  |
| Contributor 档的对价      | Meta 原文：「**Heavily discounted token pricing in exchange for permission to use your prompts and completions to train future Meta models**」→ 用 prompt/completion 换训练授权（Zen 文档链接指向 [dev.meta.ai/docs/pricing-rate-limits#contributor-tier](https://dev.meta.ai/docs/pricing-rate-limits)）。                                                 |
| 结论                      | **本通道按 $0 计价。**注意：**该 SKU 在本项目全程 token 用量为 0**（唯一会话是 17:24 的连通性冒烟测试，`tokens_input/output/cache_read` 全 0，且因**地区限制**不可用），因此**即使按 Contributor 牌价换算也是 $0**，两种口径无差异。                                                                                                                        |
| 查证方法说明              | Meta 官方页 `dev.meta.ai/models/muse-spark` 与 `dev.meta.ai/docs/pricing-rate-limits` 在本次查证窗口内**多次直连超时**（transport error），最终采信 **搜索引擎对该官方域名的索引摘要**（该摘要直接给出 `Cached input (Mtok) / Output (Mtok)` 列的 `$0.10 / $0.002 / $0.20`），并与 4 家独立二手来源交叉验证，**数值四家一致**。收尾刷新时建议重试直连确认。 |

---

## 4. 重点复核：Ling-3.0-flash 参照价的三个数分别对应什么？

> 这是本次调研**唯一存在"对应关系可能被误读"风险**的一项，故单列复核。

### 4.1 待复核命题

原看板记载：`Ling-3.0-flash` 参照价 **$0.021（输入）/ $0.0042（缓存读）/ $0.063（输出）**。
需要确认这三个数**分别**对应输入、缓存读、输出，而不是仅凭"大小规律"猜的。

### 4.2 复核结论：✅ **原假设完全正确**，且是**按列标题直读**得到，不是推测

蚂蚁百灵官方定价页 [developer.ant-ling.com/zh-CN/docs/models/price](https://developer.ant-ling.com/zh-CN/docs/models/price/)（页面标注 **Last updated 2026-09-23**）在「第三方平台 → OpenRouter」小节给出**带列标题**的表格，逐字转录如下：

| Model              | Input (per 1M tokens) | Output (per 1M tokens) | Cache Read (per 1M tokens) |
| ------------------ | --------------------: | ---------------------: | -------------------------: |
| **Ling-3.0-flash** |  ~~$0.06~~ **$0.021** |   ~~$0.18~~ **$0.063** |     ~~$0.012~~ **$0.0042** |

**→ 列标题直读结论：`$0.021` = 输入，`$0.063` = 输出，`$0.0042` = 缓存读。与原看板假设一致。**

同一页面的「模型定价（人民币）」小节亦可交叉验证结构一致性：

| Model              | 定位           | 输入价格（每百万 token） | 输出价格（每百万 token） | 缓存读取（每百万 token） |
| ------------------ | -------------- | -----------------------: | -----------------------: | -----------------------: |
| **Ling-3.0-flash** | 最新高速执行版 |     ~~¥0.50~~ **¥0.125** |     ~~¥1.50~~ **¥0.375** |     ~~¥0.10~~ **¥0.025** |

### 4.3 四条独立判据（互相印证）

| #   | 判据             | 推理                                                                                                                                                                                                                                                    | 结果        |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **列标题直读**   | 表格表头直接写明 Input / Output / Cache Read 三列，逐格对位                                                                                                                                                                                             | ✅ 确认     |
| 2   | **量级序关系**   | 输出（$0.063）> 输入（$0.021）> 缓存读（$0.0042）。业界惯例输出价 ≥ 输入价 ≥ 缓存读价，**唯一自洽排列**就是把 $0.063 放输出、$0.021 放输入、$0.0042 放缓存读                                                                                            | ✅ 一致     |
| 3   | **比例结构同构** | 人民币表：输出/输入 = 0.375/0.125 = **3.0×**；缓存读/输入 = 0.025/0.125 = **0.20×**<br>美元表：0.063/0.021 = **3.0×**；0.0042/0.021 = **0.20×**<br>→ 三列的**相对比例完全一致**，交叉验证了 USD 三数与 CNY 三数的列位一一对应                           | ✅ 强支持   |
| 4   | **费用反算回代** | 用复核后的费率重算 #49（80,843 输入 / 2,111,616 缓存读 / 26,355 输出）：<br>`80,843÷1e6×0.021 = $0.001698`<br>`2,111,616÷1e6×0.0042 = $0.008869`<br>`26,355÷1e6×0.063 = $0.001660`<br>合计 **$0.012227 → $0.0122**，与原看板记载的 #49 费用**逐分吻合** | ✅ 反算闭合 |

### 4.4 ⚠️ 复核中发现的一处**口径瑕疵**（不影响结论，但需登记）

原看板把 Ling-3.0-flash 描述为"**2.5 折价**"。这个折扣**只对人民币官方价成立**：

| 口径                             | 原价 → 现价    | 折扣                                   |
| -------------------------------- | -------------- | -------------------------------------- |
| 人民币（官方直营）               | ¥0.50 → ¥0.125 | **2.5 折**（75% off）✅ 与看板表述一致 |
| 美元（OpenRouter / ZenMux 转售） | $0.06 → $0.021 | **3.5 折**（65% off）⚠️ 深于 2.5 折    |

且 USD 三数隐含汇率 **¥0.125/$0.021 = 5.95**、**¥0.375/$0.063 = 5.95**、**¥0.025/$0.0042 = 5.95**（三者内部自洽），但**并非**官方人民币价的机械换算（¥0.50/$0.06 = 8.33）。

**结论**：看板的**三个数值与列位都正确**；"2.5 折"这一**措辞**仅对人民币价成立。本文档统一表述为「Ling-3.0-flash **现行折后价**（CNY 2.5 折 / USD 约 3.5 折）」。

### 4.5 Ling-3.1 为何"无官网价"？

官方定价页（Last updated **2026-09-23**）的模型清单只有：**Ling-3.0-flash-VL / Ling-3.0-flash / Ling-2.6-1T / Ling-2.6-flash / Ring-2.6-1T**——**没有 Ling-3.1-flash 任何条目**（输入 / 输出 / 缓存读三列全空）。同时 OpenCode Zen 侧 `ling-3.1-flash-free` 标注为**限时免费**。

→ 因此"**Ling-3.1 无官网价**"这一记载**准确**。本项目采用同厂 **Ling-3.0-flash 现行价**作参照，理由：同一模型家族、同为 flash 高速执行版、同为限时免费档，量级最接近。此规则**适用于本项目全部 Ling 3.1 用量**（#49 及各次替补会话）。

---

## 5. 费用换算口径（Definition of Cost）

### 5.1 公式

```
费用(USD) = 输入token ÷ 1e6 × 输入单价
          + 缓存读token ÷ 1e6 × 缓存读单价
          + 输出token ÷ 1e6 × 输出单价
          + 缓存写token ÷ 1e6 × 缓存写单价
```

### 5.2 三类 token 的口径定义

| token 类别         | 库字段               | 含义                             | 本项目单价处理       |
| ------------------ | -------------------- | -------------------------------- | -------------------- |
| 输入（未命中缓存） | `tokens_input`       | 用户消息 + 系统提示 + 未命中前缀 | 按各模型"输入"价     |
| 缓存读             | `tokens_cache_read`  | 命中 Prompt Cache 的前缀         | 按各模型"缓存读"价   |
| 输出               | `tokens_output`      | 模型生成内容                     | 按各模型"输出"价     |
| 缓存写             | `tokens_cache_write` | 写入 Prompt Cache                | **单价按 0**（见下） |

### 5.3 ⚠️ 缓存写单价 = 0 的显式注明

1. **数据侧**：`opencode.db` 中 `session_v2.tokens_cache_write` 在**全部 66 个会话上合计为 0**（`select count(*) ... where tokens_cache_write>0` 返回 0）。→ 本项目**没有可计费的缓存写用量**。
2. **价格侧**：OpenCode Zen 官方定价表对**全部 8 个模型**的 `Cached Write` 列均为 **`-`**（无此计价项）。
3. **口径结论**：**缓存写单价按 $0 处理**。这不是"缓存写免费"的厂商承诺，而是"**该通道不按缓存写计费、且本次未产生缓存写用量**"的结果。执行报告中所有费用数字均已包含此假设。

### 5.4 免费模型按 $0 计价但保留用量统计

| 类别                                       | 模型                                                                                      | 计价                          | 用量                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| **有官网价，按官网价换算**（真实成本口径） | LongCat-2.5-Preview、MiMo-V2.6-Flash、Ling-3.1-Flash（用 Ling-3.0-flash 参照价）          | 输入/缓存读/输出 各按官网单价 | 完整保留                                |
| **无公开定价 → 按 $0**                     | Fledge Alpha、Space Bunny、Big Pickle、Nemotron 3.5 Lightning、Muse Spark 1.3 Contributor | **$0**                        | **完整保留**（三分类 token 数照常统计） |

**理由**：这些模型在 Zen 上是"限时免费 / 隐匿预览"，**无稳定的公开牌价**；按 $0 计价既反映实际支付（$0），又不会因虚构价格而误导成本决策。**token 用量必须保留**——它是配额消耗（429 限速）与容量规划的唯一依据。

### 5.5 两套口径必须分开看

| 口径                             | 含义                                      | 本项目数值                   |
| -------------------------------- | ----------------------------------------- | ---------------------------- |
| **实际支付**                     | OpenCode Zen free 通道真实扣费            | **$0.00**（全程）            |
| **官网牌价换算（真实成本口径）** | 若走各厂商付费 API，同样的 token 需付多少 | 见执行报告 §1 主表「费用」列 |

> 执行报告的所有费用数字 = **官网牌价换算口径**。看板原注：「本任务在 OpenCode 实际支付 $0（free 通道）；本列统一按各模型官网牌价换算，作为真实成本口径。」——本文档**沿用并确认**该口径。

### 5.6 本项目实际使用的单价版本

| 项                      | 值                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **费率版本号**          | `v2026-10-04-01`                                                                                                                            |
| **查证日期**            | **2026-10-04**（22:40–22:50 CST 窗口）                                                                                                      |
| **权威来源（通道价）**  | OpenCode Zen 定价页 <https://opencode.ai/docs/zen/>（页面标注 Last updated **2026-10-03**）与 <https://opencode.ai/v2/docs/console/models/> |
| **权威来源（LongCat）** | <https://longcat.chat/platform/docs/zh/pricing/longcat-2.5>（¥2 / ¥0.04 / ¥8；$0.30 / $0.006 / $1.20）                                      |
| **权威来源（MiMo）**    | <https://mimo.mi.com/models/zh-CN/mimo-v2.6-flash>（海外 $0.14 / $0.0028 / $0.28；国内 ¥1 / ¥0.02 / ¥2），页面标注更新时间 **2026-09-22**   |
| **权威来源（Ling）**    | <https://developer.ant-ling.com/zh-CN/docs/models/price/>（Last updated **2026-09-23**）                                                    |
| **单价表**              | LongCat 0.30/0.006/1.20 · MiMo 0.14/0.0028/0.28 · Ling(参照) 0.021/0.0042/0.063 · 其余 5 个 $0/—                                            |
| **缓存写单价**          | **$0**（无计价项，用量为 0）                                                                                                                |
| **下次复核触发条件**    | ① Ling-3.1-flash 出现在蚂蚁官方定价表；② Space Bunny 被认领并转收费（社区预测 2026-10-05）；③ 任一"限时免费"模型下架；④ 执行报告收尾定稿前  |

---

## 6. 刷新指引（收尾时按此逐项复核）

```bash
# 1) 通道价：8 个模型的 Zen 标价是否仍为 Free
curl -s https://opencode.ai/zen/v1/models | jq '.data[]
  | select(.id|test("fledge-alpha-free|space-bunny-free|big-pickle|longcat-2.5-preview-free|mimo-v2.6-flash-free|ling-3.1-flash-free|nemotron-3.5-lightning-free|muse-spark-1.3-contributor-free"))
  | {id, cost}'

# 2) Ling-3.1 是否已公布官网价（重点看是否新增 Ling-3.1 行）
#    https://developer.ant-ling.com/zh-CN/docs/models/price/
#    复核列位：Input / Output / Cache Read 三列标题逐格对读

# 3) LongCat 限时折扣是否到期（恢复原价会抬高费用列）
#    https://longcat.chat/platform/docs/zh/pricing/longcat-2.5

# 4) MiMo 是否调价（v2.5 系列已于 2026-10-21 下线，v2.6-flash 仍在）
#    https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go

# 5) Space Bunny / Big Pickle 是否已被厂商认领（认领即可能转收费）
#    https://spacebunny.site/stealth-models/

# 6) Meta 官方页直连复核（本次直连超时，仅采信索引摘要）
#    https://dev.meta.ai/models/muse-spark
```

刷新后请同步更新：

- §2 主表的「官方价」「查证时间」两列
- §5.6 的费率版本号（建议 `v2026-10-XX-02`）与「下次复核触发条件」判定结果
- 执行报告 `long_learn_execution_report.md` §1 主表的「费用 USD」列（重跑 §6.3 的复算 SQL）

---

## 7. 严禁事项（写入本文档以留证）

1. ❌ **禁止为 Fledge Alpha / Space Bunny / Big Pickle 编造价格。** 三者是隐匿模型，厂商未署名、底层未认领，任何"价格"都是虚构。正确表述是「**无公开定价 → 按 $0 计价但保留 token 用量**」。
2. ❌ **禁止把社区猜测当定价依据。** "Space Bunny 疑似 minimax"、"Big Pickle 疑似 GLM"、"Fledge 疑似 router" 都是**身份猜测**，不是**价格事实**。可作定性说明，不可换算金额。
3. ❌ **禁止混用 CNY 与 USD 折扣表述**（见 §4.4）。引用 Ling 折后价时须写明是 CNY 2.5 折还是 USD 约 3.5 折。
4. ❌ **禁止把"实际支付 $0"写成"官网价 $0"。** 二者是不同口径，见 §5.5。
5. ❌ **禁止对缓存写编造单价。** 正确表述是「单价按 $0，因 Zen 无此计价项且本次用量为 0」。
