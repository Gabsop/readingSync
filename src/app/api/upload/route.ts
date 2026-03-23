import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { r2 } from "~/server/r2";
import { env } from "~/env";
import { readingProgress } from "~/server/db/schema";

// Step 1: Generate a presigned URL for direct upload to R2
export async function POST(request: Request) {
  const { fileName } = (await request.json()) as { fileName: string };

  if (!fileName) {
    return NextResponse.json({ error: "No fileName provided" }, { status: 400 });
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `epubs/${safeName}`;

  const signedUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: "application/epub+zip",
    }),
    { expiresIn: 600 },
  );

  return NextResponse.json({ signedUrl, key, safeName });
}

// Step 2: After client uploads directly to R2, save to database
export async function PUT(request: Request) {
  const { key, safeName } = (await request.json()) as {
    key: string;
    safeName: string;
  };

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
