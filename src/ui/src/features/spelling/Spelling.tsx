import { useRef, useState } from "react";
import type { Word, TypingResult } from "../../contracts";
import { evaluateSpelling } from "../../adapters/runtime";

export function Spelling({ words }: { words: readonly Word[] }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState(0);
  const [backspaces, setBackspaces] = useState(0);
  const [result, setResult] = useState<TypingResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  if (!words.length) return <p>当前词库为空。</p>;
  const word = words[index];
  async function submit() {
    if (inflight.current || result) return;
    inflight.current = true; setBusy(true); setError("");
    try {
      setResult(await evaluateSpelling(word.spelling, answer, { hint_count: hints, backspaces }));
    } catch { setError("暂时无法检查答案，请重试。"); }
    finally { inflight.current = false; setBusy(false); }
  }
  function next() {
    setIndex((index + 1) % words.length); setAnswer(""); setHints(0); setBackspaces(0); setResult(null);
    requestAnimationFrame(() => input.current?.focus());
  }
  return <section className="study-card">
    <div className="eyebrow">背诵拼写 · {index + 1} / {words.length}</div>
    <h2 className="meaning">{word.meaning}</h2>
    <p className="muted">回忆英文单词，然后用键盘拼写。</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <input ref={input} className="answer" aria-label="英文拼写" autoFocus value={answer}
        disabled={busy || !!result} autoComplete="off" autoCapitalize="none" spellCheck={false}
        maxLength={128} placeholder="在这里输入英文" onPaste={event => event.preventDefault()}
        onChange={event => setAnswer(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing && event.key === "Enter") event.preventDefault();
          if (event.key === "Backspace") setBackspaces(n => n + 1);
        }} />
      <div className="actions">
        <button type="button" disabled={busy || !!result} onClick={() => setHints(n => Math.min(n + 1, word.spelling.length))}>提示一个字母</button>
        <button className="primary" disabled={busy || !!result || !answer} type="submit">{busy ? "检查中…" : "检查拼写 ↵"}</button>
      </div>
    </form>
    {!!hints && <p className="hint">提示：{word.spelling.slice(0, hints)}</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status" className={result.correct ? "feedback correct" : "feedback incorrect"}>
      <strong>{result.correct ? "拼写正确" : "再记一次"} · {word.spelling}</strong>
      <p>{result.correct ? "继续保持，每一次回忆都在加深记忆。" : "核对字母顺序后，再尝试回忆。"}</p>
      <button onClick={next}>下一个单词 →</button>
    </div>}
    <p className="footnote">预览会话 · 结果仅保留在当前页面，未写入数据库。</p>
  </section>;
}
