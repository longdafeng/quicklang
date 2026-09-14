import { useState } from "react";
import type { Material, SavedPhrase } from "./model";
export function PhraseCards({ material, disabled, save, play }: { material: Material; disabled: boolean; save: (items: SavedPhrase[]) => boolean | void | Promise<boolean | void>; play: (sentence: number) => void }) {
  const [text, setText] = useState(""), [meaning, setMeaning] = useState("");
  const [index, setIndex] = useState(0), [revealed, setRevealed] = useState(false), [error, setError] = useState("");
  const phrases = material.phrases ?? [], card = phrases[index % (phrases.length || 1)];
  async function add() {
    if (!text.trim()) return;
    const sentence = material.cues[material.sentence];
    if (!sentence.text.toLowerCase().includes(text.trim().toLowerCase())) { setError("请输入当前片段中出现的单词或意群，以便保留原句语境。"); return; }
    if (phrases.some(p => p.text.toLowerCase() === text.trim().toLowerCase() && p.sentence === material.sentence)) { setError("这条词汇已经收藏。"); return; }
    try {
      if (await save([...phrases, { text: text.trim(), meaning: meaning.trim(), sentence: material.sentence }]) === false) return;
      setText(previous => previous === text ? "" : previous); setMeaning(previous => previous === meaning ? "" : previous); setError("");
    } catch { setError("收藏保存失败，请重试。"); }
  }
  return <details className="listening-phrases"><summary>词汇与意群闪卡 · {phrases.length} 条</summary><div className="study-card"><h3>在原句中记住表达</h3><p className="muted">从当前片段摘录单词或意群；可参考 AI 讲解填写释义。</p><label>收藏单词或意群<input value={text} maxLength={120} onChange={e => setText(e.target.value)} /></label><label>释义或笔记<input value={meaning} maxLength={500} onChange={e => setMeaning(e.target.value)} /></label><button disabled={disabled || !text.trim() || phrases.length >= 500} onClick={() => void add()}>保存到语境闪卡</button>{error && <p role="alert">{error}</p>}
    {card && <article><p className="listening-transcript">{card.text}</p>{revealed && <><p>{card.meaning || "未填写释义，可查看对应句子的 AI 讲解。"}</p><p className="example">{material.cues[card.sentence]?.text}</p></>}<div className="actions"><button onClick={() => play(card.sentence)}>听原句</button><button onClick={() => setRevealed(!revealed)}>{revealed ? "隐藏释义和原句" : "显示释义和原句"}</button><button onClick={() => { setIndex(n => n + 1); setRevealed(false); }}>下一张词汇</button><button disabled={disabled} onClick={() => { save(phrases.filter(p => p !== card)); setRevealed(false); }}>取消词汇收藏</button></div></article>}</div></details>;
}
