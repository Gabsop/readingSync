/**
 * XHTML → React Native Component Renderer
 *
 * Takes raw XHTML chapter content from the EPUB parser and renders it
 * as native React Native components (<Text>, <View>, <Image>).
 *
 * Supports: paragraphs, headings (h1-h6), bold/italic/emphasis, links,
 * lists (ul/ol/li), images, blockquotes, line breaks, divs/sections,
 * and basic inline style parsing.
 */

import React from "react";
import {
  Text,
  View,
  Image,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
  type ImageStyle,
} from "react-native";
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface XmlNode {
  "#text"?: string;
  [tag: string]: unknown;
}

interface RendererOptions {
  /** Base path for resolving relative image src attributes */
  resolveAsset?: (href: string) => string | undefined;
  /** Base font size in points (default: 17) */
  baseFontSize?: number;
  /** Font family name (undefined = system default) */
  fontFamily?: string;
  /** Computed line height in points */
  lineHeight?: number;
  /** Text color from theme */
  textColor?: string;
  /** Link color from theme */
  linkColor?: string;
  /** Text alignment: "left" | "justify" */
  textAlign?: "left" | "justify";
}

// ---------------------------------------------------------------------------
// XML parser — configured for XHTML with mixed content
// ---------------------------------------------------------------------------

const xhtmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: true,
  trimValues: false,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render an XHTML string (a single EPUB chapter) to React Native components.
 */
export function renderXhtml(xhtml: string, options: RendererOptions = {}) {
  const parsed = xhtmlParser.parse(xhtml);
  // The top-level is usually [{ html: [...] }] or [{ "?xml": ... }, { html: [...] }]
  const htmlNode = findTag(parsed, "html");
  if (!htmlNode) {
    // Fallback: treat the whole parse result as body content
    return <View style={baseStyles.chapter}>{renderNodes(parsed, options, 0)}</View>;
  }

  const bodyNode = findTag(htmlNode, "body");
  const content = bodyNode ?? htmlNode;

  return <View style={baseStyles.chapter}>{renderNodes(content, options, 0)}</View>;
}

// ---------------------------------------------------------------------------
// Node rendering
// ---------------------------------------------------------------------------

let keyCounter = 0;

function nextKey() {
  return `xn_${keyCounter++}`;
}

/**
 * Reset the key counter — call before each full render pass.
 */
export function resetKeyCounter() {
  keyCounter = 0;
}

function renderNodes(
  nodes: unknown[],
  options: RendererOptions,
  depth: number,
): React.ReactNode[] {
  const result: React.ReactNode[] = [];

  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const obj = node as Record<string, unknown>;

    // Text node
    if ("#text" in obj) {
      const text = String(obj["#text"]);
      if (text.trim().length > 0 || text.includes(" ")) {
        result.push(text);
      }
      continue;
    }

    // Element nodes — each key is a tag name, value is children array
    for (const tag of Object.keys(obj)) {
      if (tag === ":@") continue; // attributes object, handled separately
      const children = obj[tag] as unknown[];
      const attrs = getAttrs(obj);
      const rendered = renderElement(tag, attrs, children, options, depth);
      if (rendered !== null) {
        result.push(rendered);
      }
    }
  }

  return result;
}

function renderElement(
  tag: string,
  attrs: Record<string, string>,
  children: unknown[],
  options: RendererOptions,
  depth: number,
): React.ReactNode {
  const key = nextKey();
  const baseFontSize = options.baseFontSize ?? 17;
  const textColor = options.textColor ?? "#1C1C1E";
  const linkColor = options.linkColor ?? "#007AFF";
  const lineHeight = options.lineHeight ?? Math.round(baseFontSize * 1.6);
  const fontFamily = options.fontFamily;
  const textAlign = options.textAlign ?? "justify";

  const baseTextStyle: TextStyle = {
    color: textColor,
    ...(fontFamily ? { fontFamily } : {}),
  };

  switch (tag.toLowerCase()) {
    // --- Block elements ---
    case "p": {
      const inlineStyle = parseInlineStyle(attrs.style);
      return (
        <Text key={key} style={[baseStyles.paragraph, baseTextStyle, { fontSize: baseFontSize, lineHeight, textAlign }, inlineStyle]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    }

    case "h1":
      return (
        <Text key={key} style={[baseStyles.heading, baseTextStyle, { fontSize: baseFontSize * 1.8 }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "h2":
      return (
        <Text key={key} style={[baseStyles.heading, baseTextStyle, { fontSize: baseFontSize * 1.5 }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "h3":
      return (
        <Text key={key} style={[baseStyles.heading, baseTextStyle, { fontSize: baseFontSize * 1.3 }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "h4":
      return (
        <Text key={key} style={[baseStyles.heading, baseTextStyle, { fontSize: baseFontSize * 1.15 }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "h5":
      return (
        <Text key={key} style={[baseStyles.heading, baseTextStyle, { fontSize: baseFontSize * 1.05 }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "h6":
      return (
        <Text key={key} style={[baseStyles.heading, baseTextStyle, { fontSize: baseFontSize }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );

    case "blockquote":
      return (
        <View key={key} style={baseStyles.blockquote}>
          {renderNodes(children, options, depth + 1)}
        </View>
      );

    case "div":
    case "section":
    case "article":
    case "aside":
    case "header":
    case "footer":
    case "figure":
    case "figcaption":
    case "main":
    case "nav":
      return (
        <View key={key}>{renderNodes(children, options, depth + 1)}</View>
      );

    // --- Lists ---
    case "ul":
      return (
        <View key={key} style={baseStyles.list}>
          {renderListItems(children, options, depth, false)}
        </View>
      );
    case "ol":
      return (
        <View key={key} style={baseStyles.list}>
          {renderListItems(children, options, depth, true)}
        </View>
      );

    // --- Inline elements ---
    case "em":
    case "i":
      return (
        <Text key={key} style={baseStyles.italic}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "strong":
    case "b":
      return (
        <Text key={key} style={baseStyles.bold}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "u":
      return (
        <Text key={key} style={baseStyles.underline}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "s":
    case "strike":
    case "del":
      return (
        <Text key={key} style={baseStyles.strikethrough}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "sup":
      return (
        <Text key={key} style={baseStyles.superscript}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "sub":
      return (
        <Text key={key} style={baseStyles.subscript}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    case "a": {
      // Render as styled text (tap handling is a future concern)
      return (
        <Text key={key} style={[baseStyles.link, { color: linkColor }]}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    }
    case "span": {
      const inlineStyle = parseInlineStyle(attrs.style);
      return (
        <Text key={key} style={inlineStyle}>
          {renderNodes(children, options, depth + 1)}
        </Text>
      );
    }

    // --- Self-closing / special ---
    case "br":
      return <Text key={key}>{"\n"}</Text>;

    case "hr":
      return <View key={key} style={baseStyles.hr} />;

    case "img": {
      const src = attrs.src;
      if (!src) return null;
      const resolved = options.resolveAsset?.(src);
      if (!resolved) return null;
      const alt = attrs.alt;
      return (
        <View key={key} style={baseStyles.imageContainer}>
          <Image
            source={{ uri: resolved }}
            style={baseStyles.image}
            resizeMode="contain"
            accessibilityLabel={alt}
          />
        </View>
      );
    }

    case "image": {
      // SVG <image> or xlink:href — try to render as Image
      const href = attrs["xlink:href"] ?? attrs.href ?? attrs.src;
      if (!href) return null;
      const resolved = options.resolveAsset?.(href);
      if (!resolved) return null;
      return (
        <View key={key} style={baseStyles.imageContainer}>
          <Image
            source={{ uri: resolved }}
            style={baseStyles.image}
            resizeMode="contain"
          />
        </View>
      );
    }

    // SVG — skip entirely for now (images handled above)
    case "svg":
      return null;

    // --- Tables (basic) ---
    case "table":
      return (
        <View key={key} style={baseStyles.table}>
          {renderNodes(children, options, depth + 1)}
        </View>
      );
    case "thead":
    case "tbody":
    case "tfoot":
      return (
        <View key={key}>{renderNodes(children, options, depth + 1)}</View>
      );
    case "tr":
      return (
        <View key={key} style={baseStyles.tableRow}>
          {renderNodes(children, options, depth + 1)}
        </View>
      );
    case "td":
    case "th": {
      const isHeader = tag === "th";
      return (
        <View key={key} style={baseStyles.tableCell}>
          <Text style={isHeader ? baseStyles.bold : undefined}>
            {renderNodes(children, options, depth + 1)}
          </Text>
        </View>
      );
    }

    // --- Ignored / structural ---
    case "head":
    case "title":
    case "meta":
    case "link":
    case "style":
    case "script":
      return null;

    // --- Fallback: render children ---
    default:
      if (children.length === 0) return null;
      return (
        <Text key={key}>{renderNodes(children, options, depth + 1)}</Text>
      );
  }
}

// ---------------------------------------------------------------------------
// List rendering
// ---------------------------------------------------------------------------

function renderListItems(
  children: unknown[],
  options: RendererOptions,
  depth: number,
  ordered: boolean,
): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  let index = 0;

  for (const node of children) {
    if (typeof node !== "object" || node === null) continue;
    const obj = node as Record<string, unknown>;

    for (const tag of Object.keys(obj)) {
      if (tag === ":@") continue;
      if (tag.toLowerCase() === "li") {
        const liChildren = obj[tag] as unknown[];
        const bullet = ordered ? `${index + 1}. ` : "\u2022 ";
        const bulletColor = options.textColor ?? "#1C1C1E";
        items.push(
          <View key={nextKey()} style={baseStyles.listItem}>
            <Text style={[baseStyles.listBullet, { color: bulletColor }]}>{bullet}</Text>
            <View style={baseStyles.listItemContent}>
              {renderNodes(liChildren, options, depth + 1)}
            </View>
          </View>,
        );
        index++;
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Attribute & style helpers
// ---------------------------------------------------------------------------

function getAttrs(node: Record<string, unknown>): Record<string, string> {
  const attrObj = node[":@"] as Record<string, unknown> | undefined;
  if (!attrObj) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrObj)) {
    // Strip the @_ prefix that fast-xml-parser adds
    const name = key.startsWith("@_") ? key.slice(2) : key;
    result[name] = String(value);
  }
  return result;
}

function findTag(nodes: unknown[], tagName: string): unknown[] | undefined {
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const obj = node as Record<string, unknown>;
    if (tagName in obj) {
      return obj[tagName] as unknown[];
    }
  }
  return undefined;
}

/**
 * Parse a subset of inline CSS `style` attributes into React Native style.
 * Only handles the most common properties used in EPUBs.
 */
function parseInlineStyle(
  styleStr: string | undefined,
): TextStyle & ViewStyle | undefined {
  if (!styleStr) return undefined;

  const style: Record<string, string | number> = {};

  for (const declaration of styleStr.split(";")) {
    const colonIdx = declaration.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = declaration.slice(0, colonIdx).trim().toLowerCase();
    const val = declaration.slice(colonIdx + 1).trim();

    switch (prop) {
      case "font-weight":
        style.fontWeight = val;
        break;
      case "font-style":
        style.fontStyle = val;
        break;
      case "text-align":
        style.textAlign = val;
        break;
      case "text-decoration":
      case "text-decoration-line":
        if (val.includes("underline")) style.textDecorationLine = "underline";
        if (val.includes("line-through")) style.textDecorationLine = "line-through";
        break;
      case "color":
        style.color = val;
        break;
      case "font-size": {
        const px = parsePxValue(val);
        if (px !== undefined) style.fontSize = px;
        break;
      }
      case "margin-top": {
        const px = parsePxValue(val);
        if (px !== undefined) style.marginTop = px;
        break;
      }
      case "margin-bottom": {
        const px = parsePxValue(val);
        if (px !== undefined) style.marginBottom = px;
        break;
      }
      case "margin-left": {
        const px = parsePxValue(val);
        if (px !== undefined) style.marginLeft = px;
        break;
      }
      case "text-indent": {
        const px = parsePxValue(val);
        // RN doesn't have text-indent — approximate with paddingLeft on the text
        if (px !== undefined) style.paddingLeft = px;
        break;
      }
    }
  }

  return Object.keys(style).length > 0
    ? (style as TextStyle & ViewStyle)
    : undefined;
}

function parsePxValue(val: string): number | undefined {
  const match = val.match(/^(-?\d+(?:\.\d+)?)\s*(?:px)?$/);
  if (match?.[1]) return parseFloat(match[1]);
  // Handle em values (approximate: 1em ≈ 16px)
  const emMatch = val.match(/^(-?\d+(?:\.\d+)?)\s*em$/);
  if (emMatch?.[1]) return parseFloat(emMatch[1]) * 16;
  return undefined;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const baseStyles = StyleSheet.create({
  chapter: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  } satisfies ViewStyle,

  paragraph: {
    lineHeight: 28,
    marginBottom: 12,
    color: "#1C1C1E",
  } satisfies TextStyle,

  heading: {
    fontWeight: "700",
    color: "#1C1C1E",
    marginTop: 24,
    marginBottom: 12,
  } satisfies TextStyle,

  bold: {
    fontWeight: "700",
  } satisfies TextStyle,

  italic: {
    fontStyle: "italic",
  } satisfies TextStyle,

  underline: {
    textDecorationLine: "underline",
  } satisfies TextStyle,

  strikethrough: {
    textDecorationLine: "line-through",
  } satisfies TextStyle,

  superscript: {
    fontSize: 11,
    lineHeight: 14,
  } satisfies TextStyle,

  subscript: {
    fontSize: 11,
    lineHeight: 14,
  } satisfies TextStyle,

  link: {
    color: "#007AFF",
  } satisfies TextStyle,

  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#C7C7CC",
    paddingLeft: 16,
    marginVertical: 12,
  } satisfies ViewStyle,

  list: {
    marginVertical: 8,
  } satisfies ViewStyle,

  listItem: {
    flexDirection: "row",
    marginBottom: 4,
  } satisfies ViewStyle,

  listBullet: {
    width: 24,
    color: "#1C1C1E",
    fontSize: 17,
    lineHeight: 28,
  } satisfies TextStyle,

  listItemContent: {
    flex: 1,
  } satisfies ViewStyle,

  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#C7C7CC",
    marginVertical: 16,
  } satisfies ViewStyle,

  imageContainer: {
    alignItems: "center",
    marginVertical: 12,
  } satisfies ViewStyle,

  image: {
    width: "100%",
    height: 300,
  } satisfies ImageStyle,

  table: {
    marginVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C7C7CC",
  } satisfies ViewStyle,

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#C7C7CC",
  } satisfies ViewStyle,

  tableCell: {
    flex: 1,
    padding: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#C7C7CC",
  } satisfies ViewStyle,
});
