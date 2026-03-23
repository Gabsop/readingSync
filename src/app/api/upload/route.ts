import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { readingProgress } from "~/server/db/schema";

export async function POST(request: Request) {
  const body = await request.json();

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => {
      return {};
    },
    onUploadCompleted: async ({ blob }) => {
      const bookId = blob.pathname;
      const existing = await db.query.readingProgress.findFirst({
        where: eq(readingProgress.bookId, bookId),
      });

      if (existing) {
        await db
          .update(readingProgress)
          .set({ epubUrl: blob.url })
          .where(eq(readingProgress.bookId, bookId));
      } else {
        await db.insert(readingProgress).values({
          bookId,
          bookTitle: bookId.replace(".epub", ""),
          position: "0",
          progress: 0,
          epubUrl: blob.url,
        });
      }
    },
  });

  return NextResponse.json(jsonResponse);
}
