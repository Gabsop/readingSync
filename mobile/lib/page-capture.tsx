/**
 * Captures WebView-rendered EPUB pages as images for the Skia page curl shader.
 *
 * Uses react-native-view-shot to snapshot each page, then provides the
 * captured images to the PageCurl shader component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { captureRef } from "react-native-view-shot";
import { Skia } from "@shopify/react-native-skia";
import { EpubPageView } from "./epub-webview";
import type { EpubPageViewRef } from "./epub-webview";
import type { SkImage } from "@shopify/react-native-skia";

interface PageCaptureProps {
  xhtml: string;
  imageCache: Map<string, string>;
  currentPage: number;
  totalPages: number;
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  textColor: string;
  backgroundColor: string;
  linkColor: string;
  textAlign: string;
  horizontalMargin: number;
  pageHeight: number;
  onPageCount: (count: number) => void;
  onCapture: (frontImage: SkImage | null, backImage: SkImage | null) => void;
}

export function PageCapture({
  xhtml,
  imageCache,
  currentPage,
  totalPages,
  fontSize,
  lineHeight,
  fontFamily,
  textColor,
  backgroundColor,
  linkColor,
  textAlign,
  horizontalMargin,
  pageHeight,
  onPageCount,
  onCapture,
}: PageCaptureProps) {
  const captureViewRef = useRef<View>(null);
  const webViewRef = useRef<EpubPageViewRef>(null);
  const [capturedPage, setCapturedPage] = useState(-1);

  const captureCurrentPage = useCallback(async () => {
    if (!captureViewRef.current || capturedPage === currentPage) return;

    try {
      // Capture current page
      const frontUri = await captureRef(captureViewRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const frontData = await Skia.Data.fromURI(frontUri);
      const frontImg = Skia.Image.MakeImageFromEncoded(frontData);

      // Navigate to next page and capture
      const nextPage = Math.min(currentPage + 1, totalPages - 1);
      webViewRef.current?.snapToPage(nextPage, false);

      // Small delay for WebView to update
      await new Promise((resolve) => setTimeout(resolve, 100));

      const backUri = await captureRef(captureViewRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const backData = await Skia.Data.fromURI(backUri);
      const backImg = Skia.Image.MakeImageFromEncoded(backData);

      // Navigate back to current page
      webViewRef.current?.snapToPage(currentPage, false);

      onCapture(frontImg, backImg);
      setCapturedPage(currentPage);
    } catch {
      // Capture failed — fall back to no-curl mode
    }
  }, [currentPage, capturedPage, totalPages, onCapture]);

  useEffect(() => {
    // Re-capture when page changes
    const timer = setTimeout(captureCurrentPage, 200);
    return () => clearTimeout(timer);
  }, [currentPage, captureCurrentPage]);

  return (
    <View
      ref={captureViewRef}
      style={[styles.captureContainer, { height: pageHeight }]}
      collapsable={false}
    >
      <EpubPageView
        ref={webViewRef}
        xhtml={xhtml}
        imageCache={imageCache}
        page={currentPage}
        onPageCount={onPageCount}
        fontSize={fontSize}
        lineHeight={lineHeight}
        fontFamily={fontFamily}
        textColor={textColor}
        backgroundColor={backgroundColor}
        linkColor={linkColor}
        textAlign={textAlign}
        horizontalMargin={horizontalMargin}
        pageHeight={pageHeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  captureContainer: {
    // Off-screen or visible — WebView renders here for capture
    overflow: "hidden",
  },
});
