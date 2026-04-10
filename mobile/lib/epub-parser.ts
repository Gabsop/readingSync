/**
 * EPUB Parser for React Native (Expo)
 *
 * Handles the full EPUB parsing pipeline:
 *   .epub (zip) → container.xml → content.opf → manifest + spine + metadata + TOC
 *
 * Uses expo-file-system to read EPUB files from device storage,
 * jszip for decompression, and fast-xml-parser for XML parsing.
 */

import { File as ExpoFile } from "expo-file-system";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

interface SpineItem {
  idref: string;
  linear: boolean;
  /** Resolved href from the manifest */
  href: string;
  mediaType: string;
}

export interface TocEntry {
  label: string;
  href: string;
  children: TocEntry[];
}

interface EpubMetadata {
  title: string;
  creator: string;
  language: string;
  identifier: string;
  publisher: string;
  description: string;
  coverImageId?: string;
}

export interface ParsedEpub {
  metadata: EpubMetadata;
  manifest: Map<string, ManifestItem>;
  spine: SpineItem[];
  toc: TocEntry[];
  /** Base directory of the OPF file inside the zip (for resolving relative paths) */
  opfBasePath: string;
  /** The raw JSZip instance — kept so callers can read chapter XHTML / images later */
  zip: JSZip;
}

// ---------------------------------------------------------------------------
// XML parser configured once
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Preserve text content even when mixed with child elements
  textNodeName: "#text",
  // Always return arrays for elements that may repeat
  isArray: (_name, jpath, _isLeaf, _isAttr) => {
    if (typeof jpath !== "string") return false;
    const arrayPaths = [
      "package.manifest.item",
      "package.spine.itemref",
      "ncx.navMap.navPoint",
      "ncx.navMap.navPoint.navPoint",
      "html.body.nav.ol.li",
      "html.body.nav.ol.li.ol.li",
    ];
    return arrayPaths.some((p) => jpath.endsWith(p));
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an EPUB file from local device storage.
 *
 * @param epubPath - Absolute path to the .epub file on device
 * @returns Fully parsed EPUB structure
 */
export async function parseEpub(epubPath: string): Promise<ParsedEpub> {
  // 1. Read file as ArrayBuffer and load into JSZip
  const file = new ExpoFile(epubPath);
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // 2. Parse container.xml to locate the OPF file
  const opfPath = await parseContainer(zip);
  const opfBasePath = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  // 3. Parse the OPF file
  const opfXml = await readZipText(zip, opfPath);
  const opfDoc = xmlParser.parse(opfXml);
  const pkg = opfDoc.package ?? opfDoc["opf:package"] ?? opfDoc;

  const metadata = extractMetadata(pkg);
  const manifest = extractManifest(pkg);
  const spine = extractSpine(pkg, manifest);

  // 4. Parse TOC (try EPUB 3 nav first, fall back to NCX)
  const toc = await parseToc(zip, manifest, opfBasePath);

  return { metadata, manifest, spine, toc, opfBasePath, zip };
}

/**
 * Extract the cover image as a base64 data URI from a parsed EPUB.
 * Returns undefined if no cover image is found.
 */
export async function extractCoverImage(
  epub: ParsedEpub,
): Promise<string | undefined> {
  const { metadata, manifest, opfBasePath, zip } = epub;

  // Strategy 1: cover-image declared in manifest properties (EPUB 3)
  let coverId = metadata.coverImageId;

  // Strategy 2: look for manifest item with properties="cover-image"
  if (!coverId) {
    for (const [id, item] of manifest) {
      if (item.properties?.includes("cover-image")) {
        coverId = id;
        break;
      }
    }
  }

  // Strategy 3: look for item with id containing "cover" and image media type
  if (!coverId) {
    for (const [id, item] of manifest) {
      if (
        id.toLowerCase().includes("cover") &&
        item.mediaType.startsWith("image/")
      ) {
        coverId = id;
        break;
      }
    }
  }

  if (!coverId) return undefined;

  const coverItem = manifest.get(coverId);
  if (!coverItem) return undefined;

  const coverPath = resolveHref(opfBasePath, coverItem.href);
  const file = zip.file(coverPath);
  if (!file) return undefined;

  const coverBase64 = await file.async("base64");
  return `data:${coverItem.mediaType};base64,${coverBase64}`;
}

/**
 * Read a chapter's raw XHTML content from the zip.
 */
export async function readChapter(
  epub: ParsedEpub,
  spineIndex: number,
): Promise<string> {
  const item = epub.spine[spineIndex];
  if (!item) throw new Error(`Spine index ${spineIndex} out of bounds`);

  const filePath = resolveHref(epub.opfBasePath, item.href);
  return readZipText(epub.zip, filePath);
}

// ---------------------------------------------------------------------------
// Text extraction & excerpt search (for cross-device sync)
// ---------------------------------------------------------------------------

/**
 * Strip XHTML/HTML tags and normalize whitespace to produce plain text.
 */
function stripXhtmlTags(xhtml: string): string {
  return (
    xhtml
      // Remove script/style content
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      // Remove all tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Extract plain text from a chapter's XHTML content by stripping all tags.
 */
export async function extractPlainText(
  epub: ParsedEpub,
  spineIndex: number,
): Promise<string> {
  const xhtml = await readChapter(epub, spineIndex);
  return stripXhtmlTags(xhtml);
}

export interface ExcerptSearchResult {
  /** Spine index where the excerpt was found */
  chapter: number;
  /** Character offset within the chapter's plain text */
  charOffset: number;
  /** Estimated progress within the chapter (0–1) */
  chapterProgress: number;
}

/**
 * Search all chapters for an excerpt string. Returns matching locations,
 * sorted by proximity to `progressHint` (0–1 global progress) if provided.
 *
 * The search normalizes whitespace on both sides so that minor formatting
 * differences between renderers (KOReader vs this app) don't break matching.
 */
export async function searchExcerpt(
  epub: ParsedEpub,
  excerpt: string,
  progressHint?: number,
): Promise<ExcerptSearchResult[]> {
  const normalized = excerpt.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const results: ExcerptSearchResult[] = [];

  for (let i = 0; i < epub.spine.length; i++) {
    const plainText = await extractPlainText(epub, i);
    const idx = plainText.indexOf(normalized);
    if (idx !== -1) {
      results.push({
        chapter: i,
        charOffset: idx,
        chapterProgress: plainText.length > 0 ? idx / plainText.length : 0,
      });
    }
  }

  // Sort by proximity to expected global position if a hint is available
  if (progressHint !== undefined && results.length > 1) {
    const expectedChapter = Math.floor(progressHint * epub.spine.length);
    results.sort((a, b) => {
      const distA = Math.abs(a.chapter - expectedChapter);
      const distB = Math.abs(b.chapter - expectedChapter);
      return distA - distB;
    });
  }

  return results;
}

export interface BookSearchResult {
  /** Spine index where the match was found */
  chapter: number;
  /** Character offset of the match within the chapter's plain text */
  charOffset: number;
  /** Estimated progress within the chapter (0–1) */
  chapterProgress: number;
  /** Context snippet around the match (~60 chars before + query + ~60 chars after) */
  contextBefore: string;
  matchedText: string;
  contextAfter: string;
}

/**
 * Search all chapters for a keyword/phrase (case-insensitive). Returns all
 * occurrences with surrounding context snippets for display.
 *
 * Results are returned in reading order (spine index, then char offset).
 */
export async function searchBook(
  epub: ParsedEpub,
  query: string,
): Promise<BookSearchResult[]> {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const lowerQuery = normalized.toLowerCase();
  const results: BookSearchResult[] = [];
  const CONTEXT_CHARS = 60;

  for (let i = 0; i < epub.spine.length; i++) {
    const plainText = await extractPlainText(epub, i);
    const lowerText = plainText.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(lowerQuery, searchFrom);
      if (idx === -1) break;

      const matchEnd = idx + normalized.length;
      const contextStart = Math.max(0, idx - CONTEXT_CHARS);
      const contextEnd = Math.min(plainText.length, matchEnd + CONTEXT_CHARS);

      results.push({
        chapter: i,
        charOffset: idx,
        chapterProgress: plainText.length > 0 ? idx / plainText.length : 0,
        contextBefore: (contextStart > 0 ? "\u2026" : "") + plainText.slice(contextStart, idx),
        matchedText: plainText.slice(idx, matchEnd),
        contextAfter: plainText.slice(matchEnd, contextEnd) + (contextEnd < plainText.length ? "\u2026" : ""),
      });

      searchFrom = matchEnd;
    }
  }

  return results;
}

/**
 * Extract ~500 characters of text at an approximate position within a chapter.
 * Used when saving progress to include an excerpt for cross-device sync.
 *
 * @param positionRatio - 0–1 fraction within the chapter (e.g. page / totalPagesInChapter)
 */
export async function extractExcerptAtPosition(
  epub: ParsedEpub,
  spineIndex: number,
  positionRatio: number,
): Promise<string> {
  const plainText = await extractPlainText(epub, spineIndex);
  if (!plainText) return "";

  const EXCERPT_LENGTH = 500;
  const charOffset = Math.floor(
    Math.min(Math.max(positionRatio, 0), 1) * plainText.length,
  );

  // Walk back to a word boundary (up to 50 chars) for a cleaner start
  let start = charOffset;
  const minStart = Math.max(0, charOffset - 50);
  while (start > minStart && plainText[start - 1] !== " ") {
    start--;
  }

  return plainText.slice(start, start + EXCERPT_LENGTH).trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`File not found in EPUB archive: ${path}`);
  }
  return file.async("string");
}

function resolveHref(basePath: string, href: string): string {
  // Decode URI-encoded characters and strip fragment identifiers
  const decoded = decodeURIComponent(href.split("#")[0]!);
  return basePath + decoded;
}

/**
 * Parse META-INF/container.xml to find the rootfile (OPF) path.
 */
async function parseContainer(zip: JSZip): Promise<string> {
  const containerXml = await readZipText(zip, "META-INF/container.xml");
  const doc = xmlParser.parse(containerXml);

  const rootfiles =
    doc.container?.rootfiles?.rootfile ??
    doc.container?.rootfiles?.["rootfile"];

  // rootfile can be a single object or array
  const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
  const fullPath = rootfile?.["@_full-path"];

  if (!fullPath) {
    throw new Error("Could not find rootfile path in container.xml");
  }

  return fullPath;
}

/**
 * Extract metadata from the OPF <metadata> element.
 */
function extractMetadata(
  pkg: Record<string, unknown>,
): EpubMetadata {
  const meta = (pkg.metadata ?? {}) as Record<string, unknown>;

  // Metadata fields can be namespaced (dc:title) or not (title)
  const getText = (field: string): string => {
    const val =
      meta[`dc:${field}`] ?? meta[field] ?? "";
    if (typeof val === "string") return val;
    if (typeof val === "object" && val !== null) {
      return (val as Record<string, unknown>)["#text"]?.toString() ?? "";
    }
    return val?.toString() ?? "";
  };

  // Find cover image id from <meta name="cover" content="cover-image-id" />
  let coverImageId: string | undefined;
  const metaElements = meta.meta;
  if (Array.isArray(metaElements)) {
    const coverMeta = metaElements.find(
      (m: Record<string, unknown>) => m["@_name"] === "cover",
    );
    if (coverMeta) {
      coverImageId = (coverMeta as Record<string, unknown>)[
        "@_content"
      ] as string;
    }
  } else if (
    metaElements &&
    typeof metaElements === "object" &&
    (metaElements as Record<string, unknown>)["@_name"] === "cover"
  ) {
    coverImageId = (metaElements as Record<string, unknown>)[
      "@_content"
    ] as string;
  }

  return {
    title: getText("title"),
    creator: getText("creator"),
    language: getText("language"),
    identifier: getText("identifier"),
    publisher: getText("publisher"),
    description: getText("description"),
    coverImageId,
  };
}

/**
 * Extract the manifest (id → item map) from the OPF.
 */
function extractManifest(
  pkg: Record<string, unknown>,
): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>();
  const manifestEl = pkg.manifest as Record<string, unknown> | undefined;
  if (!manifestEl) return manifest;

  const items = manifestEl.item;
  const itemList = Array.isArray(items) ? items : items ? [items] : [];

  for (const raw of itemList) {
    const item = raw as Record<string, unknown>;
    const id = item["@_id"] as string;
    if (!id) continue;

    manifest.set(id, {
      id,
      href: (item["@_href"] as string) ?? "",
      mediaType: (item["@_media-type"] as string) ?? "",
      properties: item["@_properties"] as string | undefined,
    });
  }

  return manifest;
}

/**
 * Extract the spine (reading order) from the OPF, resolving each idref
 * to its manifest entry.
 */
function extractSpine(
  pkg: Record<string, unknown>,
  manifest: Map<string, ManifestItem>,
): SpineItem[] {
  const spineEl = pkg.spine as Record<string, unknown> | undefined;
  if (!spineEl) return [];

  const refs = spineEl.itemref;
  const refList = Array.isArray(refs) ? refs : refs ? [refs] : [];

  const spine: SpineItem[] = [];
  for (const raw of refList) {
    const ref = raw as Record<string, unknown>;
    const idref = ref["@_idref"] as string;
    if (!idref) continue;

    const manifestItem = manifest.get(idref);
    spine.push({
      idref,
      linear: (ref["@_linear"] as string) !== "no",
      href: manifestItem?.href ?? "",
      mediaType: manifestItem?.mediaType ?? "",
    });
  }

  return spine;
}

/**
 * Parse the table of contents. Tries EPUB 3 nav document first,
 * then falls back to EPUB 2 NCX.
 */
async function parseToc(
  zip: JSZip,
  manifest: Map<string, ManifestItem>,
  opfBasePath: string,
): Promise<TocEntry[]> {
  // EPUB 3: look for nav document (properties="nav")
  for (const [, item] of manifest) {
    if (item.properties?.includes("nav")) {
      try {
        const navXml = await readZipText(
          zip,
          resolveHref(opfBasePath, item.href),
        );
        return parseNavDocument(navXml);
      } catch {
        // Fall through to NCX
      }
    }
  }

  // EPUB 2: look for NCX file
  for (const [, item] of manifest) {
    if (item.mediaType === "application/x-dtbncx+xml") {
      try {
        const ncxXml = await readZipText(
          zip,
          resolveHref(opfBasePath, item.href),
        );
        return parseNcx(ncxXml);
      } catch {
        // No TOC available
      }
    }
  }

  return [];
}

/**
 * Parse an EPUB 3 navigation document (nav.xhtml).
 */
function parseNavDocument(navXml: string): TocEntry[] {
  const doc = xmlParser.parse(navXml);

  // Navigate to the <nav> element with epub:type="toc"
  const html = doc.html ?? doc;
  const body = html.body ?? html;

  // Find all nav elements, look for the toc one
  const navElements = body.nav;
  const navList = Array.isArray(navElements)
    ? navElements
    : navElements
      ? [navElements]
      : [];

  for (const nav of navList) {
    const navEl = nav as Record<string, unknown>;
    const epubType =
      (navEl["@_epub:type"] as string) ?? (navEl["@_type"] as string) ?? "";
    if (epubType === "toc" || navList.length === 1) {
      return parseNavOl(navEl.ol);
    }
  }

  return [];
}

function parseNavOl(ol: unknown): TocEntry[] {
  if (!ol) return [];
  const olObj = ol as Record<string, unknown>;
  const liList = olObj.li;
  const items = Array.isArray(liList) ? liList : liList ? [liList] : [];

  return items.map((raw) => {
    const li = raw as Record<string, unknown>;
    const a = li.a as Record<string, unknown> | undefined;
    const span = li.span as Record<string, unknown> | undefined;

    const label =
      (a?.["#text"] as string) ??
      (span?.["#text"] as string) ??
      "";
    const href = (a?.["@_href"] as string) ?? "";

    return {
      label: label.trim(),
      href,
      children: parseNavOl(li.ol),
    };
  });
}

/**
 * Parse an EPUB 2 NCX table of contents.
 */
function parseNcx(ncxXml: string): TocEntry[] {
  const doc = xmlParser.parse(ncxXml);
  const ncx = doc.ncx ?? doc;
  const navMap = ncx.navMap;
  if (!navMap) return [];

  const points = navMap.navPoint;
  return parseNavPoints(points);
}

function parseNavPoints(points: unknown): TocEntry[] {
  const list = Array.isArray(points) ? points : points ? [points] : [];

  return list.map((raw) => {
    const point = raw as Record<string, unknown>;

    // navLabel can contain text directly or nested
    const navLabel = point.navLabel as Record<string, unknown> | undefined;
    const label =
      typeof navLabel?.text === "string"
        ? navLabel.text
        : typeof navLabel?.text === "object" && navLabel?.text !== null
          ? ((navLabel.text as Record<string, unknown>)["#text"] as string) ??
            ""
          : "";

    const content = point.content as Record<string, unknown> | undefined;
    const href = (content?.["@_src"] as string) ?? "";

    return {
      label: label.trim(),
      href,
      children: parseNavPoints(point.navPoint),
    };
  });
}
