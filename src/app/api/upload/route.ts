import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { r2 } from "~/server/r2";
import { env } from "~/env";
import { readingProgress } from "~/server/db/schema";
import { getSessionFromRequest } from "~/server/auth/helpers";

// Step 1: Generate a presigned URL for direct upload to R2
export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

// Step 2: After client uploads directly to R2, save to database.
//
// `bookId` contract (shared by all clients — KOReader plugin, Swift app):
//   - Prefer EPUB dc:identifier (ISBN, UUID, etc.) sanitized.
//   - Fall back to sanitized filename when dc:identifier is absent.
//   - Sanitization: lowercase, replace [^a-z0-9._-] with "-", collapse runs,
//     trim leading/trailing "-". Empty → "unknown".
// The server validates the format but does not re-derive the id.
const BOOK_ID_PATTERN = /^[a-z0-9._-]+$/;

export async function PUT(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { bookId, bookTitle, key, safeName } = (await request.json()) as {
    bookId?: string;
    bookTitle?: string;
    key?: string;
    safeName?: string;
  };

  if (!bookId || !BOOK_ID_PATTERN.test(bookId)) {
    return NextResponse.json(
      { error: "Missing or malformed bookId (expected [a-z0-9._-]+)" },
      { status: 400 },
    );
  }
  if (!key || !safeName) {
    return NextResponse.json(
      { error: "Missing key or safeName" },
      { status: 400 },
    );
  }

  const epubUrl = `${env.R2_PUBLIC_URL}/${key}`;

  const existing = await db.query.readingProgress.findFirst({
    where: eq(readingProgress.bookId, bookId),
  });

  if (existing) {
    await db
      .update(readingProgress)
      .set({ epubUrl, bookTitle: bookTitle ?? existing.bookTitle })
      .where(eq(readingProgress.bookId, bookId));
  } else {
    const fallbackTitle = safeName.replace(/\.epub$/i, "").replace(/-+/g, " ").trim();
    await db.insert(readingProgress).values({
      bookId,
      bookTitle: bookTitle ?? fallbackTitle,
      position: "0",
      progress: 0,
      epubUrl,
    });
  }

  return NextResponse.json({ url: epubUrl });
}
