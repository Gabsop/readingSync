/**
 * PaginatedChapter — renders EPUB chapter content page-by-page.
 *
 * Strategy:
 *   1. Render all content into a ScrollView for measurement.
 *   2. On content size change, compute page breaks from total height.
 *   3. Display current page via scroll offset (pagingEnabled).
 *   4. Expose page/total for the reader footer.
 *
 * This avoids remounting content between pages and lets React Native
 * handle text measurement natively.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";

const HORIZONTAL_PADDING = 24;
const VERTICAL_PADDING = 16;

interface PaginatedChapterProps {
  /** Rendered React elements from renderXhtml() */
  children: React.ReactNode;
  /** Height reserved for header above the content area */
  headerHeight: number;
  /** Height reserved for footer below the content area */
  footerHeight: number;
  /** Called when pagination info changes */
  onPageChange?: (currentPage: number, totalPages: number) => void;
}

export function PaginatedChapter({
  children,
  headerHeight,
  footerHeight,
  onPageChange,
}: PaginatedChapterProps) {
  const { width, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [totalPages, setTotalPages] = useState(1);
  const currentPageRef = useRef(0);

  // Available height for one page of content
  const pageHeight = screenHeight - headerHeight - footerHeight;

  const handleContentSizeChange = useCallback(
    (_w: number, contentHeight: number) => {
      if (contentHeight <= 0 || pageHeight <= 0) return;
      const pages = Math.max(1, Math.ceil(contentHeight / pageHeight));
      setTotalPages(pages);
      onPageChange?.(1, pages);
      currentPageRef.current = 0;
    },
    [pageHeight, onPageChange],
  );

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const page = Math.round(offsetY / pageHeight);
      if (page !== currentPageRef.current) {
        currentPageRef.current = page;
        onPageChange?.(page + 1, totalPages);
      }
    },
    [pageHeight, totalPages, onPageChange],
  );

  return (
    <View style={[styles.container, { height: pageHeight }]}>
      <ScrollView
        ref={scrollRef}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        contentContainerStyle={styles.contentContainer}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Programmatically navigate to a page index (0-based).
 * Attach a ref to PaginatedChapter and call scrollToPage on the inner ScrollView.
 */
export function scrollToPage(
  scrollRef: React.RefObject<ScrollView | null>,
  page: number,
  pageHeight: number,
  animated = false,
) {
  scrollRef.current?.scrollTo({ y: page * pageHeight, animated });
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  contentContainer: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: VERTICAL_PADDING,
  },
});
