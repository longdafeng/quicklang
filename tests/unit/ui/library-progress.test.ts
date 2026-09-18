import { expect, it, vi } from "vitest";
import { persistLibraryChanges, remapLibraryProgress } from "../../../src/mac_ui/src/features/library/progress";
import { startSession } from "../../../src/mac_ui/src/features/spelling/session";
const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
const after = [{ id: "new" }, ...before];
it("keeps the same active word and exclusive end after insertion", () => {
  expect(remapLibraryProgress(before, after, { learned: 1, end: 3 }, null).flash).toEqual({ learned: 2, end: 4 });
});
it("remaps spelling queue, mistakes and retry counts by word identity", () => {
  const session = { ...startSession(0, 3), index: 1, wrong: [1], needs: { 1: 2 } };
  const result = remapLibraryProgress(before, after, null, { learned: 1, session });
  expect(result.spell).toEqual({ learned: 2, session: { ...session, queue: [1, 2, 3], wrong: [2], needs: { 2: 2 } } });
});
it("does not skip words appended after completed progress", () => {
  expect(remapLibraryProgress(before, [...before, { id: "new" }], { learned: 3, end: 3 }, { learned: 3, session: null })).toEqual({ flash: { learned: 3, end: 3 }, spell: { learned: 3, session: null } });
});
it("rolls progress back when writing the book fails", () => {
  localStorage.setItem("progress", "old");
  const original = Storage.prototype.setItem;
  const mock = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "book") throw new Error("quota");
    original.call(this, key, value);
  });
  try {
    expect(() => persistLibraryChanges([["progress", "new"], ["book", "words"]])).toThrow("quota");
    expect(localStorage.getItem("progress")).toBe("old");
    expect(localStorage.getItem("book")).toBeNull();
  } finally { mock.mockRestore(); localStorage.clear(); }
});
it("leaves missing progress missing", () => {
  expect(remapLibraryProgress(before, after, null, null)).toEqual({ flash: null, spell: null });
});
