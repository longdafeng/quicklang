export interface Cue { start: number; end: number; text: string }
export const stages = ["精听", "跟读", "盲听", "复述"] as const;
export const intervals = [6 * 3600, 86400, 2 * 86400, 4 * 86400, 7 * 86400, 14 * 86400, 28 * 86400];
export interface SavedPhrase { text: string; meaning: string; sentence: number }
export interface Material {
  title: string; mime: string; cues: Cue[]; stage: number; sentence: number;
  round: number; due: number | null; completed: boolean; difficult: number[];
  phrases: SavedPhrase[]; notes: Record<string, string>; retelling: string; listened: number; spoken: number;
}
export interface RecordEntry { id: string; version: number; payload: Material }
export function newMaterial(title: string, mime: string): Material {
  return { title, mime, cues: [], stage: 0, sentence: 0, round: 0, due: null, completed: false, difficult: [], phrases: [], notes: {}, retelling: "", listened: 0, spoken: 0 };
}
function timestamp(input: string): number {
  if (!/^(?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3}$/.test(input)) throw new Error("字幕时间格式无效。");
  const parts = input.replace(",", ".").split(":").map(Number);
  const [seconds, minutes, hours = 0] = parts.reverse();
  if (seconds >= 60 || minutes >= 60) throw new Error("字幕时间超出范围。");
  return hours * 3600 + minutes * 60 + seconds;
}
export function validateCues(value: unknown): Cue[] {
  if (!Array.isArray(value) || !value.length || value.length > 3000) throw new Error("字幕须包含 1–3000 个带时间轴的片段。");
  let last = 0;
  return value.map((cue: Cue) => {
    if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < last || cue.end <= cue.start || typeof cue.text !== "string" || !cue.text.trim() || cue.text.length > 4000) throw new Error("字幕时间轴无效、重叠或内容为空，请检查后重试。");
    last = cue.end;
    const text = cue.text.replace(/<[^>]*>/g, "").trim();
    if (!text) throw new Error("字幕片段内容为空。");
    return { start: cue.start, end: cue.end, text };
  });
}
export function parseSubtitles(text: string): Cue[] {
  if (text.length > 400_000) throw new Error("字幕文件过大。");
  const blocks = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(block)) continue;
    const lines = block.split("\n");
    const index = lines.findIndex(line => line.includes("-->"));
    if (index < 0) throw new Error("请导入带时间轴的 SRT 或 VTT 字幕。");
    const match = lines[index].match(/^(\S+)\s+-->\s+(\S+)(?:\s.*)?$/);
    if (!match) throw new Error("字幕时间轴格式无效。");
    cues.push({ start: timestamp(match[1]), end: timestamp(match[2]), text: lines.slice(index + 1).join(" ") });
  }
  return validateCues(cues);
}
export function advance(material: Material, now: number): Material {
  if (!material.cues.length || material.completed || (material.due !== null && material.due > now)) return material;
  if (material.stage < 3) return { ...material, stage: material.stage + 1, sentence: 0, due: null };
  if (material.round === intervals.length) return { ...material, completed: true, due: null };
  return { ...material, stage: 0, sentence: 0, round: material.round + 1, due: now + intervals[material.round] * 1000 };
}
/** Ordered word alignment measures transcription overlap, not pronunciation. */
export function alignment(expected: string, actual: string) {
  const words = (text: string) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const a = words(expected).slice(0, 1000), b = words(actual).slice(0, 1000);
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const matched = new Set<number>(); let i = a.length, j = b.length;
  while (i && j) { if (a[i - 1] === b[j - 1]) { matched.add(i - 1); i--; j--; } else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--; }
  return { words: a.map((text, index) => ({ text, matched: matched.has(index) })), percent: a.length ? Math.round(matched.size / a.length * 100) : 0 };
}
export function mediaMime(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mime = ({ mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm" } as Record<string, string>)[ext ?? ""];
  if (!mime || !file.size || file.size > 8_000_000) throw new Error("请选择 8 MB 以内的 MP3、M4A、WAV、OGG 或 WebM 音频。");
  return mime;
}
