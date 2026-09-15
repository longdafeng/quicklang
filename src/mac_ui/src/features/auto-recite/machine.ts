export interface ReciteState {
  index: number;
  letters: number;
  phase: "spelling" | "hold" | "gap" | "complete";
  paused: boolean;
}
export const initialReciteState: ReciteState = { index: 0, letters: 0, phase: "spelling", paused: false };
export function tick(state: ReciteState, words: readonly string[]): ReciteState {
  if (state.paused || state.phase === "complete") return state;
  if (!words.length) return { ...state, phase: "complete" };
  const length = Array.from(words[state.index]).length;
  if (state.phase === "spelling") {
    const letters = Math.min(state.letters + 1, length);
    return { ...state, letters, phase: letters >= length ? "hold" : "spelling" };
  }
  if (state.phase === "hold") return { ...state, phase: "gap" };
  if (state.index + 1 >= words.length) return { ...state, phase: "complete" };
  return { ...initialReciteState, index: state.index + 1 };
}
export function delay(state: ReciteState, letterMs: number): number {
  return state.phase === "hold" ? 1200 : state.phase === "gap" ? 600 : letterMs;
}
