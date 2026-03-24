"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { EpubUpload } from "./epub-upload";

export function BookList() {
  const [books] = api.progress.getAll.useSuspenseQuery();
  const [linkingBookId, setLinkingBookId] = useState<string | null>(null);
  const utils = api.useUtils();

  const linkMutation = api.progress.linkBooks.useMutation({
    onSuccess: () => {
      setLinkingBookId(null);
      void utils.progress.getAll.invalidate();
    },
  });

  const booksWithEpub = books.filter((b) => b.epubUrl);
  const booksWithoutEpub = books.filter((b) => !b.epubUrl);

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
            const isLinking = linkingBookId === book.bookId;

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
                    <span>{(
                      book.currentPage && book.totalPages && book.totalPages > 0
                        ? (book.currentPage / book.totalPages) * 100
                        : book.progress * 100
                    ).toFixed(1)}%</span>
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[hsl(280,100%,70%)] transition-all"
                    style={{ width: `${
                      book.currentPage && book.totalPages && book.totalPages > 0
                        ? (book.currentPage / book.totalPages) * 100
                        : book.progress * 100
                    }%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-white/40">
                    Last synced: {book.updatedAt.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    {book.epubUrl && (
                      <span className="text-xs text-[hsl(280,100%,70%)]">Read online</span>
                    )}
                    {!book.epubUrl && booksWithEpub.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setLinkingBookId(isLinking ? null : book.bookId);
                        }}
                        className="text-xs text-white/40 transition hover:text-white/80"
                      >
                        {isLinking ? "Cancel" : "Link EPUB"}
                      </button>
                    )}
                    {book.epubUrl && booksWithoutEpub.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setLinkingBookId(isLinking ? null : book.bookId);
                        }}
                        className="text-xs text-white/40 transition hover:text-white/80"
                      >
                        {isLinking ? "Cancel" : "Link to Kindle"}
                      </button>
                    )}
                  </div>
                </div>

                {isLinking && !book.epubUrl && (
                  <div className="mt-3 rounded-lg bg-white/5 p-3">
                    <p className="mb-2 text-xs text-white/60">
                      Pick the uploaded EPUB to link:
                    </p>
                    <div className="flex flex-col gap-1">
                      {booksWithEpub.map((epub) => (
                        <button
                          key={epub.id}
                          disabled={linkMutation.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            linkMutation.mutate({
                              keepBookId: book.bookId,
                              epubBookId: epub.bookId,
                            });
                          }}
                          className="rounded-md px-2 py-1 text-left text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                        >
                          {epub.bookTitle ?? epub.bookId}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isLinking && book.epubUrl && (
                  <div className="mt-3 rounded-lg bg-white/5 p-3">
                    <p className="mb-2 text-xs text-white/60">
                      Pick the Kindle book to link this EPUB to:
                    </p>
                    <div className="flex flex-col gap-1">
                      {booksWithoutEpub.map((kindle) => (
                        <button
                          key={kindle.id}
                          disabled={linkMutation.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            linkMutation.mutate({
                              keepBookId: kindle.bookId,
                              epubBookId: book.bookId,
                            });
                          }}
                          className="rounded-md px-2 py-1 text-left text-sm text-white/80 transition hover:bg-white/10 disabled:opacity-50"
                        >
                          {kindle.bookTitle ?? kindle.bookId}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );

            if (book.epubUrl && !isLinking) {
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
