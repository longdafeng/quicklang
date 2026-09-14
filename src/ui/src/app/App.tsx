import { Conversation } from "../features/conversation/Conversation";
import { useEffect, useMemo, useState } from "react";
import type { Word } from "../contracts";
import { Spelling } from "../features/spelling/Spelling";
import { AutoRecite } from "../features/auto-recite/AutoRecite";
import { Flashcard } from "../features/flashcard/Flashcard";
import { useSaved, WordCard } from "../features/study/shared";
import { books as inkBooks, contentBase, loadBook } from "../features/library/books";
import { LibraryMaintenance, type EditableBook } from "../features/library/LibraryMaintenance";
import { WordSearch } from "../features/search/WordSearch";
import { ProfileContext, loadProfiles, saveProfiles, useStorageKey, levels, type Profile } from "../features/users/profiles";
import { UserSettings, UserPicker } from "../features/users/Users";
import { loadAISettings, SystemSettings } from "../features/settings/SystemSettings";
import { Listening } from "../features/listening/Listening";
interface Book { id: string; name: string; words: Word[] }
const defaults: Book[] = [
  { id: "daily", name: "日常英语 · 示例书", words: [
    { id: "remember", spelling: "remember", meaning: "记住；回想起", example: "I remember your name.", exampleTranslation: "我记得你的名字。" },
    { id: "discover", spelling: "discover", meaning: "发现；探索到", example: "We discover something new every day.", exampleTranslation: "我们每天都有新发现。" },
    { id: "practice", spelling: "practice", meaning: "练习；实践", example: "Practice makes learning easier.", exampleTranslation: "练习让学习更轻松。" },
  ] },
  { id: "travel", name: "旅行英语 · 示例书", words: [
    { id: "ticket", spelling: "ticket", meaning: "票；入场券", example: "I need a train ticket.", exampleTranslation: "我需要一张火车票。" },
    { id: "journey", spelling: "journey", meaning: "旅行；旅程", example: "Enjoy your journey.", exampleTranslation: "祝你旅途愉快。" },
    { id: "arrive", spelling: "arrive", meaning: "到达", example: "We arrive at noon.", exampleTranslation: "我们中午到达。" },
  ] },
];
const menuGroups = [
  { id: "word-study", label: "单词背诵", pages: [
    { id: "books", label: "选书" },
    { id: "auto", label: "自动飘单词" },
    { id: "flash", label: "强化学习" },
    { id: "spell", label: "背诵" },
    { id: "vocabulary", label: "生词表" },
    { id: "progress", label: "学习进度" },
  ] },
  { id: "listening-speaking", label: "听说训练", pages: [
    { id: "conversation", label: "听说练习" },
    { id: "listening", label: "听力训练" },
    { id: "ai-coach", label: "AI 陪练" },
  ] },
  { id: "tools", label: "工具", pages: [
    { id: "search", label: "查询" },
    { id: "maintenance", label: "词库维护" },
  ] },
  { id: "preferences", label: "设置", pages: [
    { id: "user-settings", label: "用户设置" },
    { id: "settings", label: "系统设置" },
  ] },
] as const;
type MenuGroup = typeof menuGroups[number]["id"];
type Page = typeof menuGroups[number]["pages"][number]["id"];
const pages = menuGroups.flatMap(group => [...group.pages]);
export default function App() {
  const [initial] = useState(() => { try { const profiles = loadProfiles(); const last = localStorage.getItem("quicklang:last-user"); return { profiles, active: profiles.find(p => p.id === last)?.id ?? profiles[0]?.id ?? null, error: "" }; } catch { return { profiles: [] as Profile[], active: null, error: "用户数据无法读取，请检查本机存储后重新打开。" }; } });
  const [profiles, setProfiles] = useState(initial.profiles);
  const [active, setActive] = useState<string | null>(initial.active);
  const [initialPage, setInitialPage] = useState<Page>("progress");
  const [error, setError] = useState(initial.error);
  const profile = profiles.find(p => p.id === active);
  function save(name: string, level: Profile["level"], creating = false): boolean {
    if (initial.error) return false;
    if (profiles.some(p => (creating || p.id !== active) && p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setError("这个用户名称已存在，请换一个名称。"); return false; }
    const next = { id: (!creating && profile?.id) || crypto.randomUUID(), name, level };
    const updated = !creating && profile ? profiles.map(p => p.id === active ? next : p) : [...profiles, next];
    try {
      const previous = localStorage.getItem("quicklang:last-user");
      localStorage.setItem("quicklang:last-user", next.id);
      try { saveProfiles(updated, !profiles.length ? next.id : undefined); }
      catch (error) {
        if (previous === null) localStorage.removeItem("quicklang:last-user");
        else localStorage.setItem("quicklang:last-user", previous);
        throw error;
      }
    }
    catch { setError("用户设置保存失败，请检查本机存储空间后重试。"); return false; }
    if (creating) setInitialPage("books");
    setProfiles(updated); setActive(next.id); setError(""); return true;
  }
  function choose(id: string) {
    try { localStorage.setItem("quicklang:last-user", id); }
    catch { setError("用户切换失败，请检查本机存储空间后重试。"); return; }
    setInitialPage("progress"); setActive(id); setError("");
  }
  const create = (name: string, level: Profile["level"]) => save(name, level, true);
  if (!profile) return <UserPicker profiles={profiles} choose={choose} create={create} error={error} />;
  return <ProfileContext.Provider value={profile.id}><LearningApp key={profile.id} initialPage={initialPage} profile={profile} profiles={profiles} choose={choose} createProfile={create} saveProfile={save} profileError={error} /></ProfileContext.Provider>;
}
function LearningApp({ initialPage, profile, profiles, choose, createProfile, saveProfile, profileError }: { initialPage: Page; profile: Profile; profiles: Profile[]; choose: (id: string) => void; createProfile: (name: string, level: Profile["level"]) => boolean; saveProfile: (name: string, level: Profile["level"]) => boolean; profileError: string }) {
  const getKey = useStorageKey();
  const [page, setCurrentPage] = useState<Page>(initialPage);
  const [expandedGroup, setExpandedGroup] = useState<MenuGroup>("word-study");
  function setPage(next: Page) {
    setCurrentPage(next);
    setExpandedGroup(menuGroups.find(group => group.pages.some(item => item.id === next))!.id);
  }
  const [aiSettings, setAISettings] = useState(loadAISettings);
  const [apiKey, setApiKey] = useState("");
  const [imported, setImported] = useSaved<Book[]>("books", []);
  const [selected, setSelected] = useSaved("selected-book", "daily");
  const [vocabulary, setVocabulary] = useSaved<Record<string, string[]>>("vocabulary", {});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<{ id: string; words: readonly Word[] } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const overrides = new Map(imported.map(b => [b.id, b]));
  const books = [...inkBooks.map(b => ({ id: b.id, name: b.title, count: b.count, words: [] as readonly Word[] })), ...defaults.map(b => ({ ...b, count: b.words.length })), ...imported.filter(b => !inkBooks.some(i => i.id === b.id) && !defaults.some(i => i.id === b.id)).map(b => ({ ...b, count: b.words.length }))].map(b => { const override = overrides.get(b.id); return override ? { ...override, count: override.words.length } : b; });
  const searchBooks = useMemo(() => books.map(b => ({ ...b, bundled: inkBooks.some(i => i.id === b.id) && !overrides.has(b.id) })), [imported]);
  const selectedBook = books.find(b => b.id === selected) ?? books.find(b => b.id === "daily")!;
  const isInk = inkBooks.some(b => b.id === selectedBook.id) && !overrides.has(selectedBook.id);
  const ready = !isInk || loaded?.id === selectedBook.id;
  const book = { ...selectedBook, words: isInk && loaded?.id === selectedBook.id ? loaded.words : selectedBook.words };
  useEffect(() => {
    const controller = new AbortController(); setLoadError("");
    if (isInk) void loadBook(selectedBook.id, controller.signal).then(words => {
      if (!controller.signal.aborted) setLoaded({ id: selectedBook.id, words });
    }).catch(() => { if (!controller.signal.aborted) setLoadError("词书加载失败，请重试。"); });
    return () => controller.abort();
  }, [selectedBook.id, isInk, retry]);
  const known = vocabulary[book.id] ?? [];
  const addWord = (id: string) => setVocabulary(p => ({ ...p, [book.id]: [...new Set([...(p[book.id] ?? []), id])] }));
  useEffect(() => {
    const fail = () => setError("本机存储不可用，当前修改无法保存。请检查浏览器存储空间或隐私设置。");
    window.addEventListener("storage-failed", fail); return () => window.removeEventListener("storage-failed", fail);
  }, []);
  function saveBook(next: EditableBook, resetProgress = false): boolean {
    const updated = [...imported.filter(b => b.id !== next.id), { ...next, words: [...next.words] }];
    // Check persistence before reporting success or changing the selected book.
    try {
      localStorage.setItem(getKey("books"), JSON.stringify(updated));
      if (resetProgress) {
        localStorage.removeItem(getKey(`flash:${next.id}`));
        localStorage.removeItem(getKey(`spell:${next.id}`));
      }
    } catch { setError("词书保存失败，请检查本机存储空间后重试。"); return false; }
    setImported(updated);
    const ids = new Set(next.words.map(w => w.id));
    setVocabulary(p => ({ ...p, [next.id]: (p[next.id] ?? []).filter(id => ids.has(id)) }));
    setError("");
    return true;
  }
  function createBook(name: string): boolean {
    const next = { id: crypto.randomUUID(), name, words: [] };
    if (!saveBook(next)) return false;
    setSelected(next.id);
    return true;
  }
  async function importBook(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("词书文件不能超过 10 MB。");
      const data = JSON.parse(await file.text());
      if (typeof data.name !== "string" || !data.name.trim() || !Array.isArray(data.words) || !data.words.length) throw new Error("请提供词书名称 name 和非空的 words 列表。");
      const words: Word[] = data.words.map((w: Word, i: number) => {
        if (!w || typeof w.spelling !== "string" || !w.spelling.trim() || typeof w.meaning !== "string" || !w.meaning.trim()) throw new Error(`第 ${i + 1} 个单词缺少 spelling 或 meaning。`);
        return { id: String(i), spelling: w.spelling.trim(), meaning: w.meaning.trim(), example: typeof w.example === "string" ? w.example : undefined, exampleTranslation: typeof w.exampleTranslation === "string" ? w.exampleTranslation : undefined };
      });
      const next = { id: crypto.randomUUID(), name: data.name.trim(), words };
      if (saveBook(next)) setSelected(next.id);
    } catch (e) { setError(e instanceof SyntaxError ? "JSON 格式不正确，请检查文件。" : (e as Error).message); }
  }
  return <div className="layout"><aside><a className="brand" href="#main"><span className="brand-mark">Q</span>QuickLang</a><p className="sidebar-caption">每天一点，记得更久</p><div className="current-user"><strong>{profile.name}</strong><small>{levels[profile.level]}</small><button onClick={() => setPage("user-settings")}>切换用户</button></div><nav className="main-nav" aria-label="主导航">{menuGroups.map(group => <section className="nav-group" key={group.id} aria-labelledby={`nav-${group.id}`}>
      <h2 className="nav-group-title"><button id={`nav-${group.id}`} aria-expanded={expandedGroup === group.id} aria-controls={`nav-items-${group.id}`} onClick={() => setExpandedGroup(group.id)}>{group.label}<span aria-hidden="true">{expandedGroup === group.id ? "⌄" : "›"}</span></button></h2>
      <ul className="nav-items" id={`nav-items-${group.id}`} hidden={expandedGroup !== group.id}>{group.pages.map(p => <li key={p.id}><button aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}>{p.label}</button></li>)}</ul>
    </section>)}</nav><div className="sidebar-footer">当前词书<br /><strong>{book.name}</strong><br /><small>{book.count} 个单词</small></div></aside><main id="main"><header><span className="eyebrow">YOUR DAILY PRACTICE</span><a className="badge" href="https://github.com/longdafeng/quicklang/issues" target="_blank" rel="noopener noreferrer">反馈意见</a></header><h1>{pages.find(p => p.id === page)?.label}</h1><p className="subtitle">{page === "listening" ? "用自己的材料，练习听懂与表达" : page === "user-settings" ? "管理当前用户资料，或切换、添加用户" : page === "settings" ? "管理应用偏好与大模型服务" : `${book.name} · ${book.count} 个单词`}</p>{error && <p className="notice" role="alert">{error}</p>}
    {page === "user-settings" && <UserSettings profile={profile} profiles={profiles} choose={choose} create={createProfile} save={saveProfile} error={profileError} />}
    {page === "progress" && <section className="study-card progress-panel"><h2>{profile.name}的学习进度</h2><p className="muted">强化学习与背诵分别统计；背诵数量包含已作答的错词，不代表已掌握。</p><div className="book-grid">{books.map(b => {
      const read = (mode: string) => { try { return Math.min(b.count, Math.max(0, Number(JSON.parse(localStorage.getItem(getKey(`${mode}:${b.id}`)) ?? "{}").learned) || 0)); } catch { return 0; } };
      const flash = read("flash"), spell = read("spell");
      return <article className="book-choice" key={b.id}><h3>{b.name}</h3><p>强化学习：{flash} / {b.count}</p><progress aria-label={`${b.name}强化学习进度`} value={flash} max={b.count || 1} /><p>背诵：{spell} / {b.count}</p><progress aria-label={`${b.name}背诵进度`} value={spell} max={b.count || 1} /><p>生词：{(vocabulary[b.id] ?? []).length} 个</p><button onClick={() => { setSelected(b.id); setPage("flash"); }}>继续学习</button></article>;
    })}</div></section>}
    {page === "books" && <><p>选中的词书用于自动飘单词、强化学习、背诵和生词表。每本书分别保存学习进度。</p><div className="book-grid">{books.map(b => <button key={b.id} className={`book-choice ${b.id === book.id ? "selected" : ""}`} aria-pressed={b.id === book.id} onClick={() => setSelected(b.id)} onDoubleClick={() => { setSelected(b.id); setPage("flash"); }}><strong>{b.name}</strong><p>{b.count} 个单词</p><span>{b.id === book.id ? "正在学习" : "选择这本书"}</span></button>)}</div><p className="muted">11 本词书均已配有中文释义和双语例句，随应用打包供离线阅读；原先缺失的例句已由 AI 补充并标记。来源：<a href="https://github.com/suilang/ink-learner">Ink-Learner</a> · <a href={`${contentBase}LICENSE`}>CC BY-SA 4.0</a> · <a href={`${contentBase}ATTRIBUTION.md`}>原始署名</a> · <a href={`${contentBase}manifest.json`}>来源与修改记录</a> · <a href={`${contentBase}coverage.json`}>内容完整度</a></p><section className="study-card import"><h2>导入自己的词书</h2><p>除 11 本 Ink-Learner 词书外，还提供两本独立编写的示例书。可导入 JSON 单词清单，例句字段可选。</p><pre>{JSON.stringify({ name: "我的词书", words: [{ spelling: "hello", meaning: "你好", example: "Hello, my friend.", exampleTranslation: "你好，我的朋友。" }] }, null, 2)}</pre><label>选择 JSON 文件 <input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void importBook(file); e.target.value = ""; }} /></label></section><p className="actions"><button className="primary" onClick={() => setPage("flash")}>确定</button></p></>}
    {page !== "listening" && page !== "settings" && page !== "books" && page !== "search" && page !== "user-settings" && page !== "progress" && isInk && <p className="muted">中文释义和双语例句可离线阅读；AI 补充例句已单独标记。</p>}
    {page !== "listening" && page !== "settings" && page !== "books" && page !== "search" && page !== "user-settings" && page !== "progress" && !ready && (loadError ? <p role="alert">{loadError}<button onClick={() => setRetry(n => n + 1)}>重新加载</button></p> : <p role="status">正在加载词书…</p>)}
    {page === "listening" && <Listening settings={aiSettings} apiKey={apiKey} openSettings={() => setPage("settings")} />}
    {page === "settings" && <SystemSettings settings={aiSettings} apiKey={apiKey} onSave={(settings, key) => { setAISettings(settings); setApiKey(key); }} />}
    {page === "search" && <WordSearch books={searchBooks} currentBookId={book.id} />}
    {page === "maintenance" && <LibraryMaintenance key={book.id} book={book} books={books} ready={ready} select={setSelected} save={saveBook} create={createBook} />}
    {ready && page === "ai-coach" && <Conversation key={`coach:${book.id}`} words={book.words} bookId={book.id} onWrong={addWord} settings={aiSettings} apiKey={apiKey} openSettings={() => setPage("settings")} coachOnly />}
    {ready && page === "conversation" && <Conversation key={book.id} words={book.words} bookId={book.id} onWrong={addWord} settings={aiSettings} apiKey={apiKey} openSettings={() => setPage("settings")} />}
    {ready && page === "auto" && <AutoRecite key={book.id} words={book.words} />}
    {ready && page === "flash" && <Flashcard key={book.id} bookId={book.id} words={book.words} />}
    {ready && page === "spell" && <Spelling key={book.id} bookId={book.id} words={book.words} onWrong={addWord} onAddWord={addWord} vocabulary={known} />}
    {ready && page === "vocabulary" && <section className="study-card"><h2>生词表 · {known.length} 个</h2><p className="muted">背诵中拼错的词会自动加入，也可以手动收藏。移出生词表不会中断错词复习。</p><label>添加单词 <select value="" onChange={e => { if (e.target.value) addWord(e.target.value); }}><option value="">选择当前词书中的单词</option>{book.words.filter(w => !known.includes(w.id)).map(w => <option key={w.id} value={w.id}>{w.spelling} · {w.meaning}</option>)}</select></label>{!known.length && <p>还没有生词。</p>}{book.words.filter(w => known.includes(w.id)).map(w => <article className="vocabulary-item" key={w.id}><WordCard word={w} /><button onClick={() => setVocabulary({ ...vocabulary, [book.id]: known.filter(id => id !== w.id) })}>移出生词表</button></article>)}</section>}
    <footer>学习进度保存在当前设备，清除应用数据会删除记录。</footer></main></div>;
}
