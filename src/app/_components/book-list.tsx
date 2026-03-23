"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { EpubUpload } from "./epub-upload";

export function BookList() {
  const [books] = api.progress.getAll.useSuspenseQuery();

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <EpubUpload />

      {books.length === 0 ? (
        <p className="text-center text-white/60">
          No books tracked yet. Start reading on your Kindle!
        </p>
      ) : (
        <div className="grid w-full gap-4">
          {books.map((book) => {
            const content = (
              <>
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

                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-white/40">
                    Last synced: {book.updatedAt.toLocaleString()}
                  </p>
                  {book.epubUrl && (
                    <span className="text-xs text-[hsl(280,100%,70%)]">Read online</span>
                  )}
                </div>
              </>
            );

            if (book.epubUrl) {
              return (
                <Link
                  key={book.id}
                  href={`/read/${encodeURIComponent(book.bookId)}`}
                  className="rounded-xl bg-white/10 p-4 transition hover:bg-white/20"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div key={book.id} className="rounded-xl bg-white/10 p-4">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
