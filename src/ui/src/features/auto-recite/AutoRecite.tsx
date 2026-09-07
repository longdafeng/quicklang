import { useEffect, useState } from "react";
import type { Word } from "../../contracts";
import { delay, initialReciteState, tick } from "./machine";

export function AutoRecite({ words }: { words: readonly Word[] }) {
  const [state, setState] = useState(initialReciteState);
  const [speed, setSpeed] = useState(350);
  useEffect(() => {
    if (state.paused || state.phase === "complete") return;
    const timer = setTimeout(() => setState(current => tick(current, words.map(w => w.spelling))), delay(state, speed));
    return () => clearTimeout(timer);
  }, [state, speed, words]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) setState(s => ({ ...s, paused: true })); };
    const blur = () => setState(s => ({ ...s, paused: true }));
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const move = (delta: number) => setState(s => ({
    ...initialReciteState, paused: s.paused, index: Math.max(0, Math.min(words.length - 1, s.index + delta)),
  }));
  if (!words.length) return <p>当前词库为空。</p>;
  const word = words[state.index];
  return <section className="study-card" tabIndex={0} aria-label="自动默念"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space" && event.target === event.currentTarget) { event.preventDefault(); setState(s => ({ ...s, paused: !s.paused })); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    }}>
    <div className="eyebrow">自动默念 · {state.index + 1} / {words.length}</div>
    <p className="meaning">{word.meaning}</p>
    <div className="word" aria-label="当前单词">{Array.from(word.spelling).slice(0, state.letters).join("")}<span className="cursor">|</span></div>
    <p className="muted">跟随每一个字母，在心中拼出单词。此模式不更新复习日程。</p>
    <div className="actions">
      <button onClick={() => move(-1)} disabled={state.index === 0}>上一个</button>
      <button className="primary" onClick={() => state.phase === "complete" ? setState(initialReciteState) : setState(s => ({ ...s, paused: !s.paused }))}>
        {state.phase === "complete" ? "重新播放" : state.paused ? "继续" : "暂停"}</button>
      <button onClick={() => move(1)} disabled={state.index === words.length - 1}>下一个</button>
    </div>
    <label className="speed">字母间隔
      <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
        <option value={200}>200 ms</option><option value={350}>350 ms</option><option value={600}>600 ms</option>
      </select>
    </label>
    {state.paused && <p role="status">已暂停；返回后点击继续。</p>}
    {state.phase === "complete" && <p role="status">本轮播放完成。</p>}
  </section>;
}
