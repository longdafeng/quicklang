import { useEffect, useRef, useState } from "react";
import type { Word } from "../../contracts";
export interface EditableBook { id: string; name: string; words: readonly Word[] }
interface Props {
  book: EditableBook;
  books: { id: string; name: string }[];
  ready: boolean;
  select: (id: string) => void;
  save: (book: EditableBook, resetProgress?: boolean) => boolean;
  create: (name: string) => boolean;
  resolveWord: (spelling: string, signal: AbortSignal) => Promise<Word>;
  openSettings?: () => void;
}
type Insertion = { position: "start" | "end" | "before" | "after"; anchorId: string };
const emptyWord = { spelling: "", meaning: "", example: "", exampleTranslation: "" };
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
function insertionIndex(words: readonly Word[], insertion: Insertion): number {
  if (insertion.position === "start") return 0;
  if (insertion.position === "end") return words.length;
  const index = words.findIndex(word => word.id === insertion.anchorId);
  if (index < 0) throw new Error("插入锚点已不存在，请重新选择参考单词。");
  return index + (insertion.position === "after" ? 1 : 0);
}
export function LibraryMaintenance({ book, books, ready, select, save, create, resolveWord, openSettings }: Props) {
  const [newName, setNewName] = useState("");
  const [name, setName] = useState(book.name);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyWord);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<Insertion>({ position: "end", anchorId: "" });
  const [anchorQuery, setAnchorQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const latestBook = useRef(book);
  latestBook.current = book;
  useEffect(() => {
    setName(book.name); setQuery(""); setPage(0); setHighlight(null);
    setEditing(null); setDraft(emptyWord); setError(""); setMessage(""); setDeleting(null);
    setInsertion({ position: "end", anchorId: "" }); setAnchorQuery(""); setPending(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [book.id]);
  function cancelAdd() {
    request.current?.abort(); request.current = null; setPending(false);
    setMessage("已取消添加，输入已保留。");
  }
  function locate(words: readonly Word[], id: string) {
    setQuery(""); setPage(Math.max(0, Math.floor(words.findIndex(word => word.id === id) / 30))); setHighlight(id);
  }
  function duplicate(words: readonly Word[], spelling: string, excludedId: string | null = null) {
    const existing = words.find(word => word.id !== excludedId && normalize(word.spelling) === normalize(spelling));
    if (!existing) return false;
    setError("这本书中已存在该单词，请修改已有条目。"); locate(words, existing.id); return true;
  }
  function prepareInsertion(position: "before" | "after", anchorId: string) {
    if (request.current) return;
    if (editing) clearDraft();
    setError(""); setMessage(""); setDeleting(null); setAnchorQuery(""); setInsertion({ position, anchorId });
  }
  const filtered = book.words.filter(w => `${w.spelling} ${w.meaning}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  function clearDraft() { setEditing(null); setDraft(emptyWord); setError(""); }
  async function submitWord() {
    if (request.current || !ready) return;
    setError(""); setMessage("");
    const spelling = draft.spelling.trim();
    if (!spelling) { setError("请输入英文单词。"); return; }
    if (duplicate(book.words, spelling, editing)) return;
    if (editing) {
      const word: Word = { ...book.words.find(w => w.id === editing), id: editing, spelling, meaning: draft.meaning.trim(), example: draft.example.trim() || undefined, exampleTranslation: draft.exampleTranslation.trim() || undefined };
      if (save({ ...book, words: book.words.map(w => w.id === editing ? word : w) })) {
        setMessage("单词已保存，各学习模式将使用更新后的内容。"); clearDraft();
      }
      return;
    }
    const snapshot = { ...insertion };
    try { insertionIndex(book.words, snapshot); }
    catch (cause) { setError((cause as Error).message); return; }
    const controller = new AbortController();
    request.current = controller; setPending(true); setDeleting(null);
    try {
      const resolved = await resolveWord(spelling, controller.signal);
      if (controller.signal.aborted || request.current !== controller || latestBook.current.id !== book.id) return;
      const current = latestBook.current;
      if (duplicate(current.words, resolved.spelling)) return;
      const index = insertionIndex(current.words, snapshot);
      const word = { ...resolved, id: current.words.some(w => w.id === resolved.id) ? crypto.randomUUID() : resolved.id };
      const words = [...current.words.slice(0, index), word, ...current.words.slice(index)];
      if (!save({ ...current, words })) { setError("单词保存失败，请重试。"); return; }
      clearDraft(); locate(words, word.id);
      setMessage(`已添加到「${current.name}」第 ${index + 1} 个；前一个：${words[index - 1]?.spelling ?? "无（书首）"}；后一个：${words[index + 1]?.spelling ?? "无（书尾）"}。`);
      console.info("[library] Word inserted", { bookId: current.id, ordinal: index + 1 });
    } catch (cause) {
      if (controller.signal.aborted || request.current !== controller || latestBook.current.id !== book.id) return;
      console.error("[library] Word insertion failed", { bookId: book.id });
      setError(cause instanceof Error ? cause.message : "添加失败，请重试。");
    } finally {
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }
  return <div className="maintenance">
    <section className="study-card">
      <h2>新增单词书</h2>
      <form className="actions" onSubmit={e => { e.preventDefault(); if (!request.current && newName.trim() && create(newName.trim())) setNewName(""); }}>
        <label>新词书名称<input required maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} placeholder="例如：我的工作英语" /></label>
        <button className="primary" type="submit" disabled={pending || !newName.trim()}>创建词书</button>
      </form>
    </section>
    <section className="study-card">
      <h2>维护现有词书</h2>
      <label>选择要维护的词书<select value={book.id} onChange={e => { cancelAdd(); select(e.target.value); }}>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {ready && <>
        <form className="actions rename-book" onSubmit={e => { e.preventDefault(); if (!request.current && name.trim() && save({ ...book, name: name.trim() })) setMessage("词书名称已保存。"); }}>
          <label>词书名称<input disabled={pending} required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
          <button type="submit" disabled={pending || !name.trim() || name.trim() === book.name}>保存名称</button>
        </form>
        <p className="muted">修改保存在本机，选书和各学习模式同步使用。新增只需输入英文，优先复用词库内容，未找到时由 AI 补全。</p>
        <h3>{editing ? "修改单词" : "新增单词"}</h3>
        <form className="word-editor" aria-busy={pending} onSubmit={e => { e.preventDefault(); void submitWord(); }}>
          <label>英文单词<input required disabled={pending} maxLength={128} value={draft.spelling} onChange={e => setDraft({ ...draft, spelling: e.target.value })} /></label>
          {editing ? <>
            <label>中文释义<input maxLength={2000} value={draft.meaning} onChange={e => setDraft({ ...draft, meaning: e.target.value })} /></label>
            <label>英文例句<textarea maxLength={4000} value={draft.example} onChange={e => setDraft({ ...draft, example: e.target.value })} /></label>
            <label>例句翻译<textarea maxLength={4000} value={draft.exampleTranslation} onChange={e => setDraft({ ...draft, exampleTranslation: e.target.value })} /></label>
          </> : <>
            <label>插入位置<select disabled={pending} value={insertion.position} onChange={e => setInsertion({ ...insertion, position: e.target.value as Insertion["position"] })}>
              <option value="start">书首</option><option value="end">书尾</option><option value="before">指定单词之前</option><option value="after">指定单词之后</option>
            </select></label>
            {(insertion.position === "before" || insertion.position === "after") && <>
              <label>搜索参考单词<input type="search" disabled={pending} value={anchorQuery} onChange={e => setAnchorQuery(e.target.value)} /></label>
              <label>参考单词<select disabled={pending} value={insertion.anchorId} onChange={e => setInsertion({ ...insertion, anchorId: e.target.value })}>
                <option value="">请选择参考单词</option>
                {book.words.filter(word => word.id === insertion.anchorId || normalize(`${word.spelling} ${word.meaning}`).includes(normalize(anchorQuery))).map(word => <option key={word.id} value={word.id}>{word.spelling} · {word.meaning}</option>)}
              </select></label>
            </>}
          </>}
          <div className="actions"><button disabled={pending} className="primary" type="submit">{editing ? "保存单词" : pending ? "正在添加…" : "添加单词"}</button>{editing && <button type="button" onClick={clearDraft}>取消修改</button>}{pending && <button type="button" onClick={cancelAdd}>取消添加</button>}</div>
        </form>
        {error && <><p role="alert">{error}</p>{openSettings && <button disabled={pending} onClick={openSettings}>打开 AI 设置</button>}</>}{message && <p role="status">{message}</p>}
        <div className="word-list-header"><h3>单词清单 · {book.words.length} 个</h3><label>搜索单词<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="英文或中文" /></label></div>
        {!filtered.length && <p>{book.words.length ? "没有匹配的单词。" : "这本书还没有单词，请先添加。"}</p>}
        <ul className="maintenance-list">{filtered.slice(currentPage * 30, (currentPage + 1) * 30).map(w => <li key={w.id} aria-current={highlight === w.id ? "true" : undefined}>
          <div><strong>{w.spelling}</strong>{highlight === w.id && <span> · 已定位</span>}{w.sentences?.some(sentence => /^ai(?:\b|[_:-])/i.test(sentence.source)) && <span className="muted"> · AI 生成</span>}<p>{w.meaning || "待补充释义"}</p>{w.example && <p className="muted">{w.example}</p>}</div>
          <div className="actions"><button disabled={pending} aria-label={`在 ${w.spelling} 前插入`} onClick={() => prepareInsertion("before", w.id)}>前插</button><button disabled={pending} aria-label={`在 ${w.spelling} 后插入`} onClick={() => prepareInsertion("after", w.id)}>后插</button><button disabled={pending} aria-label={`修改 ${w.spelling}`} onClick={() => { setEditing(w.id); setDraft({ spelling: w.spelling, meaning: w.meaning, example: w.example ?? "", exampleTranslation: w.exampleTranslation ?? "" }); setError(""); setMessage(""); }}>修改</button><button disabled={pending} aria-label={`删除 ${w.spelling}`} onClick={() => setDeleting(w.id)}>删除</button></div>
          {deleting === w.id && <div className="delete-confirm"><p>删除“{w.spelling}”后，该词书的学习进度和未完成练习将重新开始，生词表会移除此词。</p><button onClick={() => {
            if (!request.current && save({ ...book, words: book.words.filter(item => item.id !== w.id) }, true)) { setDeleting(null); if (editing === w.id) clearDraft(); setMessage("单词已删除，该词书的学习进度已重置。"); }
          }}>确认删除单词</button><button onClick={() => setDeleting(null)}>取消删除</button></div>}
        </li>)}</ul>
        {pageCount > 1 && <div className="actions"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage + 1} / {pageCount} 页 · {filtered.length} 个匹配</span><button disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
      </>}
    </section>
  </div>;
}
