import { useState } from "react";
import type { Word } from "../../contracts";
export function Flashcard({ words }: { words: readonly Word[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!words.length) return <p>当前词库为空。</p>;
  const next = () => { setIndex(i => (i + 1) % words.length); setRevealed(false); };
  return <section className="study-card">
    <div className="eyebrow">卡片回忆 · {index + 1} / {words.length}</div>
    <h2 className="meaning">{words[index].meaning}</h2>
    {revealed ? <>
      <p className="word">{words[index].spelling}</p>
      <div className="actions">{["不会", "困难", "记住", "轻松"].map(label => <button key={label} onClick={next}>{label}</button>)}</div>
    </> : <button className="primary reveal" onClick={() => setRevealed(true)}>显示答案</button>}
    <p className="footnote">预览会话 · 自评分只用于浏览，不更新复习日程。</p>
  </section>;
}
