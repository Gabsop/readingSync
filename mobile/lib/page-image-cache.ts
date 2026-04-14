/**
 * Pre-captures WebView-rendered EPUB pages as Skia-compatible images.
 *
 * When a chapter loads or a page changes, this module captures the current
 * and adjacent pages as PNG images and converts them to Skia SkImage objects.
 * These are then ready for the page curl shader without any delay during drag.
 */

import { Skia } from "@shopify/react-native-skia";
import { captureRef } from "react-native-view-shot";
import type { SkImage } from "@shopify/react-native-skia";
import type { RefObject } from "react";
import type { View } from "react-native";
import type { EpubPageViewRef } from "./epub-webview";

export interface PageImages {
  current: SkImage | null;
  next: SkImage | null;
  prev: SkImage | null;
}

/**
 * Capture a View as a Skia SkImage.
 */
async function captureAsSkImage(viewRef: RefObject<View>): Promise<SkImage | null> {
  if (!viewRef.current) return null;
  try {
    const uri = await captureRef(viewRef.current, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

/**
 * Pre-capture current, next, and previous pages.
 * Navigates the WebView to each page, captures, then returns to current.
 */
export async function capturePageImages(
  viewRef: RefObject<View>,
  webViewRef: RefObject<EpubPageViewRef>,
  currentPage: number,
  totalPages: number,
): Promise<PageImages> {
  const result: PageImages = { current: null, next: null, prev: null };

  // Capture current page
  result.current = await captureAsSkImage(viewRef);

  // Capture next page
  if (currentPage < totalPages - 1) {
    webViewRef.current?.snapToPage(currentPage + 1, false);
    await delay(80);
    result.next = await captureAsSkImage(viewRef);
  }

  // Capture previous page
  if (currentPage > 0) {
    webViewRef.current?.snapToPage(currentPage - 1, false);
    await delay(80);
    result.prev = await captureAsSkImage(viewRef);
  }

  // Return to current page
  webViewRef.current?.snapToPage(currentPage, false);

  return result;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
