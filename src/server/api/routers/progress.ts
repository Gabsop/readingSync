import { z } from "zod";
import { eq, desc } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { readingProgress, syncHistory } from "~/server/db/schema";

export const progressRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.readingProgress.findMany({
      orderBy: [desc(readingProgress.updatedAt)],
    });
  }),

  getByBookId: publicProcedure
    .input(z.object({ bookId: z.string() }))
    .query(async ({ ctx, input }) => {
      return (
        ctx.db.query.readingProgress.findFirst({
          where: eq(readingProgress.bookId, input.bookId),
        }) ?? null
      );
    }),

  save: publicProcedure
    .input(
      z.object({
        bookId: z.string(),
        bookTitle: z.string().optional(),
        position: z.string(),
        currentPage: z.number().int().optional(),
        totalPages: z.number().int().optional(),
        progress: z.number().min(0).max(1),
        updatedAt: z.number().optional(),
        source: z.string().optional(),
        excerpt: z.string().optional(),
        deviceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.readingProgress.findFirst({
        where: eq(readingProgress.bookId, input.bookId),
      });

      const timestamp = input.updatedAt
        ? new Date(input.updatedAt * 1000)
        : new Date();

      if (existing) {
        if (existing.updatedAt >= timestamp) {
          return { status: "skipped" as const, reason: "local is newer" };
        }

        await ctx.db
          .update(readingProgress)
          .set({
            position: input.position,
            currentPage: input.currentPage ?? existing.currentPage,
            totalPages: input.totalPages ?? existing.totalPages,
            progress: input.progress,
            bookTitle: input.bookTitle ?? existing.bookTitle,
            excerpt: input.excerpt ?? existing.excerpt,
            source: input.source ?? existing.source,
            deviceId: input.deviceId ?? existing.deviceId,
            updatedAt: timestamp,
          })
          .where(eq(readingProgress.bookId, input.bookId));
      } else {
        await ctx.db.insert(readingProgress).values({
          bookId: input.bookId,
          bookTitle: input.bookTitle,
          position: input.position,
          currentPage: input.currentPage,
          totalPages: input.totalPages,
          progress: input.progress,
          excerpt: input.excerpt,
          source: input.source,
          deviceId: input.deviceId,
          updatedAt: timestamp,
        });
      }

      // Record in sync history
      if (input.source) {
        await ctx.db.insert(syncHistory).values({
          bookId: input.bookId,
          position: input.position,
          currentPage: input.currentPage,
          totalPages: input.totalPages,
          progress: input.progress,
          excerpt: input.excerpt,
          source: input.source,
          deviceId: input.deviceId,
          createdAt: timestamp,
        });
      }

      return { status: "ok" as const };
    }),

  linkBooks: publicProcedure
    .input(
      z.object({
        keepBookId: z.string(),
        epubBookId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const epubBook = await ctx.db.query.readingProgress.findFirst({
        where: eq(readingProgress.bookId, input.epubBookId),
      });

      if (!epubBook?.epubUrl) {
        throw new Error("Source book has no EPUB URL");
      }

      await ctx.db
        .update(readingProgress)
        .set({ epubUrl: epubBook.epubUrl })
        .where(eq(readingProgress.bookId, input.keepBookId));

      await ctx.db
        .delete(readingProgress)
        .where(eq(readingProgress.bookId, input.epubBookId));

      return { status: "ok" as const };
    }),
});
