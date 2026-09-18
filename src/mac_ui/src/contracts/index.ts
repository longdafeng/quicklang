export type Rating = "again" | "hard" | "good" | "easy";
export interface TypingMetrics { hint_count: number; backspaces: number }
export interface TypingResult {
  correct: boolean;
  expected: string;
  actual: string;
  mismatches: number[];
  suggested_rating: Rating;
}
export interface RuntimeStatus {
  phase: string;
  storage: string;
  persistence_ready: boolean;
  library_phase: "waiting" | "validating" | "importing" | "ready" | "error";
  library_ready: boolean;
  library_error: { code: string; message: string; retryable: boolean } | null;
}
export interface Word { id: string; spelling: string; meaning: string; example?: string; exampleTranslation?: string; translations?: string[]; phoneticUs?: string; phoneticUk?: string; sentences?: { textEn: string; textZh: string; source: string }[] }
export type StudyMode = "spelling" | "flashcard" | "auto";
