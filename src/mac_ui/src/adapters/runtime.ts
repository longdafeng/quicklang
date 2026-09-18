import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RuntimeStatus, TypingMetrics, TypingResult } from "../contracts";

// Browser previews are explicitly ephemeral; desktop evaluations use Rust.
export async function runtimeStatus(): Promise<RuntimeStatus> {
  if (isTauri()) return invoke("get_runtime_status");
  return { phase: "browser_preview", storage: "not_connected", persistence_ready: false, library_phase: "waiting", library_ready: false, library_error: null };
}
export async function evaluateSpelling(expected: string, actual: string, metrics: TypingMetrics): Promise<TypingResult> {
  if (isTauri()) return invoke("evaluate_spelling", { expected, actual, metrics });
  const normalizedExpected = expected.normalize("NFKC").toLowerCase();
  const normalizedActual = actual.normalize("NFKC").toLowerCase();
  const left = Array.from(normalizedExpected);
  const right = Array.from(normalizedActual);
  const mismatches = Array.from({ length: Math.max(left.length, right.length) }, (_, i) => i)
    .filter(i => left[i] !== right[i]);
  const correct = mismatches.length === 0;
  return { expected: normalizedExpected, actual: normalizedActual, correct, mismatches,
    suggested_rating: !correct || metrics.hint_count ? "again" : metrics.backspaces ? "hard" : "good" };
}
