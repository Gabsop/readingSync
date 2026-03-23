"use client";

import { useEffect, useRef, useCallback } from "react";
import { api } from "~/trpc/react";
import Link from "next/link";

export function EpubReader({ bookId }: { bookId: string }) {
  const [bookData] = api.progress.getByBookId.useSuspenseQuery({ bookId });
  const saveMutation = api.progress.save.useMutation();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<ReturnType<import("epubjs").Book["renderTo"]> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const saveProgress = useCallback(
    (cfi: string, progress: number) => {
      saveMutation.mutate({
        bookId,
        position: cfi,
        progress,
      });
    },
    [bookId, saveMutation],
  );

  useEffect(() => {
    if (!bookData?.epubUrl || !viewerRef.current) return;

    const init = async () => {
      const ePub = (await import("epubjs")).default;
      const book = ePub(bookData.epubUrl!);

      const rendition = book.renderTo(viewerRef.current!, {
        width: "100%",
        height: "100%",
        flow: "paginated",
      });

      renditionRef.current = rendition;

      await rendition.display();

      if (bookData.progress > 0) {
        await book.locations.generate(1024);
        const targetCfi = book.locations.cfiFromPercentage(bookData.progress);
        await rendition.display(targetCfi);
      }

      rendition.on("relocated", (location: { start: { cfi: string; percentage: number } }) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          saveProgress(location.start.cfi, location.start.percentage);
        }, 2000);
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") void rendition.next();
        if (e.key === "ArrowLeft") void rendition.prev();
      };
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        book.destroy();
      };
    };

    const cleanup = init();

    return () => {
      void cleanup.then((fn) => fn?.());
    };
  }, [bookData?.epubUrl]);

  if (!bookData?.epubUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="text-center">
          <p className="mb-4 text-white/60">No EPUB uploaded for this book.</p>
          <Link href="/" className="text-[hsl(280,100%,70%)] hover:underline">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white text-black">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          Back
        </Link>
        <h1 className="truncate text-sm font-medium">
          {bookData.bookTitle ?? bookId}
        </h1>
        <span className="text-xs text-gray-400">
          {Math.round((bookData.progress ?? 0) * 100)}%
        </span>
      </header>
      <div ref={viewerRef} className="flex-1" />
      <footer className="flex justify-between border-t px-4 py-2">
        <button
          onClick={() => void renditionRef.current?.prev()}
          className="rounded px-4 py-1 text-sm hover:bg-gray-100"
        >
          Previous
        </button>
        <button
          onClick={() => void renditionRef.current?.next()}
          className="rounded px-4 py-1 text-sm hover:bg-gray-100"
        >
          Next
        </button>
      </footer>
    </div>
  );
}
