import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "~/server/db";
import { readingProgress, syncHistory } from "~/server/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const url = new URL(request.url);
  const source = url.searchParams.get("source");

  // If ?source=web, return the latest sync from that source
  if (source) {
    const entry = await db.query.syncHistory.findFirst({
      where: and(
        eq(syncHistory.bookId, bookId),
        eq(syncHistory.source, source),
      ),
      orderBy: [desc(syncHistory.createdAt)],
    });

    if (!entry) {
      return NextResponse.json(
        { status: "not_found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      book_id: entry.bookId,
      position: entry.position,
      current_page: entry.currentPage,
      total_pages: entry.totalPages,
      progress: entry.progress,
      excerpt: entry.excerpt,
      source: entry.source,
      device_id: entry.deviceId,
      updated_at: Math.floor(entry.createdAt.getTime() / 1000),
    });
  }

  // Default: return current progress
  const entry = await db.query.readingProgress.findFirst({
    where: eq(readingProgress.bookId, bookId),
  });

  if (!entry) {
    return NextResponse.json(
      { status: "not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    book_id: entry.bookId,
    book_title: entry.bookTitle,
    position: entry.position,
    current_page: entry.currentPage,
    total_pages: entry.totalPages,
    progress: entry.progress,
    excerpt: entry.excerpt,
    source: entry.source,
    device_id: entry.deviceId,
    updated_at: Math.floor(entry.updatedAt.getTime() / 1000),
  });
}
