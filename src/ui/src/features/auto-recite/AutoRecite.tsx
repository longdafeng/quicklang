import { useEffect, useState } from "react";
import type { Word } from "../../contracts";
import { PositionPreview, speak, wait, useSaved, WordCard } from "../study/shared";
// Keep dictionary labels on the card, but omit them from spoken definitions.
export function spokenMeaning(meaning: string): string {
  return meaning.replace(/(?<=^|[\s，,；;：:、（(\[/&])(?:n|v|vt|vi|adj|adv|ad|prep|pron|conj|art|num|int|interj|aux|det|abbr|phr|pl|sing|un|cn)\.\s*/gi, "")
    .replace(/\s+/g, " ").trim();
}
export function AutoRecite({ words }: { words: readonly Word[] }) {
  const [repeats, setRepeats] = useSaved("auto-repeats", 2);
  const [gap, setGap] = useSaved("auto-gap", 3);
  const [startPosition, setStartPosition] = useState(1);
  const [count, setCount] = useSaved("auto-count", 100);
  const [session, setSession] = useState<{ start: number; end: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [stage, setStage] = useState("准备朗读");
  const [error, setError] = useState("");
  const [navigating, setNavigating] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const openNavigation = () => {
    setRunning(false); setQuery("");
    setPage(Math.floor((session ? index : Math.max(0, startPosition - 1)) / pageSize));
    setNavigating(true);
  };
  const beginAt = (position: number) => {
    setStartPosition(position + 1);
    setSession({ start: position, end: Math.min(words.length, position + count) });
    setIndex(position); setComplete(false); setError(""); setStage("准备朗读");
    setNavigating(false); setRunning(true);
  };
  useEffect(() => {
    if (!running || !words.length || !session) return;
    const controller = new AbortController(); const signal = controller.signal;
    void (async () => {
      try {
        for (let n = 0; n < repeats; n++) {
          setStage(`第 ${n + 1} / ${repeats} 次 · 英文`);
          await speak(words[index].spelling, "en-US", signal);
          const meaning = spokenMeaning(words[index].meaning ?? "");
          if (meaning) {
            setStage(`第 ${n + 1} / ${repeats} 次 · 中文`);
            await speak(meaning, "zh-CN", signal);
          }
          for (const letter of words[index].spelling) {
            setStage(`逐字母朗读 · ${letter.toUpperCase()}`);
            await speak(letter, "en-US", signal);
          }
          setStage(`第 ${n + 1} / ${repeats} 次 · 整词复读`);
          await speak(words[index].spelling, "en-US", signal);
          setStage(`间隔 ${gap} 秒`); await wait(gap * 1000, signal);
        }
        if (index + 1 < session.end) setIndex(index + 1);
        else { setComplete(true); setRunning(false); }
      } catch (e) { if (!signal.aborted) { setError((e as Error).message); setRunning(false); } }
    })();
    const pause = () => setRunning(false);
    window.addEventListener("blur", pause);
    return () => { controller.abort(); window.removeEventListener("blur", pause); };
  }, [running, index, repeats, gap, words, session]);
  if (!words.length) return <p>当前词书为空。</p>;
  const valid = Number.isInteger(startPosition) && startPosition >= 1 && startPosition <= words.length
    && Number.isInteger(count) && count >= 1 && count <= 10000
    && Number.isInteger(repeats) && repeats >= 1 && repeats <= 100
    && Number.isFinite(gap) && gap >= 0 && gap <= 600;
  const end = Math.min(words.length, startPosition - 1 + count);
  if (navigating) {
    const search = query.trim().toLowerCase();
    const matches = words.map((word, position) => ({ word, position })).filter(({ word, position }) =>
      !search || word.spelling.toLowerCase().includes(search) || word.meaning?.toLowerCase().includes(search) || String(position + 1) === search);
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(page, pages - 1);
    return <section className="study-card">
      <h2>单词导航</h2>
      <p>点击单词，从该词开始朗读，最多朗读 {count} 个单词。</p>
      <label className="speed">搜索单词、释义或位置<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <p className="muted">共 {matches.length} 个单词 · 第 {currentPage + 1} / {pages} 页</p>
      <ol className="recite-navigation">
        {matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(({ word, position }) =>
          <li key={word.id}><button aria-current={position === (session ? index : startPosition - 1) ? "true" : undefined} onClick={() => beginAt(position)}>
            <span>{position + 1}. <strong>{word.spelling}</strong></span><span className="muted">{word.meaning}</span>
          </button></li>)}
      </ol>
      {!matches.length && <p>没有找到匹配的单词。</p>}
      <div className="actions">
        <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
        <button onClick={() => setNavigating(false)}>{session ? "返回朗读" : "返回设置"}</button>
      </div>
    </section>;
  }
  if (!session) return <section className="study-card">
    <p className="eyebrow">第一步 · 设置</p>
    <h2>自动飘单词</h2>
    <form className="profile-form" onSubmit={event => {
      event.preventDefault();
      if (!valid) return;
      beginAt(startPosition - 1);
    }}>
      <label>起始单词位置<input type="number" min="1" max={words.length} required value={startPosition || ""} onChange={e => setStartPosition(Number(e.target.value))} /></label>
      <PositionPreview words={words} position={startPosition} />
      <label>本次背诵单词数<input type="number" min="1" max="10000" required value={count || ""} onChange={e => setCount(Number(e.target.value))} /></label>
      <label>每次朗诵次数<input type="number" min="1" max="100" required value={repeats || ""} onChange={e => setRepeats(Number(e.target.value))} /></label>
      <label>每次朗诵间隔（秒）<input type="number" min="0" max="600" step="any" required value={Number.isFinite(gap) ? gap : ""} onChange={e => setGap(e.target.value === "" ? NaN : Number(e.target.value))} /></label>
      <p className="muted">词书共 {words.length} 个单词，位置从 1 开始。{valid ? `本次将朗读第 ${startPosition}–${end} 个，共 ${end - startPosition + 1} 个单词；到词书末尾自动结束。` : "请在允许范围内填写设置。"}</p>
      <button className="primary" type="submit" disabled={!valid}>开始朗读</button>
    </form>
    <button disabled={!valid} onClick={openNavigation}>单词导航</button>
  </section>;
  return <section className="study-card">
    <p className="eyebrow">第二步 · 自动朗读</p>
    <h2>自动飘单词</h2>
    <p>本次 {index - session.start + 1} / {session.end - session.start} · 词书第 {index + 1} 个</p>
    <p role="status">{running ? stage : complete ? "本轮播放完成" : "已暂停，继续后从当前单词重新朗读"}</p>
    <WordCard word={words[index]} />
    <div className="actions">
      <button disabled={index === session.start} onClick={() => { setIndex(index - 1); setComplete(false); }}>上一个</button>
      <button className="primary" onClick={() => {
        setError("");
        if (complete) { setIndex(session.start); setComplete(false); }
        setRunning(!running);
      }}>{running ? "暂停" : complete ? "重新播放" : "继续朗读"}</button>
      <button disabled={index === session.end - 1} onClick={() => { setIndex(index + 1); setComplete(false); }}>下一个</button>
      <button onClick={() => { setRunning(false); setSession(null); setError(""); }}>返回设置</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <button onClick={openNavigation}>单词导航</button>
  </section>;
}
