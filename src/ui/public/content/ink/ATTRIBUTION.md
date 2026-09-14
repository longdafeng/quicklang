# 致谢与素材来源

**更新**：2026-07-05

本文说明 Ink-Learner 所参考的项目与**内置词库素材**上游，便于署名与合规。产品实现为独立编写；

维护者如需从上游重新生成 seed，见 [seed-data-workflow.md](./seed-data-workflow.md)（日常 clone 仓库即可使用已提交的 `seeds/ink/`）。

---

## 1. 产品设计参考

| 项目 | 链接 | 关系 |
|------|------|------|
| **Qwerty Learner** | [RealKai42/qwerty-learner](https://github.com/RealKai42/qwerty-learner) | 打字练习、选书 Gallery 等**交互思路**参考；**未复制其源代码** |

详细产品边界见 [why-not-qwerty-learner.md](./why-not-qwerty-learner.md)。

---

## 2. 内置词库数据

### 2.1 主要上游

| 上游 | 链接 | 用途 |
|------|------|------|
| **KyleBing / english-vocabulary** | [github.com/KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) | 内置词库释义、词性、短语；音标与例句来自其 `json/` 与 `json_original/json-sentence` |
| **Tatoeba 英中例句** | [tatoeba.org](https://tatoeba.org/) · [manythings.org/anki](http://www.manythings.org/anki/) | 缺例句词条的补充英中句对（`source: tatoeba`）：ManyThings `cmn-eng` 精选 + Tatoeba 官方 per-language export（非全量 CSV）；[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |
| **上游词源（KyleBing 自述）** | [kajweb/dict](https://github.com/kajweb/dict) | 原始词典数据经 fork 与简化后进入 english-vocabulary |

感谢 **KyleBing** 与 **Tatoeba 社区** 整理并公开学习素材。

### 2.2 本仓库内置词库清单

| 词库 id | 名称 | 上游（KyleBing） |
|---------|------|------------------|
| `ink-junior` | 初中词汇 | `json/1-初中-顺序.json` + `json-sentence/ChuZhong_*` |
| `ink-senior` | 高中词汇 | `json/2-高中-顺序.json` + `json-sentence/GaoZhong_*` |
| `ink-cet4` | 大学英语四级 | `json/3-CET4-顺序.json` + `json-sentence/CET4_*` |
| `ink-cet6` | 大学英语六级 | `json/4-CET6-顺序.json` + `json-sentence/CET6_*` |
| `ink-postgraduate` | 考研英语 | `json/5-考研-顺序.json` + `json-sentence/KaoYan_*` |
| `ink-toefl` | 托福词汇 | `json/6-托福-顺序.json`（`scripts/data/toefl-scope.txt` 筛选）+ `json-sentence/TOEFL_*` |
| `ink-sat` | SAT 词汇 | `json/7-SAT-顺序.json` + `json-sentence/SAT_*` |
| `ink-ielts` | 雅思词汇 | `json-sentence/IELTS_*` |
| `ink-gre` | GRE 词汇 | `json-sentence/GRE_*` |
| `ink-gmat` | GMAT 词汇 | `json-sentence/GMAT_*` |
| `ink-bec` | BEC 商务英语 | `json-sentence/BEC_*` |

托福词条范围由仓库内 `scripts/data/toefl-scope.txt` 定义；正文与 enrich 字段均来自 KyleBing。

---

## 3. 许可与再分发

| 范围 | 协议 | 说明 |
|------|------|------|
| **源代码**（`src/`、`src-tauri/` 等） | [GNU GPLv3](../../LICENSE) | 衍生作品须以相同协议开源 |
| **学习素材**（`seeds/` 等） | [CC BY-SA 4.0](../../seeds/LICENSE_ASSETS) | 使用与改编须**署名**并以相同方式共享 |

对 KyleBing 词库素材的建议署名（应用「关于」页或分发说明中）：

> 词库数据基于 [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)（上游 [kajweb/dict](https://github.com/kajweb/dict)）；部分例句来自 [Tatoeba](https://tatoeba.org/)（[manythings.org/anki](http://www.manythings.org/anki/) 英中精选与官方 per-language 英中 export，CC BY 2.0）。经 Ink-Learner 筛选与格式转换，以 CC BY-SA 4.0 再分发。

---

## 4. 计划中的补充来源（尚未接入）

| 资源 | 说明 | 潜在用途 |
|------|------|----------|
| **AWL 570**（Coxhead） | 学术核心词，公共领域 | 高阶专项小包 |
| **WordLink**（Apache 2.0） | 托福同义替换组 | 单词详情拓展 |

---

## 5. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-05 | Tatoeba 例句：ManyThings + per-language export（`fetch:tatoeba`） |
| 2026-07-05 | 接入 Tatoeba（ManyThings cmn-eng）例句补齐 |
| 2026-07-05 | 接入 IELTS/GRE/GMAT/BEC；精简维护说明 |
| 2026-07-05 | 初稿 |


## QuickLang example supplements

Missing examples were filled with AI-authored QuickLang examples (`quicklang-ai-authored`). Existing upstream examples are unchanged. Supplementary examples are distributed under CC BY-SA 4.0. AI-authored examples are not quotations from the upstream dictionary. Spelling corrections retain the original spelling and stable content ID. See the bundled manifest for input checksums.
