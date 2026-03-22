import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { readingProgress } from "~/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

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
    updated_at: Math.floor(entry.updatedAt.getTime() / 1000),
  });
}
