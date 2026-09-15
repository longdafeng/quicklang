/** Shorten quiet edges of native mono PCM WAV audio; preserve unsupported formats unchanged. */
export function shortenEdgeSilence(wav: Uint8Array<ArrayBuffer>, scale: number): Uint8Array<ArrayBuffer> {
  if (scale === 1 || !Number.isFinite(scale) || scale < 0 || scale > 1 || wav.length < 44) return wav;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  /** Read a four-byte RIFF chunk identifier. */
  const tag = (offset: number) => String.fromCharCode(...wav.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return wav;
  let pcm = false;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > wav.length) return wav;
    if (tag(offset) === "fmt " && size >= 16) {
      pcm = view.getUint16(start, true) === 1 && view.getUint16(start + 2, true) === 1
        && view.getUint16(start + 12, true) === 2 && view.getUint16(start + 14, true) === 16;
    }
    if (tag(offset) === "data" && pcm && size % 2 === 0) {
      // Use a conservative noise floor to retain quiet consonants and natural speech.
      let first = start;
      let last = start + size;
      while (first < last && Math.abs(view.getInt16(first, true)) <= 16) first += 2;
      if (first === last) return wav;
      while (last > first && Math.abs(view.getInt16(last - 2, true)) <= 16) last -= 2;
      const leading = Math.floor((first - start) / 2 * (1 - scale)) * 2;
      const trailing = Math.floor((start + size - last) / 2 * (1 - scale)) * 2;
      const result = new Uint8Array(wav.length - leading - trailing);
      result.set(wav.subarray(0, start));
      result.set(wav.subarray(start + leading, start + size - trailing), start);
      result.set(wav.subarray(start + size), start + size - leading - trailing);
      const output = new DataView(result.buffer);
      output.setUint32(4, view.getUint32(4, true) - leading - trailing, true);
      output.setUint32(offset + 4, size - leading - trailing, true);
      return result;
    }
    offset = start + size + size % 2;
  }
  return wav;
}
