import { useState } from "react";
import { useStorageKey } from "../users/profiles";
import type { Word } from "../../contracts";
export function readSaved<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(`quicklang:${key}`) ?? "null") ?? fallback; } catch { return fallback; }
}
export function useSaved<T>(key: string, initial: T) {
  const getKey = useStorageKey();
  const fullKey = getKey(key);
  const [value, update] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(fullKey) ?? "null") ?? initial; } catch { return initial; } });
  const set = (next: T | ((previous: T) => T)) => update(previous => {
    const result = typeof next === "function" ? (next as (p: T) => T)(previous) : next;
    try { localStorage.setItem(fullKey, JSON.stringify(result)); } catch { window.dispatchEvent(new Event("storage-failed")); }
    return result;
  });
  return [value, set] as const;
}
/** Render the word's available US and UK phonetics, or a missing-data placeholder. */
export function WordPhonetics({ word }: { word: Word }) {
  const us = word.phoneticUs?.trim();
  const uk = word.phoneticUk?.trim();
  return <p className="phonetics" aria-label="发音音标">
    {us && <span>美式 <span lang="en-US">{us}</span></span>}
    {uk && <span>英式 <span lang="en-GB">{uk}</span></span>}
    {!us && !uk && <span className="muted">暂无音标</span>}
  </p>;
}
/** Render a word with its phonetics, meaning, and available example details. */
export function WordCard({ word }: { word: Word }) {
  return <div className="word-card"><h2 className="word">{word.spelling}</h2><WordPhonetics word={word} /><p className="meaning">{word.meaning || "此词暂未提供中文释义。"}</p><p className="example">{word.example || "此词暂未提供例句。"}</p>{word.exampleTranslation && <p className="muted">{word.exampleTranslation}</p>}{word.sentences?.some(sentence => sentence.source === "quicklang-ai-authored" && sentence.textEn === word.example && sentence.textZh === word.exampleTranslation) && <p className="muted">AI 补充例句</p>}</div>;
}
export function SessionSetup({ count, setCount, remaining, learned, start }: { count: number; setCount: (n: number) => void; remaining: number; learned: number; start: () => void }) {
  return <section className="study-card"><h2>设置本次学习</h2><p>已经背诵 {learned} 个单词 · 剩余 {remaining} 个</p><label className="speed">本次背诵数量<input type="number" min="1" max="10000" value={count} onChange={e => setCount(Number(e.target.value))} /></label><p className="muted">首次默认 100 个，此后沿用上次设置。本次最多学习 {Math.min(count || 0, remaining)} 个。</p><button className="primary" disabled={!Number.isInteger(count) || count < 1 || count > 10000 || !remaining} onClick={start}>开始学习</button>{!remaining && <p>这本书已经全部学完。</p>}</section>;
}
export { speak, stopSpeech } from "../speech/speech";
export function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("cancelled")); return; }
    const abort = () => { clearTimeout(timer); reject(new Error("cancelled")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function PositionPreview({ words, position }: { words: readonly Word[]; position: number }) {
  if (!Number.isInteger(position) || position < 1 || position > words.length) return null;
  const first = Math.max(0, position - 6);
  return <div className="position-preview">
    <p className="muted">起始位置预览 · 前后各最多 5 个单词</p>
    <ol start={first + 1} aria-label="起始位置附近的单词">
      {words.slice(first, position + 5).map((word, offset) => <li key={word.id} aria-current={first + offset === position - 1 ? "true" : undefined}>
        <strong>{word.spelling}</strong>{first + offset === position - 1 && <span> ← 起始单词</span>}
      </li>)}
    </ol>
  </div>;
}
