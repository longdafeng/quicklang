import type { Word } from "../../contracts";
export interface Lesson {
  id: string; title: string; source: string; wordId?: string;
  lines: { en: string; zh: string }[];
  questions: { prompt: string; options: string[]; answer: number }[];
  task: string;
}
// Original teaching examples, independent of the upstream guide.
export const dialogues: Lesson[] = [
  { id: "dialogue-travel-v1", title: "旅行 · 改签车票", source: "QuickLang 原创示例 · 合成语音", lines: [
    { en: "I'd like to change my ticket to Friday morning.", zh: "我想把车票改到周五上午。" },
    { en: "The first train leaves at nine. Would that work for you?", zh: "第一班火车九点出发。这个时间适合您吗？" },
    { en: "Yes. How much does it cost to change the ticket?", zh: "可以。改签车票需要多少钱？" },
    { en: "There is no extra charge. Please arrive twenty minutes early.", zh: "不额外收费。请提前二十分钟到达。" },
  ], questions: [
    { prompt: "乘客想改到什么时候？", options: ["周五晚上", "周五上午", "周四上午"], answer: 1 },
    { prompt: "工作人员要求乘客做什么？", options: ["支付额外费用", "提前二十分钟到达", "改乘下午的车"], answer: 1 },
  ], task: "你要把车票改到周六下午。向工作人员说明需求，并询问费用和出发时间。" },
  { id: "dialogue-work-v1", title: "工作 · 协商期限", source: "QuickLang 原创示例 · 合成语音", lines: [
    { en: "Can we finish the report by Thursday?", zh: "我们能在周四前完成报告吗？" },
    { en: "We still need the sales figures. They will arrive tomorrow.", zh: "我们还需要销售数据，明天才能收到。" },
    { en: "Then let's move the deadline to Friday afternoon.", zh: "那么我们把期限改到周五下午吧。" },
    { en: "I'll let the team know and send you an update tomorrow.", zh: "我会通知团队，并在明天向你汇报进展。" },
  ], questions: [
    { prompt: "为什么需要调整期限？", options: ["团队正在休假", "报告已经完成", "还没收到销售数据"], answer: 2 },
    { prompt: "对方承诺明天做什么？", options: ["汇报进展", "完成所有报告", "取消项目"], answer: 0 },
  ], task: "项目缺少测试结果。向同事解释原因，提出新的期限，并说明下一步行动。" },
  { id: "dialogue-daily-v1", title: "日常 · 安排练习", source: "QuickLang 原创示例 · 合成语音", lines: [
    { en: "Would you like to practice English after lunch?", zh: "午饭后你想一起练英语吗？" },
    { en: "I have a meeting then. Could we meet at six instead?", zh: "那时我有个会。我们改到六点见面好吗？" },
    { en: "Sure. Let's each bring a short story to share.", zh: "当然。我们各自准备一个小故事来分享吧。" },
    { en: "Great. I'll tell you about my journey last week.", zh: "太好了。我会讲讲上周的旅行。" },
  ], questions: [
    { prompt: "两人最后约定几点见面？", options: ["午饭后马上", "六点", "七点"], answer: 1 },
    { prompt: "两人要准备什么？", options: ["一个小故事", "一份工作报告", "一张车票"], answer: 0 },
  ], task: "邀请朋友练英语。对方没空时，提出另一个时间，并商量练习内容。" },
];
export function wordLessons(words: readonly Word[]): Lesson[] {
  return words.filter(w => w.example?.trim() && w.example.length <= 1200 && tokens(w.example).length <= 200).map(w => ({
    id: `word:${w.id}:${w.example}`, title: `${w.spelling} · 例句精听`, wordId: w.id,
    source: w.sentences?.some(s => s.textEn === w.example && s.source === "quicklang-ai-authored") ? "词书例句 · AI 补充 · 合成语音" : "当前词书例句 · 合成语音",
    lines: [{ en: w.example!, zh: w.exampleTranslation ?? "" }], questions: [],
    task: `使用 ${w.spelling} 描述你自己的一个情境，换一个句子表达，不照读原句。`,
  }));
}
export function tokens(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) ?? [];
}
export interface DiffToken { text: string; kind: "correct" | "missing" | "extra" }
export function compareSentence(expected: string, actual: string): DiffToken[] {
  const allA = tokens(expected), allB = tokens(actual);
  const a = allA.slice(0, 300), b = allB.slice(0, 300);
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result: DiffToken[] = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { result.push({ text: a[i++], kind: "correct" }); j++; }
    else if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) result.push({ text: a[i++], kind: "missing" });
    else result.push({ text: b[j++], kind: "extra" });
  }
  return [...result, ...allA.slice(300).map(text => ({ text, kind: "missing" as const })), ...allB.slice(300).map(text => ({ text, kind: "extra" as const }))];
}
export function parseGeneratedLesson(text: string): Lesson {
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  const validText = (v: unknown, limit: number): v is string => typeof v === "string" && !!v.trim() && v.length <= limit;
  if (!value || !validText(value.title, 80) || !validText(value.task, 500) || !Array.isArray(value.lines) || value.lines.length < 2 || value.lines.length > 6
    || value.lines.some((l: { en?: unknown; zh?: unknown }) => !l || !validText(l.en, 400) || !validText(l.zh, 400))
    || !Array.isArray(value.questions) || value.questions.length !== 2
    || value.questions.some((q: { prompt?: unknown; options?: unknown; answer?: unknown }) => !q || !validText(q.prompt, 200) || !Array.isArray(q.options) || q.options.length !== 3 || q.options.some(o => !validText(o, 200)) || !Number.isInteger(q.answer) || Number(q.answer) < 0 || Number(q.answer) > 2)) throw new Error("AI 返回的练习格式不完整，请重新生成。");
  return { id: `generated:${crypto.randomUUID()}`, title: value.title, task: value.task, lines: value.lines.map((l: { en: string; zh: string }) => ({ en: l.en, zh: l.zh })), questions: value.questions.map((q: { prompt: string; options: string[]; answer: number }) => ({ prompt: q.prompt, options: q.options, answer: q.answer })), source: "AI 生成练习 · 未经语言审核 · 合成语音" };
}
