import { z } from "zod";
import { eq, desc } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { readingProgress } from "~/server/db/schema";

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
          updatedAt: timestamp,
        });
      }

      return { status: "ok" as const };
    }),
});
