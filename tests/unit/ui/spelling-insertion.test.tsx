import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Spelling } from "../../../src/mac_ui/src/features/spelling/Spelling";
import { startSession } from "../../../src/mac_ui/src/features/spelling/session";
vi.mock("../../../src/mac_ui/src/features/speech/speech", () => ({ speak: vi.fn(async () => {}) }));
afterEach(() => { cleanup(); localStorage.clear(); });
it("finishes a noncontiguous remapped queue at the position after its final word", async () => {
  localStorage.setItem("quicklang:spell:inserted", JSON.stringify({ learned: 1, session: { ...startSession(0, 2), queue: [0, 2], index: 1 } }));
  render(<Spelling bookId="inserted" words={[{ id: "a", spelling: "a", meaning: "a" }, { id: "new", spelling: "new", meaning: "new" }, { id: "b", spelling: "b", meaning: "b" }]} />);
  fireEvent.change(screen.getByLabelText("英文拼写"), { target: { value: "b" } });
  fireEvent.click(screen.getByRole("button", { name: /检查拼写/ }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem("quicklang:spell:inserted")!).learned).toBe(3));
});
