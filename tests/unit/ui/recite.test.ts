import { describe, expect, it } from "vitest";
import { initialReciteState, tick } from "../../../src/ui/src/features/auto-recite/machine";
describe("automatic recitation", () => {
  it("spells Unicode characters, holds, waits and completes without looping", () => {
    let s = { ...initialReciteState };
    s = tick(s, ["a😀", "b"]); expect(s.letters).toBe(1);
    s = tick(s, ["a😀", "b"]); expect(s.phase).toBe("hold"); expect(s.letters).toBe(2);
    s = tick(s, ["a😀", "b"]); expect(s.phase).toBe("gap");
    s = tick(s, ["a😀", "b"]); expect(s.index).toBe(1); expect(s.letters).toBe(0);
    s = tick(s, ["a😀", "b"]); s = tick(s, ["a😀", "b"]); s = tick(s, ["a😀", "b"]);
    expect(s.phase).toBe("complete"); expect(tick(s, ["a😀", "b"])).toBe(s);
  });
  it("does not advance while paused", () => {
    const s = { ...initialReciteState, paused: true }; expect(tick(s, ["word"])).toBe(s);
  });
  it("handles empty content", () => expect(tick(initialReciteState, []).phase).toBe("complete"));
});
