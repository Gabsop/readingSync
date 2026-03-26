import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "~/server/db";
import { readingProgress, syncHistory } from "~/server/db/schema";

export async function GET() {
  const all = await db.query.readingProgress.findMany({
    orderBy: [desc(readingProgress.updatedAt)],
  });

  return NextResponse.json(all);
}

export async function POST(request: Request) {
  const body = await request.json() as {
    book_id: string;
    book_title?: string;
    position: string;
    current_page?: number;
    total_pages?: number;
    progress: number;
    updated_at?: number;
    render_settings?: Record<string, number | string | null>;
    source?: string;
    excerpt?: string;
  };

  const { book_id, book_title, position, current_page, total_pages, progress, updated_at, render_settings, source, excerpt } = body;

  console.log("[sync POST]", {
    book_id,
    book_title,
    position,
    current_page,
    total_pages,
    progress,
    render_settings,
  });

  if (!book_id || !position || progress == null) {
    console.log("[sync POST] rejected — missing required fields", { book_id, position, progress });
    return NextResponse.json(
      { status: "error", message: "Missing required fields" },
      { status: 400 },
    );
  }

  const existing = await db.query.readingProgress.findFirst({
    where: eq(readingProgress.bookId, book_id),
  });

  const timestamp = updated_at ? new Date(updated_at * 1000) : new Date();

  if (existing) {
    if (existing.updatedAt >= timestamp) {
      // Position is stale, but always update renderSettings if provided
      if (render_settings) {
        await db
          .update(readingProgress)
          .set({ renderSettings: JSON.stringify(render_settings) })
          .where(eq(readingProgress.bookId, book_id));
      }
      console.log("[sync POST] skipped position — local is newer, renderSettings updated:", !!render_settings, {
        book_id,
        local: existing.updatedAt.toISOString(),
        incoming: timestamp.toISOString(),
      });
      return NextResponse.json({ status: "skipped", reason: "local is newer" });
    }

    await db
      .update(readingProgress)
      .set({
        position,
        currentPage: current_page ?? existing.currentPage,
        totalPages: total_pages ?? existing.totalPages,
        progress,
        bookTitle: book_title ?? existing.bookTitle,
        epubUrl: existing.epubUrl,
        renderSettings: render_settings ? JSON.stringify(render_settings) : existing.renderSettings,
        excerpt: excerpt ?? existing.excerpt,
        source: source ?? existing.source,
        updatedAt: timestamp,
      })
      .where(eq(readingProgress.bookId, book_id));
  } else {
    await db.insert(readingProgress).values({
      bookId: book_id,
      bookTitle: book_title,
      position,
      currentPage: current_page,
      totalPages: total_pages,
      progress,
      renderSettings: render_settings ? JSON.stringify(render_settings) : null,
      excerpt,
      source,
      updatedAt: timestamp,
    });
  }

  // Record in sync history
  if (source) {
    await db.insert(syncHistory).values({
      bookId: book_id,
      position,
      currentPage: current_page,
      totalPages: total_pages,
      progress,
      excerpt,
      source,
      createdAt: timestamp,
    });
  }

  return NextResponse.json({ status: "ok" });
}
