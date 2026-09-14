import { afterEach, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listMaterials, deleteMaterial, saveMaterial, loadAudio } from "../../../src/ui/src/features/listening/repository";
import { newMaterial } from "../../../src/ui/src/features/listening/model";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
const entry = { id: "lesson", version: 3, payload: newMaterial("Lesson", "audio/mpeg") };
afterEach(() => { vi.clearAllMocks(); vi.mocked(isTauri).mockReturnValue(true); });
it("lists and deletes using the owner and optimistic version", async () => {
  vi.mocked(invoke).mockResolvedValue([entry]);
  expect(await listMaterials("alice")).toEqual([entry]);
  expect(invoke).toHaveBeenLastCalledWith("listening_repository", { owner: "alice", operation: { action: "list" } });
  await deleteMaterial("bob", entry);
  expect(invoke).toHaveBeenLastCalledWith("listening_repository", { owner: "bob", operation: { action: "delete", id: "lesson", version: 3 } });
});
it("encodes binary audio losslessly and preserves the caller's entry", async () => {
  vi.mocked(invoke).mockResolvedValue(4);
  const payload = { ...entry.payload, stage: 1 };
  const blob = { arrayBuffer: async () => new Uint8Array([0, 15, 128, 255]).buffer } as Blob;
  expect(await saveMaterial("alice", entry, payload, blob)).toEqual({ id: "lesson", version: 4, payload });
  expect(invoke).toHaveBeenLastCalledWith("listening_repository", { owner: "alice", operation: { action: "save", id: "lesson", version: 3, payload, audio: "000f80ff" } });
  expect(entry.version).toBe(3);
  await saveMaterial("alice", entry, payload);
  expect(invoke).toHaveBeenLastCalledWith("listening_repository", expect.objectContaining({ operation: expect.objectContaining({ audio: null }) }));
});
it("decodes audio bytes and MIME exactly", async () => {
  vi.mocked(invoke).mockResolvedValue("000F80ff");
  const blob = await loadAudio("alice", entry);
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob); });
  expect([...new Uint8Array(bytes)]).toEqual([0, 15, 128, 255]); expect(blob.type).toBe("audio/mpeg");
});
it.each(["", "0", "zz", null, 123, "f".repeat(16_000_002)])("rejects corrupt audio %#", async hex => {
  vi.mocked(invoke).mockResolvedValue(hex); await expect(loadAudio("alice", entry)).rejects.toThrow("音频数据损坏");
});
it.each([{ message: "VERSION_CONFLICT" }, "DB_UNAVAILABLE", null])("propagates IPC failures %#", async error => {
  vi.mocked(invoke).mockRejectedValue(error); await expect(listMaterials("alice")).rejects.toThrow(error && typeof error === "object" ? error.message : String(error));
});
it("rejects every operation in the browser without sending IPC", async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  for (const promise of [listMaterials("alice"), deleteMaterial("alice", entry), saveMaterial("alice", entry, entry.payload), loadAudio("alice", entry)]) await expect(promise).rejects.toThrow("桌面应用");
  expect(invoke).not.toHaveBeenCalled();
});
