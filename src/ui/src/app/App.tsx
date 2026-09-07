import { useEffect, useState } from "react";
import type { RuntimeStatus, StudyMode, Word } from "../contracts";
import { runtimeStatus } from "../adapters/runtime";
import { Spelling } from "../features/spelling/Spelling";
import { AutoRecite } from "../features/auto-recite/AutoRecite";
import { Flashcard } from "../features/flashcard/Flashcard";

const words: readonly Word[] = [
  { id: "demo-1", spelling: "remember", meaning: "记住；回想起" },
  { id: "demo-2", spelling: "discover", meaning: "发现；探索到" },
  { id: "demo-3", spelling: "practice", meaning: "练习；实践" },
];
const modes: { id: StudyMode; label: string; description: string }[] = [
  { id: "spelling", label: "背诵拼写", description: "用键盘巩固记忆" },
  { id: "flashcard", label: "卡片回忆", description: "先回忆，再揭晓" },
  { id: "auto", label: "自动默念", description: "跟随字母慢慢拼写" },
];

export default function App() {
  const [mode, setMode] = useState<StudyMode>("spelling");
  const [page, setPage] = useState<"study" | "library" | "settings">("study");
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  useEffect(() => { void runtimeStatus().then(setStatus).catch(() => setStatus({ phase: "error", storage: "unavailable", persistence_ready: false })); }, []);
  return <div className="layout">
    <aside>
      <a className="brand" href="#main"><span className="brand-mark">Q</span>QuickLang</a>
      <p className="sidebar-caption">每天一点，记得更久</p>
      <nav aria-label="主导航">
        <button aria-current={page === "study" ? "page" : undefined} onClick={() => setPage("study")}>今日学习</button>
        <button aria-current={page === "library" ? "page" : undefined} onClick={() => setPage("library")}>我的词库</button>
        <button aria-current={page === "settings" ? "page" : undefined} onClick={() => setPage("settings")}>设置与许可</button>
      </nav>
      <div className="sidebar-footer"><span className="dot" />个人学习空间<br /><small>框架预览 · v0.1.0</small></div>
    </aside>
    <main id="main">
      <header><span className="eyebrow">YOUR DAILY PRACTICE</span><span className="badge">本地优先</span></header>
      <h1>{page === "study" ? "让每一次回忆，都更清晰。" : page === "library" ? "从一本词库开始。" : "属于你的学习节奏。"}</h1>
      <p className="subtitle">QuickLang 个人背单词 · macOS / iPhone / iPad</p>
      <div className="notice" role="status">框架预览：seekdb 尚未接入，学习进度不会保存。{status?.phase === "browser_preview" ? "当前为浏览器开发预览。" : ""}</div>
      {page === "study" && <>
        <div className="mode-picker" aria-label="学习模式">{modes.map(item =>
          <button key={item.id} className={mode === item.id ? "selected" : ""} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>
            <strong>{item.label}</strong><small>{item.description}</small>
          </button>)}</div>
        {mode === "spelling" ? <Spelling words={words} /> : mode === "flashcard" ? <Flashcard words={words} /> : <AutoRecite words={words} />}
      </>}
      {page === "library" && <section className="study-card">
        <h2>Ink-Learner 词库接入</h2><p>已设计 11 本词库的内容导入流程；当前页面使用 3 个独立编写的示例词。</p>
        <p>完整词库在内容导入、来源核验和 seekdb 接通后开放。</p>
        <div className="chips">{["初中", "高中", "四级", "六级", "考研", "托福", "SAT", "雅思", "GRE", "GMAT", "BEC"].map(x => <span key={x}>{x}</span>)}</div>
      </section>}
      {page === "settings" && <section className="study-card legal">
        <h2>关于 QuickLang</h2><p>独立实现的个人词汇学习应用，借鉴 Ink-Learner、Mnemosyne 与 LibreLingoRelive 的产品思想。</p>
        <h3>许可与内容</h3><p>QuickLang 自有代码：Apache License 2.0。Ink 来源的词库按 CC BY-SA 4.0 单独管理；当前示例词为独立编写。</p>
        <p>应用包内附 LICENSE、NOTICE.md 和第三方许可文件。词库导入包自带原始署名、修改记录和许可正文。</p>
        <h3>功能状态</h3><p>拼写、卡片、自动默念可预览。持久化、账号配对、同步、备份恢复尚未接入。</p>
        <p>存储状态：{status?.storage ?? "正在检测"}</p>
      </section>}
      <footer>少一点遗忘，多一点积累。</footer>
    </main>
  </div>;
}
