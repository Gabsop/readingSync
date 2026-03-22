"use client";

import { api } from "~/trpc/react";

export function BookList() {
  const [books] = api.progress.getAll.useSuspenseQuery();

  if (books.length === 0) {
    return (
      <p className="text-center text-white/60">
        No books tracked yet. Start reading on your Kindle!
      </p>
    );
  }

  return (
    <div className="grid w-full max-w-2xl gap-4">
      {books.map((book) => (
        <div
          key={book.id}
          className="rounded-xl bg-white/10 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="truncate text-lg font-semibold">
              {book.bookTitle ?? book.bookId}
            </h3>
            <span className="ml-2 flex shrink-0 items-center gap-2 text-sm text-white/60">
              {book.currentPage != null && book.totalPages != null && (
                <span>p. {book.currentPage}/{book.totalPages}</span>
              )}
              <span>{Math.round(book.progress * 100)}%</span>
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[hsl(280,100%,70%)] transition-all"
              style={{ width: `${book.progress * 100}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-white/40">
            Last synced: {book.updatedAt.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
