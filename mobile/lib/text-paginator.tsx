/**
 * Text-based pagination.
 *
 * 1. Extract plain text from EPUB XHTML
 * 2. Calculate how many characters fit on a page based on font metrics
 * 3. Split text into pages at word boundaries
 * 4. Render each page as a simple Text component
 */

import { View, Text, StyleSheet } from "react-native";

const PAGE_PADDING_TOP = 40;
const PAGE_PADDING_BOTTOM = 24;
const PAGE_PADDING_X = 24;

interface TextPage {
  text: string;
  index: number;
}

/**
 * Calculate how many characters fit on one page.
 */
function charsPerPage(
  pageWidth: number,
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
): number {
  const textWidth = pageWidth - PAGE_PADDING_X * 2;
  const textHeight = pageHeight - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM;

  // Average character width is roughly 0.5 * fontSize for proportional fonts
  const avgCharWidth = fontSize * 0.48;
  const charsPerLine = Math.floor(textWidth / avgCharWidth);
  const linesPerPage = Math.floor(textHeight / lineHeight);

  return charsPerLine * linesPerPage;
}

/**
 * Split text into pages at word boundaries.
 */
export function paginateText(
  text: string,
  pageWidth: number,
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
): TextPage[] {
  const perPage = charsPerPage(pageWidth, pageHeight, fontSize, lineHeight);
  if (perPage <= 0) return [{ text, index: 0 }];

  const pages: TextPage[] = [];
  let remaining = text;
  let pageIndex = 0;

  while (remaining.length > 0) {
    if (remaining.length <= perPage) {
      pages.push({ text: remaining.trim(), index: pageIndex });
      break;
    }

    // Find the last space before the character limit
    let breakAt = perPage;
    const lastSpace = remaining.lastIndexOf(" ", breakAt);
    const lastNewline = remaining.lastIndexOf("\n", breakAt);
    breakAt = Math.max(lastSpace, lastNewline);

    if (breakAt <= 0) {
      // No space found — force break at limit
      breakAt = perPage;
    }

    const pageText = remaining.substring(0, breakAt).trim();
    if (pageText.length > 0) {
      pages.push({ text: pageText, index: pageIndex });
      pageIndex++;
    }
    remaining = remaining.substring(breakAt).trimStart();
  }

  return pages;
}

/**
 * Extract plain text from EPUB XHTML, preserving paragraph breaks.
 */
export function extractText(xhtml: string): string {
  // Remove XML declarations and processing instructions
  let text = xhtml.replace(/<\?[^?]*\?>/g, "");

  // Replace block-level closing tags with double newlines
  text = text.replace(/<\/(p|div|h[1-6]|blockquote|li|tr|section|article)>/gi, "\n\n");

  // Replace <br> with newline
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // Collapse multiple newlines into double newlines (paragraph breaks)
  text = text.replace(/\n{3,}/g, "\n\n");

  // Collapse multiple spaces
  text = text.replace(/ {2,}/g, " ");

  return text.trim();
}

/**
 * Render a single page of text.
 */
export function TextPageView({
  page,
  fontSize,
  lineHeight,
  fontFamily,
  textColor,
  backgroundColor,
  textAlign,
  pageHeight,
  pageWidth,
}: {
  page: TextPage;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  textColor: string;
  backgroundColor: string;
  textAlign: string;
  pageHeight: number;
  pageWidth: number;
}) {
  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor,
          height: pageHeight,
          width: pageWidth,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontSize,
            lineHeight,
            color: textColor,
            textAlign: textAlign as "left" | "right" | "center" | "justify",
            ...(fontFamily ? { fontFamily } : {}),
          },
        ]}
      >
        {page.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    overflow: "hidden",
    paddingTop: PAGE_PADDING_TOP,
    paddingBottom: PAGE_PADDING_BOTTOM,
    paddingHorizontal: PAGE_PADDING_X,
  },
  text: {
    flex: 1,
  },
});
