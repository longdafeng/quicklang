import { useEffect, useState } from "react";
import type { Word } from "../../contracts";
import { PositionPreview, speak, wait, useSaved, WordCard, WordPhonetics } from "../study/shared";
export function Flashcard({ words, bookId = "demo" }: { words: readonly Word[]; bookId?: string }) {
  const [count, setCount] = useSaved("flash-count", 100);
  const [gap, setGap] = useSaved("flash-gap", 10);
  const [repeats, setRepeats] = useSaved("flash-repeats", 1);
  const [progress, setProgress] = useSaved(`flash:${bookId}`, { learned: 0, end: 0 });
  const [startPosition, setStartPosition] = useState(Math.min(progress.learned + 1, words.length) || 1);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [retry, setRetry] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const openNavigation = () => {
    setRevealed(false);
    setQuery("");
    setPage(Math.floor((active ? progress.learned : Math.max(0, startPosition - 1)) / pageSize));
    setNavigating(true);
  };
  const beginAt = (position: number) => {
    setStartPosition(position + 1);
    setRevealed(false); setError("");
    setProgress({ learned: position, end: Math.min(words.length, position + count) });
    setNavigating(false);
  };
  const active = progress.learned < progress.end && progress.learned < words.length;
  /** Save completion of the current word and move to the next session position. */
  const advance = () => {
    setRevealed(false);
    setStartPosition(Math.min(words.length, progress.learned + 2));
    setProgress({ ...progress, learned: progress.learned + 1 });
  };
  useEffect(() => {
    if (!active || navigating || (revealed && error)) return;
    const controller = new AbortController(); const signal = controller.signal;
    setError("");
    void (async () => {
      try {
        if (revealed) {
          await wait(gap * 1000, signal);
          if (!signal.aborted) advance();
          return;
        }
        for (let n = 0; n < repeats; n++) {
          setStage(`第 ${n + 1} / ${repeats} 次朗读`);
          await speak(words[progress.learned].spelling, "en-US", signal);
          if (signal.aborted) return;
          setStage(`第 ${n + 1} / ${repeats} 次朗读结束 · 停顿 ${gap} 秒`);
          await wait(gap * 1000, signal);
        }
        if (signal.aborted) return;
        setRevealed(true);
      } catch (e) {
        if (!signal.aborted) { setError((e as Error).message); setRevealed(true); }
      }
    })();
    return () => controller.abort();
  }, [active, navigating, progress.learned, retry, words, gap, repeats, revealed]);
  useEffect(() => {
    if (!active || navigating) return;
    /** Advance one learning step for Enter while leaving text entry untouched. */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable=\"false\"]), a")) return;
      event.preventDefault();
      if (event.repeat) return;
      if (revealed) advance();
      else setRevealed(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, navigating, revealed, progress, words.length]);
  const valid = Number.isInteger(startPosition) && startPosition >= 1 && startPosition <= words.length
    && Number.isInteger(count) && count >= 1 && count <= 10000
    && Number.isInteger(repeats) && repeats >= 1 && repeats <= 100
    && Number.isFinite(gap) && gap >= 0 && gap <= 600;
  if (navigating) {
    const search = query.trim().toLowerCase();
    const matches = words.map((word, position) => ({ word, position })).filter(({ word, position }) =>
      !search || word.spelling.toLowerCase().includes(search) || word.meaning?.toLowerCase().includes(search) || String(position + 1) === search);
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(page, pages - 1);
    return <section className="study-card">
      <h2>单词导航</h2>
      <p>点击单词，从该词开始强化学习，最多学习 {count} 个单词。</p>
      <label className="speed">搜索单词、释义或位置<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <p className="muted">共 {matches.length} 个单词 · 第 {currentPage + 1} / {pages} 页</p>
      <ol className="recite-navigation">
        {matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(({ word, position }) =>
          <li key={word.id}><button aria-current={position === (active ? progress.learned : startPosition - 1) ? "true" : undefined} onClick={() => beginAt(position)}>
            <span>{position + 1}. <strong>{word.spelling}</strong></span><span className="muted">{word.meaning}</span>
          </button></li>)}
      </ol>
      {!matches.length && <p>没有找到匹配的单词。</p>}
      <div className="actions">
        <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
        <button onClick={() => setNavigating(false)}>{active ? "返回学习" : "返回设置"}</button>
      </div>
    </section>;
  }
  if (!active) return <section className="study-card">
    <h2>设置本次学习</h2>
    <p>已经背诵 {progress.learned} 个单词 · 剩余 {words.length - progress.learned} 个</p>
    <form className="profile-form" onSubmit={e => {
      e.preventDefault();
      if (valid) beginAt(startPosition - 1);
    }}>
      <label>起始单词位置<input type="number" min="1" max={words.length} required value={startPosition || ""} onChange={e => setStartPosition(Number(e.target.value))} /></label>
      <PositionPreview words={words} position={startPosition} />
      <label>本次背诵数量<input type="number" min="1" max="10000" required value={count || ""} onChange={e => setCount(Number(e.target.value))} /></label>
      <label>停顿时间（秒）<input type="number" min="0" max="600" step="any" required value={Number.isFinite(gap) ? gap : ""} onChange={e => setGap(e.target.value === "" ? NaN : Number(e.target.value))} /></label>
      <label>单词朗读次数<input type="number" min="1" max="100" required value={repeats || ""} onChange={e => setRepeats(Number(e.target.value))} /></label>
      <p className="muted">每读完一次单词停顿设定时间，最后一次停顿结束后显示中文和例句，再停顿设定时间后自动进入下一个单词，也可手动提前进入。默认停顿 10 秒、朗读 1 次，此后沿用上次设置。</p>
      <p className="muted">{valid ? `本次从第 ${startPosition} 个单词开始，最多学习 ${Math.min(count, words.length - startPosition + 1)} 个。` : "请在允许范围内填写设置。"}</p>
      <button className="primary" type="submit" disabled={!valid}>开始学习</button>
    </form>
    <button disabled={!valid} onClick={openNavigation}>单词导航</button>
    {!words.length && <p>当前词书为空。</p>}
    {!!words.length && progress.learned >= words.length && <p>这本书已经全部学完，可选择起始位置重新学习。</p>}
  </section>;
  return <section className="study-card">
    <p>强化学习 · 已经背诵 {progress.learned} 个 · 本次还剩 {progress.end - progress.learned} 个</p>
    {revealed ? <WordCard word={words[progress.learned]} /> : <><h2 className="word">{words[progress.learned].spelling}</h2><WordPhonetics word={words[progress.learned]} /><p role="status">{stage}</p></>}
    {revealed && !error && <p role="status">{gap} 秒后自动进入下一个单词</p>}
    <p className="muted">按 Enter {revealed ? "进入下一个单词" : "显示中文和例句"}</p>
    <div className="actions">
      <button onClick={() => { setRevealed(false); setRetry(retry + 1); }}>重新朗读</button>
      <button onClick={openNavigation}>单词导航</button>
      <button className="primary" disabled={!revealed} onClick={advance}>记住了，下一个</button>
      <button onClick={() => {
        setStartPosition(progress.learned + 1);
        setProgress({ ...progress, end: progress.learned });
      }}>返回设置</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
