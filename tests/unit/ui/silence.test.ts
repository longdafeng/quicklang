import { expect, it } from "vitest";
import { shortenEdgeSilence } from "../../../src/mac_ui/src/features/speech/silence";

/** Build native-format mono PCM audio with known sample values. */
function wav(samples: number[]): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"));
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

it("halves edge silence while preserving speech samples and internal pauses", () => {
  const source = wav([0, 0, 0, 0, 500, -500, 0, 0, 600, 0, 0, 0, 0]);
  expect(shortenEdgeSilence(source, 0.5)).toEqual(wav([0, 0, 500, -500, 0, 0, 600, 0, 0]));
  expect(source.length).toBe(70);
});

it("preserves normal playback, silent audio, and unsupported WAV formats", () => {
  const source = wav([0, 0, 500, 0, 0]);
  expect(shortenEdgeSilence(source, 1)).toBe(source);
  const silent = wav([0, 0]);
  expect(shortenEdgeSilence(silent, 0.5)).toBe(silent);
  new DataView(source.buffer).setUint16(20, 3, true);
  expect(shortenEdgeSilence(source, 0.5)).toBe(source);
  expect(shortenEdgeSilence(new Uint8Array(10), 0.5)).toEqual(new Uint8Array(10));
});
