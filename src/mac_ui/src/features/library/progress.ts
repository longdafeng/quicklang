import type { Session } from "../spelling/session";

interface WordIdentity { id: string }
interface FlashProgress { learned: number; end: number }
interface SpellingProgress { learned: number; session: Session | null }

/** Preserve existing word identities when a book gains words at arbitrary positions. */
export function remapLibraryProgress(
  previous: readonly WordIdentity[], next: readonly WordIdentity[],
  flash: FlashProgress | null, spell: SpellingProgress | null,
): { flash: FlashProgress | null; spell: SpellingProgress | null } {
  const positions = new Map(next.map((word, index) => [word.id, index]));
  const position = (index: number): number => {
    const mapped = positions.get(previous[index]?.id);
    if (mapped === undefined) throw new Error("学习进度引用了不存在的单词，无法安全调整位置。");
    return mapped;
  };
  const end = (index: number) => index === 0 ? 0 : position(index - 1) + 1;
  const cursor = (index: number) => index < previous.length ? position(index) : end(index);
  return {
    flash: flash && { ...flash, learned: cursor(flash.learned), end: end(flash.end) },
    spell: spell && {
      ...spell, learned: cursor(spell.learned),
      session: spell.session && {
        ...spell.session,
        queue: spell.session.queue.map(position),
        wrong: spell.session.wrong.map(position),
        needs: Object.fromEntries(Object.entries(spell.session.needs).map(([index, count]) => [position(Number(index)), count])),
      },
    },
  };
}

/** localStorage has no transactions: restore all touched keys on a partial failure. */
export function persistLibraryChanges(changes: readonly [string, string | null][]): void {
  const previous = changes.map(([key]) => [key, localStorage.getItem(key)] as const);
  try {
    for (const [key, value] of changes) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch (error) {
    for (const [key, value] of previous) {
      try {
        if (localStorage.getItem(key) === value) continue;
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch { console.error("[library] Failed to restore saved state", { key }); }
    }
    console.error("[library] Failed to persist book changes");
    throw error;
  }
}
