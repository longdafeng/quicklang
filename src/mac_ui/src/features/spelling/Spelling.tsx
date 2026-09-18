import { useEffect, useRef, useState } from "react";
import type { Word } from "../../contracts";
import { evaluateSpelling } from "../../adapters/runtime";
import { SessionSetup, speak, useSaved, WordCard, WordPhonetics } from "../study/shared";
import { advance, beginRetry, grade, startSession, type Session } from "./session";
export function Spelling({ words, bookId = "demo", onWrong = () => {}, onAddWord, vocabulary = [] }: { words: readonly Word[]; bookId?: string; onWrong?: (id: string) => void; onAddWord?: (id: string) => void; vocabulary?: readonly string[] }) {
  const [count, setCount] = useSaved("spell-count", 100);
  const [saved, setSaved] = useSaved<{ learned: number; session: Session | null }>(`spell:${bookId}`, { learned: 0, session: null });
  const session = saved.session;
  const [answer, setAnswer] = useState(""); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null); const nextButton = useRef<HTMLButtonElement>(null);
  const active = session?.phase === "test" || session?.phase === "retry";
  const word = session ? words[session.queue[session.index]] : undefined;
  useEffect(() => {
    if (!active || !word || session?.feedback) return;
    const controller = new AbortController(); setError(""); input.current?.focus();
    void speak(word.spelling, "en-US", controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [word?.id, active, !!session?.feedback, retry]);
  useEffect(() => { setAnswer(""); }, [word?.id, session?.round]);
  useEffect(() => { if (session?.feedback) nextButton.current?.focus(); }, [session?.feedback]);
  useEffect(() => {
    if (session?.phase !== "test") return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(); const elapsed = now - last; last = now;
      if (!document.hidden) setSaved(p => p.session?.phase === "test" ? { ...p, session: { ...p.session, elapsed: p.session.elapsed + elapsed } } : p);
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.phase]);
  async function submit() {
    if (!session || !word || session.feedback || lock.current || !answer.trim()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await evaluateSpelling(word.spelling, answer.trim(), { hint_count: 0, backspaces: 0 });
      // Insertions can leave gaps in an existing queue; advance by word position, not answer count.
      setSaved(p => p.session ? {
        learned: p.session.phase === "test" ? p.session.queue[p.session.index] + 1 : p.learned,
        session: grade(p.session, result.correct, answer),
      } : p);
      if (!result.correct) onWrong(word.id);
    } catch { setError("暂时无法检查拼写，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!session) return <SessionSetup count={count} setCount={setCount} learned={saved.learned} remaining={words.length - saved.learned} start={() => setSaved({ ...saved, session: startSession(saved.learned, Math.min(count, words.length - saved.learned)) })} />;
  if (session.phase === "score") return <section className="study-card"><h2>本次背诵成绩</h2><p className="word">{Math.round(session.correct / session.total * 100)} 分</p><p>整体耗时 {Math.floor(session.elapsed / 60000)} 分 {Math.floor(session.elapsed / 1000) % 60} 秒</p><p>背诵 {session.total} 个 · 正确 {session.correct} 个 · 错误 {session.total - session.correct} 个</p><p>确认后，每个错词需再答对 2 次；答错的词将在下一轮继续练习。</p><button className="primary" onClick={() => setSaved({ ...saved, session: beginRetry(session) })}>确认，{session.wrong.length ? "开始错词复习" : "完成本次背诵"}</button></section>;
  if (session.phase === "done") return <section className="study-card"><h2>本次背诵完成</h2><p>所有错词均已完成两次正确拼写。</p><p>本轮首次背诵 {session.total} 个，正确 {session.correct} 个。</p><button className="primary" onClick={() => setSaved({ ...saved, session: null })}>设置下一次背诵</button></section>;
  if (!word) return <p role="alert">词书内容已变化，请重新导入词书。</p>;
  return <section className="study-card"><p>{session.phase === "retry" ? `错词复习 · 第 ${session.round} 轮` : "背诵"} · {session.index + 1} / {session.queue.length} · 已经背诵 {saved.learned} 个</p><h2>听发音，拼出单词</h2>{!session.feedback && <WordPhonetics word={word} />}<button onClick={() => setRetry(retry + 1)} disabled={!!session.feedback}>重新朗读</button><form onSubmit={e => { e.preventDefault(); void submit(); }}><input ref={input} className="answer" aria-label="英文拼写" value={session.feedback?.answer ?? answer} disabled={busy || !!session.feedback} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} onChange={e => setAnswer(e.target.value)} onKeyDown={e => { if (e.nativeEvent.isComposing && e.key === "Enter") e.preventDefault(); }} /><button className="primary" disabled={busy || !!session.feedback || !answer.trim()} type="submit">检查拼写 ↵</button></form>{session.feedback && <div className={session.feedback.correct ? "feedback correct" : "feedback incorrect"} role="status"><strong>{session.feedback.correct ? "拼写正确" : "拼写错误，再记一次"}</strong><WordCard word={word} /><div className="actions"><button ref={nextButton} onClick={() => setSaved({ ...saved, session: advance(session) })}>{session.index + 1 === session.queue.length ? "查看本轮结果" : "下一个单词"} ↵</button>{onAddWord && <button type="button" disabled={vocabulary.includes(word.id)} onClick={() => onAddWord(word.id)}>{vocabulary.includes(word.id) ? "已添加到生词库" : "添加到生词库"}</button>}</div></div>}{error && <p role="alert">{error}</p>}
    <div className="actions">
      <button type="button" disabled={busy} onClick={() => {
        setAnswer("");
        setError("");
        setSaved(previous => ({ ...previous, session: null }));
      }}>返回</button>
    </div>
  </section>;
}
