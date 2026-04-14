/**
 * Paginates an array of React elements into pages based on available height.
 *
 * Instead of treating elements as atomic units (which leaves pages half-empty),
 * this renders ALL elements in a tall column and uses vertical offset + clipping
 * to show each page's worth of content. This way long paragraphs flow naturally
 * across pages, just like CSS columns do.
 */

import { View, StyleSheet } from "react-native";

/**
 * A page is defined by a vertical offset into the full content column.
 * The page shows content from `offset` to `offset + pageHeight`.
 */
export interface PageSlice {
  offset: number;
}

/**
 * Build page slices from measured element heights.
 * Each page starts where the previous one ended.
 */
/**
 * Build pages by walking through element boundaries.
 * Each page fills as much content as fits within contentHeight.
 * Page breaks always fall at element boundaries — never mid-paragraph.
 * If a single element is taller than the page, it gets its own page(s).
 *
 * @param lineHeight - used to snap tall-element pages to line boundaries
 */
export function buildPages(
  heights: number[],
  pageHeight: number,
  lineHeight = 0,
): PageSlice[] {
  const totalHeight = heights.reduce((sum, h) => sum + h, 0);
  if (totalHeight <= 0) return [{ offset: 0 }];

  const contentHeight = pageHeight - PAGE_PADDING_Y * 2;
  const pages: PageSlice[] = [];

  // Compute cumulative heights for each element boundary
  const cumulative: number[] = [0];
  for (const h of heights) {
    cumulative.push(cumulative[cumulative.length - 1]! + h);
  }

  let offset = 0;
  while (offset < totalHeight) {
    pages.push({ offset });

    // Find how much content fits on this page
    // Walk through elements to find the last one that fits entirely
    let bestBreak = offset + contentHeight;

    // Find the element boundary closest to (but not exceeding) offset + contentHeight
    for (let i = 0; i < cumulative.length; i++) {
      if (cumulative[i]! > offset + contentHeight) {
        // Element i starts past the page — break before it
        if (i > 0 && cumulative[i - 1]! > offset) {
          bestBreak = cumulative[i - 1]!;
        }
        break;
      }
    }

    // If bestBreak didn't advance (single element taller than page),
    // just advance by contentHeight snapped to lineHeight
    if (bestBreak <= offset) {
      bestBreak = offset + (lineHeight > 0
        ? Math.floor(contentHeight / lineHeight) * lineHeight
        : contentHeight);
    }

    offset = bestBreak;
  }

  return pages;
}

/**
 * Hidden measurement view — renders all elements invisibly to measure their heights.
 */
export function MeasurementView({
  elements,
  horizontalMargin,
  onLayout,
}: {
  elements: React.ReactNode[];
  horizontalMargin: number;
  onLayout: (index: number, height: number) => void;
}) {
  return (
    <View style={[styles.hidden, { paddingHorizontal: horizontalMargin }]}>
      {elements.map((el, i) => (
        <View
          key={i}
          onLayout={(e) => onLayout(i, e.nativeEvent.layout.height)}
        >
          {el}
        </View>
      ))}
    </View>
  );
}

/**
 * Renders a single page of content by showing ALL elements in a tall column,
 * offset vertically so only the current page's slice is visible.
 * Overflow is clipped to the page height.
 */
const PAGE_PADDING_Y = 16;

export function PageContent({
  elements,
  pageSlice,
  horizontalMargin,
  backgroundColor,
  pageHeight,
}: {
  elements: React.ReactNode[];
  pageSlice: PageSlice;
  horizontalMargin: number;
  backgroundColor: string;
  pageHeight: number;
}) {
  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor,
          height: pageHeight,
          paddingVertical: PAGE_PADDING_Y,
        },
      ]}
    >
      <View
        style={{
          paddingHorizontal: horizontalMargin,
          transform: [{ translateY: -pageSlice.offset }],
        }}
      >
        {elements}
      </View>
    </View>
  );
}

export { PAGE_PADDING_Y };

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    top: -99999,
    left: 0,
    right: 0,
    opacity: 0,
  },
  page: {
    overflow: "hidden",
  },
});
