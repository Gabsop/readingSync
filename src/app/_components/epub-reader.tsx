"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { api } from "~/trpc/react";
import Link from "next/link";

/**
 * Parses a KOReader xpointer path into a CSS selector and optional text offset.
 * e.g. "/body/DocFragment[3]/body/div[1]/p[7]/text().42"
 *   → { selector: "div:nth-of-type(1) > p:nth-of-type(7)", textOffset: 42 }
 */
function parseXPointerPath(xpointer: string) {
  const innerMatch = xpointer.match(/DocFragment\[\d+\]\/body\/(.*)/);
  if (!innerMatch?.[1]) return null;

  const segments = innerMatch[1].split("/").filter(Boolean);
  const cssParts: string[] = [];
  let textOffset: number | undefined;

  for (const seg of segments) {
    const textMatch = seg.match(/^text\(\)\.?(\d*)$/);
    if (textMatch) {
      textOffset = textMatch[1] ? parseInt(textMatch[1], 10) : 0;
      break;
    }

    const indexMatch = seg.match(/^(\w+)\[(\d+)\]$/);
    if (indexMatch) {
      cssParts.push(`${indexMatch[1]}:nth-of-type(${indexMatch[2]})`);
    } else if (/^\w+$/.test(seg)) {
      cssParts.push(seg);
    }
  }

  if (cssParts.length === 0) return null;
  return { selector: cssParts.join(" > "), textOffset };
}

export function EpubReader({ bookId }: { bookId: string }) {
  const [bookData] = api.progress.getByBookId.useSuspenseQuery({ bookId });
  const saveMutation = api.progress.save.useMutation();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<ReturnType<import("epubjs").Book["renderTo"]> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const initialPercent =
    bookData?.currentPage && bookData?.totalPages && bookData.totalPages > 0
      ? bookData.currentPage / bookData.totalPages
      : bookData?.progress ?? 0;
  const [currentProgress, setCurrentProgress] = useState(initialPercent);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem("reader-font-size") ?? "22", 10);
    }
    return 22;
  });
  const [showSettings, setShowSettings] = useState(false);

  // Parse Kindle render settings to match page dimensions
  const kindleSettings = useMemo(() => {
    if (!bookData?.renderSettings) return null;
    try {
      return JSON.parse(bookData.renderSettings) as {
        font_size?: number;
        line_height?: number;
        screen_width?: number;
        screen_height?: number;
        margin_top?: number;
        margin_bottom?: number;
        margin_left?: number;
        margin_right?: number;
      };
    } catch {
      return null;
    }
  }, [bookData?.renderSettings]);

  console.log("[reader] raw renderSettings", bookData?.renderSettings, "parsed:", kindleSettings);

  // Kindle's line_height is a percentage (e.g. 130 → 1.3), default to 1.4
  const lineHeight = kindleSettings?.line_height
    ? kindleSettings.line_height / 100
    : 1.4;

  // Compute viewer to match Kindle's content area (screen minus page margins).
  // The EPUB's own CSS padding applies naturally inside — no override needed.
  const { viewerWidth, viewerHeight } = useMemo(() => {
    if (!kindleSettings?.font_size || !kindleSettings?.screen_height) {
      return { viewerWidth: 600, viewerHeight: 800 };
    }

    const kFont = kindleSettings.font_size;

    // Kindle content area in "em" units (after page margins)
    const contentWEm =
      ((kindleSettings.screen_width ?? 0) -
        (kindleSettings.margin_left ?? 0) -
        (kindleSettings.margin_right ?? 0)) /
      kFont;
    const contentHEm =
      (kindleSettings.screen_height -
        (kindleSettings.margin_top ?? 0) -
        (kindleSettings.margin_bottom ?? 0)) /
      kFont;

    const linesPerPage = contentHEm / lineHeight;

    const width = Math.round(contentWEm * fontSize);
    const height = Math.round(linesPerPage * fontSize * lineHeight);

    console.log("[reader] kindle viewport match", {
      kindleFontSize: kFont,
      contentWEm: contentWEm.toFixed(1),
      contentHEm: contentHEm.toFixed(1),
      linesPerPage: Math.round(linesPerPage),
      webViewerWidth: width,
      webViewerHeight: height,
    });

    return { viewerWidth: width, viewerHeight: height };
  }, [kindleSettings, fontSize, lineHeight]);

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
        spread: "none",
      });

      rendition.themes.default({
        body: {
          "font-size": `${fontSize}px !important`,
          "line-height": `${lineHeight} !important`,
        },
      });

      renditionRef.current = rendition;

      await book.ready;
      await book.locations.generate(1024);

      const position = bookData.position;
      let displayed = false;

      console.log("[reader] syncing position", { position, progress: bookData.progress });

      if (position?.startsWith("epubcfi(")) {
        // CFI saved from web reader — use directly for exact positioning
        console.log("[reader] using CFI directly");
        await rendition.display(position);
        displayed = true;
      } else if (position) {
        // Try to parse KOReader xpointer (e.g. /body/DocFragment[3]/body/p[7]/text().42)
        const spineMatch = position.match(/DocFragment\[(\d+)\]/);
        if (spineMatch) {
          const spineIndex = parseInt(spineMatch[1]!, 10) - 1; // 0-based
          const spineItem = book.spine.get(spineIndex);
          console.log("[reader] parsed xpointer", { spineIndex, spineHref: spineItem?.href });
          if (spineItem) {
            await rendition.display(spineItem.href);
            displayed = true;

            // Refine position within the chapter using the xpointer DOM path
            const pathInfo = parseXPointerPath(position);
            console.log("[reader] refining within chapter", pathInfo);
            if (pathInfo) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contents = (rendition as any).getContents()[0] as {
                  document: Document;
                  cfiFromNode: (node: Node) => { toString: () => string };
                  cfiFromRange: (range: Range) => { toString: () => string };
                } | undefined;

                const el = contents?.document?.body?.querySelector(
                  `:scope > ${pathInfo.selector}`,
                );
                console.log("[reader] element found:", !!el);

                if (el && contents) {
                  let cfi;
                  if (pathInfo.textOffset !== undefined) {
                    // Walk all text nodes to find the right node + offset
                    // KOReader's offset spans the element's full text content
                    const walker = contents.document.createTreeWalker(
                      el,
                      NodeFilter.SHOW_TEXT,
                    );
                    let charCount = 0;
                    let textNode = walker.nextNode();
                    while (textNode) {
                      const len = textNode.textContent?.length ?? 0;
                      if (charCount + len > pathInfo.textOffset) {
                        const range = contents.document.createRange();
                        range.setStart(textNode, pathInfo.textOffset - charCount);
                        range.collapse(true);
                        cfi = contents.cfiFromRange(range);
                        break;
                      }
                      charCount += len;
                      textNode = walker.nextNode();
                    }
                    // If offset exceeded total text, fall back to element
                    if (!cfi) {
                      cfi = contents.cfiFromNode(el);
                    }
                  } else {
                    cfi = contents.cfiFromNode(el);
                  }
                  if (cfi) {
                    console.log("[reader] refined CFI:", cfi.toString());
                    await rendition.display(cfi.toString());
                  }
                }
              } catch (err) {
                console.warn("[reader] refinement failed, staying at chapter start", err);
              }
            }
          }
        }
      }

      if (!displayed) {
        // Fallback to percentage-based navigation
        const syncPercent =
          bookData.currentPage && bookData.totalPages && bookData.totalPages > 0
            ? bookData.currentPage / bookData.totalPages
            : bookData.progress;

        if (syncPercent > 0) {
          const targetCfi = book.locations.cfiFromPercentage(syncPercent);
          await rendition.display(targetCfi);
        } else {
          await rendition.display();
        }
      }

      rendition.on("relocated", (location: { start: { cfi: string; percentage: number } }) => {
        setCurrentProgress(location.start.percentage);
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

  useEffect(() => {
    if (!renditionRef.current) return;
    renditionRef.current.themes.default({
      body: {
        "font-size": `${fontSize}px !important`,
        "line-height": `${lineHeight} !important`,
        "padding": "0 1em !important",
      },
    });
    renditionRef.current.resize(viewerWidth, viewerHeight);
  }, [fontSize, lineHeight, viewerWidth, viewerHeight]);

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
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-medium">
            {bookData.bookTitle ?? bookId}
          </h1>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="rounded border px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600"
          >
            {fontSize}px
          </button>
        </div>
        <span className="text-xs text-gray-400">
          {Math.round(currentProgress * 100)}%
        </span>
      </header>
      {showSettings && (
        <div className="flex items-center gap-3 border-b bg-gray-50 px-4 py-2">
          <span className="text-xs text-gray-500">Font size:</span>
          <input
            type="range"
            min={12}
            max={40}
            value={fontSize}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setFontSize(val);
              localStorage.setItem("reader-font-size", String(val));
            }}
            className="flex-1"
          />
          <span className="w-12 text-center text-xs font-mono text-gray-600">{fontSize}px</span>
        </div>
      )}
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-gray-50">
        <div ref={viewerRef} className="border bg-white shadow-lg" style={{ width: viewerWidth, height: viewerHeight }} />
      </div>
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
