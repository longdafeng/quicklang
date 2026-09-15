import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => api);
import { loadStoredReview, submitStoredReview } from "../../../src/mac_ui/src/adapters/seekdb";
beforeEach(() => { vi.clearAllMocks(); api.isTauri.mockReturnValue(true); });
it("does not silently persist in browser storage", async () => {
  api.isTauri.mockReturnValue(false);
  await expect(loadStoredReview("a")).rejects.toThrow("desktop");
  expect(api.invoke).not.toHaveBeenCalled();
});
it("uses bounded domain commands, preserving retry identity and version", async () => {
  const state = { card_id: "a", version: 3 };
  api.invoke.mockResolvedValue(state);
  expect(await loadStoredReview("a")).toEqual(state);
  expect(api.invoke).toHaveBeenLastCalledWith("load_review_state", { cardId: "a" });
  const request = { cardId: "a", eventId: "fixed-event", expectedVersion: 3, rating: "good" as const };
  api.invoke.mockRejectedValueOnce({ code: "DB_QUERY_FAILED" });
  await expect(submitStoredReview(request)).rejects.toEqual({ code: "DB_QUERY_FAILED" });
  await submitStoredReview(request);
  expect(api.invoke).toHaveBeenLastCalledWith("rate_card", request);
});
