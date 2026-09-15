import { useStorageKey } from "../users/profiles";

interface ProgressBook { id: string; name: string; count: number }
interface ProgressProps {
  books: readonly ProgressBook[];
  selectedBook: ProgressBook;
  profileName: string;
  vocabulary: Record<string, string[]>;
  continueStudy: (bookId: string) => void;
}

/** Read a saved mode's completed count, falling back to zero for unreadable data. */
function readProgress(key: string, count: number): number {
  try {
    return Math.min(count, Math.max(0, Number(JSON.parse(localStorage.getItem(key) ?? "{}").learned) || 0));
  } catch { return 0; }
}

/** Render both independent study totals with accessible progress indicators. */
function ProgressMetrics({ book, flash, spell }: { book: ProgressBook; flash: number; spell: number }) {
  return <div className="progress-metrics">
    <div><p>强化学习：{flash} / {book.count}</p><progress aria-label={`${book.name}强化学习进度`} value={flash} max={book.count || 1} /></div>
    <div><p>背诵：{spell} / {book.count}</p><progress aria-label={`${book.name}背诵进度`} value={spell} max={book.count || 1} /></div>
  </div>;
}

/** Emphasize the selected book and show other books as compact cards below it. */
export function Progress({ books, selectedBook, profileName, vocabulary, continueStudy }: ProgressProps) {
  const getKey = useStorageKey();
  const flash = readProgress(getKey(`flash:${selectedBook.id}`), selectedBook.count);
  const spell = readProgress(getKey(`spell:${selectedBook.id}`), selectedBook.count);
  const otherBooks = books.filter(book => book.id !== selectedBook.id);

  return <section className="progress-panel" aria-label={`${profileName}的学习进度`}>
    <article className="study-card progress-featured" aria-labelledby="current-progress-title">
      <span className="badge">正在学习</span>
      <h2 id="current-progress-title">{selectedBook.name}</h2>
      <p className="muted">共 {selectedBook.count} 个单词 · 生词：{(vocabulary[selectedBook.id] ?? []).length} 个</p>
      <ProgressMetrics book={selectedBook} flash={flash} spell={spell} />
      <p className="muted">强化学习与背诵分别统计；背诵数量包含已作答的错词，不代表已掌握。</p>
      <div className="actions"><button className="primary" onClick={() => continueStudy(selectedBook.id)}>继续学习</button></div>
    </article>
    {otherBooks.length > 0 && <section className="progress-others" aria-labelledby="other-progress-title">
      <h2 id="other-progress-title">其他词书的进度</h2>
      <div className="progress-book-grid">{otherBooks.map(book => <article className="progress-book-card" key={book.id}>
        <h3>{book.name}</h3>
        <ProgressMetrics book={book} flash={readProgress(getKey(`flash:${book.id}`), book.count)} spell={readProgress(getKey(`spell:${book.id}`), book.count)} />
        <p className="muted">生词：{(vocabulary[book.id] ?? []).length} 个</p>
        <button onClick={() => continueStudy(book.id)} aria-label={`继续学习${book.name}`}>继续学习</button>
      </article>)}</div>
    </section>}
  </section>;
}
