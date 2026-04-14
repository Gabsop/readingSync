/**
 * WebView-based EPUB page renderer using CSS multi-column layout.
 * This gives proper page breaks — text is never cut mid-line.
 *
 * The chapter XHTML is injected into an HTML template with:
 *   - column-width = viewport width (each column = one page)
 *   - horizontal scrolling disabled (pages controlled via JS bridge)
 *   - Page count communicated back via postMessage
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import WebView from "react-native-webview";

export interface EpubPageViewRef {
  /** Set scroll offset directly for drag-follow (0 = current page, negative = next page) */
  setDragOffset: (offset: number) => void;
  /** Animate to a page */
  snapToPage: (page: number, animated?: boolean) => void;
}

interface EpubPageViewProps {
  /** Raw XHTML string for the chapter */
  xhtml: string;
  /** Map of image hrefs to data URIs */
  imageCache: Map<string, string>;
  /** Current page index (0-based) */
  page: number;
  /** Called when total page count is determined */
  onPageCount: (count: number) => void;
  /** Reader settings */
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  textColor: string;
  backgroundColor: string;
  linkColor: string;
  textAlign: string;
  horizontalMargin: number;
  /** Height available for content (between header and footer) */
  pageHeight: number;
}

export const EpubPageView = forwardRef(function EpubPageView({
  xhtml,
  imageCache,
  page,
  onPageCount,
  fontSize,
  lineHeight,
  fontFamily,
  textColor,
  backgroundColor,
  linkColor,
  textAlign,
  horizontalMargin,
  pageHeight,
}, ref) {
  const { width: screenWidth } = useWindowDimensions();
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const textWidth = screenWidth - horizontalMargin * 2;

  // Replace image src with data URIs from cache
  const processedXhtml = xhtml.replace(
    /src=["']([^"']+)["']/g,
    (match, href) => {
      const decoded = decodeURIComponent(href);
      const stripped = decoded.replace(/^(\.\.\/)+/, "");
      const dataUri = imageCache.get(href) ?? imageCache.get(decoded) ?? imageCache.get(stripped);
      if (dataUri) return `src="${dataUri}"`;
      return match;
    },
  );

  // Also handle xlink:href for SVG images
  const finalXhtml = processedXhtml.replace(
    /xlink:href=["']([^"']+)["']/g,
    (match, href) => {
      const stripped = decodeURIComponent(href).replace(/^(\.\.\/)+/, "");
      const dataUri = imageCache.get(href) ?? imageCache.get(stripped);
      if (dataUri) return `xlink:href="${dataUri}"`;
      return match;
    },
  );

  const fontFamilyCSS = fontFamily ? `"${fontFamily}", ` : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=${screenWidth}, initial-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: ${screenWidth}px;
    height: ${pageHeight}px;
    overflow: hidden;
    background-color: ${backgroundColor};
  }

  #wrapper {
    width: ${screenWidth}px;
    height: ${pageHeight}px;
    overflow: hidden;
  }

  #content {
    column-width: ${textWidth}px;
    column-gap: ${horizontalMargin * 2}px;
    column-fill: auto;
    height: ${pageHeight}px;
    margin: 0 ${horizontalMargin}px;

    font-size: ${fontSize}px;
    line-height: ${lineHeight}px;
    font-family: ${fontFamilyCSS} -apple-system, system-ui, sans-serif;
    color: ${textColor};
    text-align: ${textAlign};

    -webkit-hyphens: auto;
    hyphens: auto;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  #content p {
    margin-bottom: ${Math.round(lineHeight * 0.5)}px;
    orphans: 2;
    widows: 2;
  }

  #content h1, #content h2, #content h3, #content h4, #content h5, #content h6 {
    break-after: avoid;
    margin-top: ${lineHeight}px;
    margin-bottom: ${Math.round(lineHeight * 0.4)}px;
    line-height: 1.3;
  }

  #content h1 { font-size: ${Math.round(fontSize * 1.6)}px; }
  #content h2 { font-size: ${Math.round(fontSize * 1.4)}px; }
  #content h3 { font-size: ${Math.round(fontSize * 1.2)}px; }

  #content img {
    max-width: 100%;
    max-height: ${pageHeight - lineHeight}px;
    height: auto;
    display: block;
    margin: ${Math.round(lineHeight * 0.5)}px auto;
    break-inside: avoid;
  }

  #content a { color: ${linkColor}; text-decoration: none; }

  #content blockquote {
    margin: ${Math.round(lineHeight * 0.5)}px 0;
    padding-left: ${Math.round(fontSize * 1.2)}px;
    border-left: 3px solid ${linkColor}40;
    font-style: italic;
  }

  #content pre, #content code {
    font-family: ui-monospace, monospace;
    font-size: ${Math.round(fontSize * 0.85)}px;
  }

  #content table { border-collapse: collapse; width: 100%; }
  #content td, #content th { padding: 4px 8px; border: 1px solid ${textColor}30; }

  #content figure { break-inside: avoid; }

  #content svg:not([width]):not([height]) { display: none; }

  /* Page turn shadow — thin fold line */
  #page-shadow {
    position: fixed;
    top: 0;
    width: 20px;
    height: 100%;
    pointer-events: none;
    opacity: 0;
    z-index: 100;
    background: linear-gradient(
      to right,
      rgba(0,0,0,0) 0%,
      rgba(0,0,0,0.12) 40%,
      rgba(0,0,0,0.2) 50%,
      rgba(0,0,0,0.12) 60%,
      rgba(0,0,0,0) 100%
    );
  }
</style>
</head>
<body>
<div id="wrapper">
  <div id="content">${finalXhtml}</div>
</div>
<div id="page-shadow"></div>
<script>
  var PAGE_WIDTH = ${screenWidth};
  var shadow = document.getElementById('page-shadow');
  var currentDragOffset = 0;

  function reportPages() {
    var el = document.getElementById('content');
    var totalWidth = el.scrollWidth + ${horizontalMargin * 2};
    var pages = Math.max(1, Math.round(totalWidth / PAGE_WIDTH));
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pageCount', pages: pages }));
  }

  function goToPage(page, animated) {
    var wrapper = document.getElementById('wrapper');
    hideShadow();
    if (animated) {
      wrapper.scrollTo({ left: page * PAGE_WIDTH, behavior: 'smooth' });
    } else {
      wrapper.scrollLeft = page * PAGE_WIDTH;
    }
  }

  function setDragScroll(baseLeft, offset) {
    var wrapper = document.getElementById('wrapper');
    wrapper.scrollLeft = baseLeft - offset;

    var dragAmount = Math.abs(offset);
    if (dragAmount > 5) {
      var edgeX = offset > 0 ? offset : PAGE_WIDTH + offset;
      shadow.style.left = (edgeX - 10) + 'px';
      shadow.style.opacity = Math.min(0.8, dragAmount / 100);
      shadow.style.display = 'block';
    } else {
      hideShadow();
    }
  }

  function hideShadow() {
    shadow.style.opacity = 0;
    shadow.style.display = 'none';
  }

  window.addEventListener('load', function() {
    var wrapper = document.getElementById('wrapper');
    wrapper.style.overflowX = 'scroll';
    wrapper.style.scrollbarWidth = 'none';
    wrapper.style.msOverflowStyle = 'none';
    wrapper.style.webkitOverflowScrolling = 'touch';
    var style = document.createElement('style');
    style.textContent = '#wrapper::-webkit-scrollbar { display: none; }';
    document.head.appendChild(style);
    setTimeout(reportPages, 100);
  });

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(reportPages, 50);
  });
</script>
</body>
</html>`;

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "pageCount") {
          onPageCount(msg.pages);
          setReady(true);
        }
      } catch {}
    },
    [onPageCount],
  );

  useImperativeHandle(ref, () => ({
    setDragOffset: (offset: number) => {
      const baseLeft = page * screenWidth;
      webViewRef.current?.injectJavaScript(
        `setDragScroll(${baseLeft}, ${offset}); true;`
      );
    },
    snapToPage: (targetPage: number, animated = false) => {
      webViewRef.current?.injectJavaScript(`if(typeof goToPage==='function')goToPage(${targetPage},${animated}); true;`);
    },
  }), [page, screenWidth]);

  // Navigate to page when page prop changes (no drag)
  useEffect(() => {
    if (ready) {
      webViewRef.current?.injectJavaScript(`if(typeof goToPage==='function')goToPage(${page},false); true;`);
    }
  }, [page, ready]);

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={{ html }}
      style={[styles.webview, { height: pageHeight, backgroundColor }]}
      scrollEnabled={false}
      bounces={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled={false}
      allowsLinkPreview={false}
      decelerationRate="normal"
      contentMode="mobile"
      pointerEvents="none"
    />
  );
});

const styles = StyleSheet.create({
  webview: {
    flex: 0,
  },
});
