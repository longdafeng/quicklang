export interface Session {
  queue: number[]; index: number; wrong: number[]; needs: Record<number, number>;
  correct: number; total: number; elapsed: number; phase: "test" | "score" | "retry" | "done";
  feedback: { correct: boolean; answer: string } | null; round: number;
}
export function startSession(start: number, total: number): Session {
  return { queue: Array.from({ length: total }, (_, i) => start + i), index: 0, wrong: [], needs: {}, correct: 0, total, elapsed: 0, phase: "test", feedback: null, round: 0 };
}
export function grade(s: Session, correct: boolean, answer: string): Session {
  if (s.feedback) return s;
  const id = s.queue[s.index];
  const needs = { ...s.needs };
  if (s.phase === "retry" && correct) needs[id] = Math.max(0, needs[id] - 1);
  return { ...s, needs, correct: s.correct + (s.phase === "test" && correct ? 1 : 0), wrong: !correct && !s.wrong.includes(id) ? [...s.wrong, id] : s.wrong, feedback: { correct, answer } };
}
export function advance(s: Session): Session {
  if (s.index + 1 < s.queue.length) return { ...s, index: s.index + 1, feedback: null };
  if (s.phase === "test") return { ...s, phase: "score", feedback: null };
  const queue = s.queue.filter(id => s.needs[id] > 0);
  return { ...s, queue: queue.length ? queue : s.queue, index: 0, wrong: [], round: s.round + 1, feedback: null, phase: queue.length ? "retry" : "done" };
}
export function beginRetry(s: Session): Session {
  return { ...s, queue: s.wrong.length ? s.wrong : s.queue, needs: Object.fromEntries(s.wrong.map(id => [id, 2])), index: 0, wrong: [], feedback: null, round: 1, phase: s.wrong.length ? "retry" : "done" };
}
