/** Desktop-only typed IPC. No browser/localStorage/SQLite persistence fallback. */
import { invoke, isTauri } from "@tauri-apps/api/core";

export type ReviewRating = "again" | "hard" | "good" | "easy";
export interface StoredReview {
  card_id: string;
  phase: "new" | "learning" | "review" | "relearning";
  due_at: number;
  interval_days: number;
  ease: number;
  lapses: number;
  reps: number;
  version: number;
}
export interface ReviewSubmission {
  cardId: string;
  eventId: string;
  expectedVersion: number;
  rating: ReviewRating;
}
function requireDesktop() {
  if (!isTauri()) throw new Error("seekdb persistence requires the macOS desktop application");
}
export async function loadStoredReview(cardId: string): Promise<StoredReview> {
  requireDesktop();
  return invoke("load_review_state", { cardId });
}
/** Retain the entire submission when retrying an uncertain result. */
export async function submitStoredReview(submission: ReviewSubmission): Promise<StoredReview> {
  requireDesktop();
  return invoke("rate_card", { ...submission });
}
