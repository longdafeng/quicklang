import catalog from "../../../public/content/ink/catalog.json";
import type { Word } from "../../contracts";

const order = ["junior", "senior", "cet4", "cet6", "postgraduate", "toefl", "sat", "ielts", "gre", "gmat", "bec"];
export const books = order.map(id => catalog.find(book => book.id === `ink-${id}`)!);
export const contentBase = `${import.meta.env.BASE_URL ?? "/"}content/ink/`;
export async function loadBook(id: string, signal: AbortSignal): Promise<readonly Word[]> {
  const book = books.find(item => item.id === id);
  if (!book) throw new Error("未知词书");
  const response = await fetch(`${contentBase}${id}.json`, { signal });
  if (!response.ok) throw new Error("词书加载失败");
  const data = await response.json();
  if (data.id !== id || !Array.isArray(data.entries) || data.entries.length !== book.count ||
    !data.entries.every((entry: Word) => typeof entry.id === "string" && typeof entry.spelling === "string" && entry.spelling.length &&
      typeof entry.meaning === "string" && !!entry.meaning.trim() && typeof entry.example === "string" && typeof entry.exampleTranslation === "string" &&
      Array.isArray(entry.sentences) && entry.sentences.every(sentence => typeof sentence.textEn === "string" && typeof sentence.textZh === "string" && typeof sentence.source === "string"))) {
    throw new Error("词书内容不完整");
  }
  return data.entries.map((entry: Word) => ({ id: entry.id, spelling: entry.spelling, meaning: entry.meaning,
    example: entry.example, exampleTranslation: entry.exampleTranslation, translations: entry.translations,
    phoneticUs: entry.phoneticUs, phoneticUk: entry.phoneticUk, sentences: entry.sentences }));
}
