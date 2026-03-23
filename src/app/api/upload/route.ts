import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { readingProgress } from "~/server/db/schema";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || !file.name.endsWith(".epub")) {
    return NextResponse.json(
      { status: "error", message: "Must upload an .epub file" },
      { status: 400 },
    );
  }

  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: false,
  });

  const bookId = file.name;
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
      bookTitle: file.name.replace(".epub", ""),
      position: "0",
      progress: 0,
      epubUrl: blob.url,
    });
  }

  return NextResponse.json({ status: "ok", url: blob.url, bookId });
}
