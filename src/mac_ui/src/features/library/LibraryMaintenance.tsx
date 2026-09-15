import { useState } from "react";
import type { Word } from "../../contracts";

export interface EditableBook { id: string; name: string; words: readonly Word[] }
interface Props {
  book: EditableBook;
  books: { id: string; name: string }[];
  ready: boolean;
  select: (id: string) => void;
  save: (book: EditableBook, resetProgress?: boolean) => boolean;
  create: (name: string) => boolean;
}
const emptyWord = { spelling: "", meaning: "", example: "", exampleTranslation: "" };
export function LibraryMaintenance({ book, books, ready, select, save, create }: Props) {
  const [newName, setNewName] = useState("");
  const [name, setName] = useState(book.name);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyWord);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const filtered = book.words.filter(w => `${w.spelling} ${w.meaning}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  function clearDraft() { setEditing(null); setDraft(emptyWord); setError(""); }
  function submitWord() {
    const spelling = draft.spelling.trim();
    if (!spelling) { setError("请输入英文单词。"); return; }
    if (book.words.some(w => w.id !== editing && w.spelling.normalize("NFKC").toLowerCase() === spelling.normalize("NFKC").toLowerCase())) {
      setError("这本书中已存在该单词，请修改已有条目。"); return;
    }
    const word: Word = { ...book.words.find(w => w.id === editing), id: editing ?? crypto.randomUUID(), spelling, meaning: draft.meaning.trim(), example: draft.example.trim() || undefined, exampleTranslation: draft.exampleTranslation.trim() || undefined };
    if (save({ ...book, words: editing ? book.words.map(w => w.id === editing ? word : w) : [...book.words, word] })) {
      setMessage(editing ? "单词已保存，各学习模式将使用更新后的内容。" : "单词已添加。可在列表中搜索查看。"); clearDraft();
    }
  }
  return <div className="maintenance">
    <section className="study-card">
      <h2>新增单词书</h2>
      <form className="actions" onSubmit={e => { e.preventDefault(); if (newName.trim() && create(newName.trim())) setNewName(""); }}>
        <label>新词书名称<input required maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} placeholder="例如：我的工作英语" /></label>
        <button className="primary" type="submit" disabled={!newName.trim()}>创建词书</button>
      </form>
    </section>
    <section className="study-card">
      <h2>维护现有词书</h2>
      <label>选择要维护的词书<select value={book.id} onChange={e => select(e.target.value)}>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {ready && <>
        <form className="actions rename-book" onSubmit={e => { e.preventDefault(); if (name.trim() && save({ ...book, name: name.trim() })) setMessage("词书名称已保存。"); }}>
          <label>词书名称<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
          <button type="submit" disabled={!name.trim() || name.trim() === book.name}>保存名称</button>
        </form>
        <p className="muted">修改保存在本机，选书和各学习模式同步使用。英文为必填项，中文释义和例句可逐步补充。</p>
        <h3>{editing ? "修改单词" : "新增单词"}</h3>
        <form className="word-editor" onSubmit={e => { e.preventDefault(); submitWord(); }}>
          <label>英文单词<input required maxLength={128} value={draft.spelling} onChange={e => setDraft({ ...draft, spelling: e.target.value })} /></label>
          <label>中文释义<input maxLength={2000} value={draft.meaning} onChange={e => setDraft({ ...draft, meaning: e.target.value })} /></label>
          <label>英文例句<textarea maxLength={4000} value={draft.example} onChange={e => setDraft({ ...draft, example: e.target.value })} /></label>
          <label>例句翻译<textarea maxLength={4000} value={draft.exampleTranslation} onChange={e => setDraft({ ...draft, exampleTranslation: e.target.value })} /></label>
          <div className="actions"><button className="primary" type="submit">{editing ? "保存单词" : "添加单词"}</button>{editing && <button type="button" onClick={clearDraft}>取消修改</button>}</div>
        </form>
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <div className="word-list-header"><h3>单词清单 · {book.words.length} 个</h3><label>搜索单词<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="英文或中文" /></label></div>
        {!filtered.length && <p>{book.words.length ? "没有匹配的单词。" : "这本书还没有单词，请先添加。"}</p>}
        <ul className="maintenance-list">{filtered.slice(currentPage * 30, (currentPage + 1) * 30).map(w => <li key={w.id}>
          <div><strong>{w.spelling}</strong><p>{w.meaning || "待补充释义"}</p>{w.example && <p className="muted">{w.example}</p>}</div>
          <div className="actions"><button aria-label={`修改 ${w.spelling}`} onClick={() => { setEditing(w.id); setDraft({ spelling: w.spelling, meaning: w.meaning, example: w.example ?? "", exampleTranslation: w.exampleTranslation ?? "" }); setError(""); setMessage(""); }}>修改</button><button aria-label={`删除 ${w.spelling}`} onClick={() => setDeleting(w.id)}>删除</button></div>
          {deleting === w.id && <div className="delete-confirm"><p>删除“{w.spelling}”后，该词书的学习进度和未完成练习将重新开始，生词表会移除此词。</p><button onClick={() => {
            if (save({ ...book, words: book.words.filter(item => item.id !== w.id) }, true)) { setDeleting(null); if (editing === w.id) clearDraft(); setMessage("单词已删除，该词书的学习进度已重置。"); }
          }}>确认删除单词</button><button onClick={() => setDeleting(null)}>取消删除</button></div>}
        </li>)}</ul>
        {pageCount > 1 && <div className="actions"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>第 {currentPage + 1} / {pageCount} 页 · {filtered.length} 个匹配</span><button disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
      </>}
    </section>
  </div>;
}
