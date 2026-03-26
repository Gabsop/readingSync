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
  const lastSyncedPositionRef = useRef<string>("");
  const hasUserNavigatedRef = useRef(false);
  const initDoneRef = useRef(false);
  const goNextRef = useRef<() => void>(null);
  const goPrevRef = useRef<() => void>(null);

  // Poll for remote position changes every 5 seconds
  const { data: polledData } = api.progress.getByBookId.useQuery(
    { bookId },
    { refetchInterval: 5000 },
  );

  // Re-navigate when remote position changes (from Kindle sync)
  useEffect(() => {
    if (!initDoneRef.current) return;
    if (!polledData?.position || !renditionRef.current) return;
    if (polledData.position === lastSyncedPositionRef.current) return;

    lastSyncedPositionRef.current = polledData.position;
    const rendition = renditionRef.current;

    const position = polledData.position;
    if (position.startsWith("epubcfi(")) {
      void rendition.display(position);
    } else if (position.includes("DocFragment")) {
      const spineMatch = position.match(/DocFragment\[(\d+)\]/);
      if (spineMatch) {
        const spineIndex = parseInt(spineMatch[1]!, 10) - 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const book = (rendition as any).book;
        const spineItem = book?.spine?.get(spineIndex);
        if (spineItem) {
          void (async () => {
            await rendition.display(spineItem.href);

            // Refine within chapter using xpointer path
            const pathInfo = parseXPointerPath(position);
            if (!pathInfo) return;
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
              if (el && contents) {
                let cfi;
                if (pathInfo.textOffset !== undefined) {
                  const walker = contents.document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
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
                  if (!cfi) cfi = contents.cfiFromNode(el);
                } else {
                  cfi = contents.cfiFromNode(el);
                }
                if (cfi) await rendition.display(cfi.toString());
              }
            } catch (err) {
              console.warn("[reader] poll refinement failed", err);
            }
          })();
        }
      }
    }
  }, [polledData?.position]);

  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<ReturnType<import("epubjs").Book["renderTo"]> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [currentPage, setCurrentPage] = useState(bookData?.currentPage ?? 0);
  const totalPages = bookData?.totalPages ?? 0;
  const currentProgress = totalPages > 0 ? currentPage / totalPages : 0;
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem("reader-font-size") ?? "22", 10);
    }
    return 22;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [widthAdjust, setWidthAdjust] = useState(() => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem("reader-width-adjust") ?? "0", 10);
    }
    return 0;
  });
  const [heightAdjust, setHeightAdjust] = useState(() => {
    if (typeof window !== "undefined") {
      return parseInt(localStorage.getItem("reader-height-adjust") ?? "0", 10);
    }
    return 0;
  });

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
        font_face?: string;
      };
    } catch {
      return null;
    }
  }, [bookData?.renderSettings]);

  console.log("[reader] raw renderSettings", bookData?.renderSettings, "parsed:", kindleSettings);

  // CREngine's line_spacing is a percentage of the font's natural line height.
  // 100 = font's default spacing ≈ CSS line-height 1.2
  // We scale: CREngine 100% → CSS 1.2, CREngine 130% → CSS 1.56, etc.
  const lineHeight = kindleSettings?.line_height
    ? (kindleSettings.line_height / 100) * 1.2
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

    const width = Math.round(contentWEm * fontSize) + widthAdjust;
    const height = Math.round(linesPerPage * fontSize * lineHeight) + heightAdjust;

    console.log("[reader] kindle viewport match", {
      kindleFontSize: kFont,
      contentWEm: contentWEm.toFixed(1),
      contentHEm: contentHEm.toFixed(1),
      linesPerPage: Math.round(linesPerPage),
      webViewerWidth: width,
      webViewerHeight: height,
    });

    return { viewerWidth: width, viewerHeight: height };
  }, [kindleSettings, fontSize, lineHeight, widthAdjust, heightAdjust]);

  const getExcerpt = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contents = (renditionRef.current as any)?.getContents()?.[0] as
        { document: Document; window: Window } | undefined;
      if (!contents?.document?.body) return "";
      // Get the first visible text node by checking what's at the top-left of the content area
      const doc = contents.document;
      const range = doc.createRange();
      range.selectNodeContents(doc.body);
      // Get all text and find the position by using the visible range
      const visibleText = doc.body.innerText ?? doc.body.textContent ?? "";
      // Take first 150 characters, trim whitespace
      return visibleText.replace(/\s+/g, " ").trim().slice(0, 150);
    } catch { return ""; }
  }, []);

  const saveProgress = useCallback(
    (cfi: string, progress: number, page: number) => {
      lastSyncedPositionRef.current = cfi;
      const excerpt = getExcerpt();
      saveMutation.mutate({
        bookId,
        position: cfi,
        progress,
        currentPage: page,
        totalPages,
        excerpt: excerpt || undefined,
        source: "web",
      });
    },
    [bookId, totalPages, saveMutation, getExcerpt],
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

      // Use Kindle's font face if available, fallback to Noto Serif
      const fontFace = kindleSettings?.font_face && kindleSettings.font_face !== "unknown"
        ? kindleSettings.font_face
        : "Noto Serif";
      const googleFontParam = fontFace.replace(/\s+/g, "+");

      console.log("[reader] using font:", fontFace);

      // Inject Google Fonts + force font override into each chapter's iframe DOM
      // (themes.register @import doesn't work in sandboxed iframes,
      //  and body-level font-family doesn't override element-level EPUB CSS)
      rendition.hooks.content.register((contents: { document: Document }) => {
        const doc = contents.document;

        // Ensure lang is set for hyphenation to work
        if (!doc.documentElement.lang) {
          doc.documentElement.lang = "pt";
        }
        console.log("[reader] iframe lang:", doc.documentElement.lang);

        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${googleFontParam}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
        doc.head.appendChild(link);

        const style = doc.createElement("style");
        style.textContent = `* { font-family: '${fontFace}', serif !important; -webkit-hyphens: auto !important; hyphens: auto !important; }
p, div, span, a, li, td, th, blockquote, dd, dt { font-weight: 400 !important; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body { word-spacing: 1px !important; letter-spacing: 0px !important; text-align: justify !important; }`;
        doc.head.appendChild(style);
      });

      rendition.themes.default({
        body: {
          "font-family": `'${fontFace}', serif !important`,
          "font-size": `${fontSize}px !important`,
          "line-height": `${lineHeight} !important`,
        },
      });

      renditionRef.current = rendition;

      await book.ready;

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

      // Mark the initial position so polling doesn't re-navigate to it
      if (position) {
        lastSyncedPositionRef.current = position;
      }
      initDoneRef.current = true;

      if (!displayed) {
        await rendition.display();
      }

      // Track page changes only from explicit user navigation
      const goNext = () => {
        setCurrentPage(prev => Math.min(prev + 1, totalPages));
        void rendition.next();
        scheduleSave();
      };
      const goPrev = () => {
        setCurrentPage(prev => Math.max(1, prev - 1));
        void rendition.prev();
        scheduleSave();
      };
      const scheduleSave = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cfi = (rendition as any).currentLocation()?.start?.cfi;
          if (!cfi) return;
          setCurrentPage(page => {
            const progress = totalPages > 0 ? page / totalPages : 0;
            saveProgress(cfi, progress, page);
            return page;
          });
        }, 2000);
      };

      // Store navigation functions for button clicks
      renditionRef.current = rendition;
      goNextRef.current = goNext;
      goPrevRef.current = goPrev;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") goNext();
        if (e.key === "ArrowLeft") goPrev();
      };
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        hasUserNavigatedRef.current = false;
        initDoneRef.current = false;
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
    const fontFace = kindleSettings?.font_face && kindleSettings.font_face !== "unknown"
      ? kindleSettings.font_face
      : "Noto Serif";
    renditionRef.current.themes.default({
      body: {
        "font-family": `'${fontFace}', serif !important`,
        "font-size": `${fontSize}px !important`,
        "line-height": `${lineHeight} !important`,
      },
    });
    renditionRef.current.resize(viewerWidth, viewerHeight);
    // Re-display current position after resize so text reflows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfi = (renditionRef.current as any).currentLocation()?.start?.cfi;
    if (cfi) void renditionRef.current.display(cfi);
  }, [fontSize, lineHeight, viewerWidth, viewerHeight, kindleSettings?.font_face]);

  if (!bookData?.epubUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-linear-to-b from-[#2e026d] to-[#15162c] text-white">
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
          {totalPages > 0 && `${currentPage}/${totalPages} · `}{(currentProgress * 100).toFixed(1)}%
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
          <span className="ml-4 text-xs text-gray-500">Width:</span>
          <button
            onClick={() => { const v = widthAdjust - 1; setWidthAdjust(v); localStorage.setItem("reader-width-adjust", String(v)); }}
            className="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
          >-</button>
          <span className="w-10 text-center text-xs font-mono text-gray-600">{widthAdjust}px</span>
          <button
            onClick={() => { const v = widthAdjust + 1; setWidthAdjust(v); localStorage.setItem("reader-width-adjust", String(v)); }}
            className="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
          >+</button>
          <span className="ml-4 text-xs text-gray-500">Height:</span>
          <button
            onClick={() => { const v = heightAdjust - 1; setHeightAdjust(v); localStorage.setItem("reader-height-adjust", String(v)); }}
            className="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
          >-</button>
          <span className="w-10 text-center text-xs font-mono text-gray-600">{heightAdjust}px</span>
          <button
            onClick={() => { const v = heightAdjust + 1; setHeightAdjust(v); localStorage.setItem("reader-height-adjust", String(v)); }}
            className="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
          >+</button>
        </div>
      )}
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-gray-50">
        <div ref={viewerRef} className="border bg-white shadow-lg" style={{ width: viewerWidth, height: viewerHeight }} />
      </div>
      <footer className="flex justify-between border-t px-4 py-2">
        <button
          onClick={() => goPrevRef.current?.()}
          className="rounded px-4 py-1 text-sm hover:bg-gray-100"
        >
          Previous
        </button>
        <button
          onClick={() => goNextRef.current?.()}
          className="rounded px-4 py-1 text-sm hover:bg-gray-100"
        >
          Next
        </button>
      </footer>
    </div>
  );
}
