import { useState } from "react";
import { levels, type Profile } from "./profiles";
export function ProfileForm({ profile, save }: { profile?: Profile; save: (name: string, level: Profile["level"]) => boolean }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [level, setLevel] = useState<Profile["level"]>(profile?.level ?? "A1");
  const [saved, setSaved] = useState(false);
  return <form className="profile-form" onSubmit={e => { e.preventDefault(); if (name.trim()) setSaved(save(name.trim(), level)); }}>
    <label>用户名称<input required maxLength={40} value={name} onChange={e => { setName(e.target.value); setSaved(false); }} placeholder="例如：小明" /></label>
    <label>英语水平<select value={level} onChange={e => { setLevel(e.target.value as Profile["level"]); setSaved(false); }}>{Object.entries(levels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <p className="muted">按自己的大概水平选择，之后可以随时调整。这是自评设置，不是测试成绩。</p>
    <button className="primary" disabled={!name.trim()}>{profile ? "保存用户设置" : "创建用户并开始"}</button>{saved && profile && <p role="status">用户设置已保存。</p>}
  </form>;
}
export function UserPicker({ profiles, choose, create, error }: { profiles: Profile[]; choose: (id: string) => void; create: (name: string, level: Profile["level"]) => boolean; error: string }) {
  return <main className="user-picker"><span className="eyebrow">QUICKLANG</span><h1>今天谁来学习？</h1><p className="subtitle">每位用户拥有独立的学习进度、英语水平设置和生词表。</p>{error && <p role="alert" className="notice">{error}</p>}
    <div className="book-grid">{profiles.map(p => <button className="book-choice" key={p.id} onClick={() => choose(p.id)}><strong>{p.name}</strong><p>{levels[p.level]}</p><span>进入学习</span></button>)}</div>
    <section className="study-card"><h2>添加用户</h2>{!profiles.length && <p className="muted">如果本机已有学习记录，会保留到第一个用户中。</p>}<ProfileForm save={create} /></section><footer>用户资料和学习记录保存在当前设备。</footer>
  </main>;
}

export function UserSettings({ profile, profiles, choose, create, save, error }: { profile: Profile; profiles: Profile[]; choose: (id: string) => void; create: (name: string, level: Profile["level"]) => boolean; save: (name: string, level: Profile["level"]) => boolean; error: string }) {
  const [adding, setAdding] = useState(false);
  return <div className="user-settings">
    {error && <p role="alert" className="notice">{error}</p>}
    <section className="study-card" aria-label="当前用户设置"><span className="eyebrow">当前用户</span><h2>用户设置 · {profile.name}</h2><ProfileForm profile={profile} save={save} /></section>
    <section aria-labelledby="other-users"><h2 id="other-users">其他用户</h2>
      <div className="book-grid">{profiles.filter(p => p.id !== profile.id).map(p => <button className="book-choice" key={p.id} onClick={() => choose(p.id)}><strong>{p.name}</strong><p>{levels[p.level]}</p><span>切换到此用户</span></button>)}
        <button className="book-choice" aria-expanded={adding} aria-controls="add-user" onClick={() => setAdding(!adding)}><strong>＋ 添加用户</strong><p>创建独立的学习资料和进度</p></button>
      </div>
      {adding && <section id="add-user" className="study-card" aria-label="添加用户"><h2>添加用户</h2><ProfileForm save={create} /></section>}
    </section>
  </div>;
}
