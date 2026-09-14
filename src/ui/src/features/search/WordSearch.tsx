import { useEffect, useMemo, useState } from "react";
import type { Word } from "../../contracts";
import { loadBook } from "../library/books";
import { WordCard } from "../study/shared";

export interface SearchBook { id: string; name: string; words: readonly Word[]; bundled: boolean }
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
export function WordSearch({ books, currentBookId }: { books: SearchBook[]; currentBookId: string }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [loaded, setLoaded] = useState<Record<string, readonly Word[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setFailed([]);
    const bundled = books.filter(b => b.bundled);
    void Promise.allSettled(bundled.map(b => loadBook(b.id, controller.signal))).then(results => {
      if (controller.signal.aborted) return;
      const next: Record<string, readonly Word[]> = {}; const errors: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") next[bundled[i].id] = result.value;
        else errors.push(bundled[i].name);
      });
      setLoaded(next); setFailed(errors); setLoading(false);
    });
    return () => controller.abort();
  }, [books, retry]);
  const results = useMemo(() => {
    const term = normalize(query);
    if (!term) return [];
    return books.filter(b => scope === "all" || b.id === currentBookId).flatMap(book =>
      (book.bundled ? loaded[book.id] ?? [] : book.words).flatMap(word => {
        const english = normalize(word.spelling); const chinese = normalize(word.meaning);
        if (!english.includes(term) && !chinese.includes(term)) return [];
        const rank = english === term || chinese === term ? 0 : english.startsWith(term) ? 1 : 2;
        return [{ book, word, rank }];
      })).sort((a, b) => a.rank - b.rank || a.word.spelling.localeCompare(b.word.spelling));
  }, [books, loaded, query, scope, currentBookId]);
  const pages = Math.max(1, Math.ceil(results.length / 20));
  const currentPage = Math.min(page, pages - 1);
  return <section className="search-panel">
    <form className="study-card search-form" role="search" onSubmit={e => { e.preventDefault(); setQuery(input.trim()); setPage(0); }}>
      <label>中文或英文<input type="search" value={input} onChange={e => setInput(e.target.value)} placeholder="例如：记住 / remember" maxLength={128} /></label>
      <label>查询范围<select value={scope} onChange={e => { setScope(e.target.value); setPage(0); }}><option value="all">全部词书</option><option value="current">当前词书</option></select></label>
      <button type="submit" className="primary" disabled={!input.trim()}>查询单词</button>
      <p className="muted">支持英文和中文释义的部分匹配，英文不区分大小写。优先显示完全匹配的结果；同一单词在不同词书中分别展示。</p>
    </form>
    {loading && <p role="status">正在加载本机词库，已可查询的内容会先显示。</p>}
    {!!failed.length && <p role="alert">以下词书加载失败，查询结果可能不完整：{failed.join("、")}。<button onClick={() => setRetry(n => n + 1)}>重试加载</button></p>}
    {!query ? <p className="muted">输入中文或英文，按回车或点击“查询单词”。</p> : <>
      <p role="status">“{query}” · 找到 {results.length} 条{loading ? "（词库加载中）" : ""}</p>
      {!results.length && !loading && <p>没有找到对应单词，请换一个关键词，或在词库维护中补充单词和中文释义。</p>}
      {results.slice(currentPage * 20, (currentPage + 1) * 20).map(({ book, word }) => <article className="study-card search-result" key={`${book.id}:${word.id}`}><p className="eyebrow">所属词书：{book.name}</p><WordCard word={word} /></article>)}
      {pages > 1 && <div className="actions"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage + 1} / {pages} 页</span><button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
    </>}
  </section>;
}
