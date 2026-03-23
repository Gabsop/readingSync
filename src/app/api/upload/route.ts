import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { r2 } from "~/server/r2";
import { env } from "~/env";
import { readingProgress } from "~/server/db/schema";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `epubs/${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/epub+zip",
    }),
  );

  const epubUrl = `${env.R2_PUBLIC_URL}/${key}`;
  const bookId = safeName;

  const existing = await db.query.readingProgress.findFirst({
    where: eq(readingProgress.bookId, bookId),
  });

  if (existing) {
    await db
      .update(readingProgress)
      .set({ epubUrl })
      .where(eq(readingProgress.bookId, bookId));
  } else {
    await db.insert(readingProgress).values({
      bookId,
      bookTitle: safeName.replace(".epub", "").replace(/-+/g, " ").trim(),
      position: "0",
      progress: 0,
      epubUrl,
    });
  }

  return NextResponse.json({ url: epubUrl });
}
