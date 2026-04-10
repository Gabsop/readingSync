import { relations, sql } from "drizzle-orm";
import {
  index,
  pgTableCreator,
} from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `web_${name}`);

// ---------------------------------------------------------------------------
// Reading progress & sync
// ---------------------------------------------------------------------------

export const readingProgress = createTable(
  "reading_progress",
  (d) => ({
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    bookId: d.varchar({ length: 512 }).notNull(),
    bookTitle: d.varchar({ length: 512 }),
    position: d.varchar({ length: 1024 }).notNull(),
    currentPage: d.integer(),
    totalPages: d.integer(),
    progress: d.real().notNull(),
    epubUrl: d.varchar({ length: 1024 }),
    renderSettings: d.text(),
    excerpt: d.varchar({ length: 2048 }),
    source: d.varchar({ length: 32 }),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [index("book_id_idx").on(t.bookId)],
);

export const syncHistory = createTable(
  "sync_history",
  (d) => ({
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    bookId: d.varchar({ length: 512 }).notNull(),
    position: d.varchar({ length: 1024 }).notNull(),
    currentPage: d.integer(),
    totalPages: d.integer(),
    progress: d.real().notNull(),
    excerpt: d.varchar({ length: 2048 }),
    source: d.varchar({ length: 32 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("sync_history_book_id_idx").on(t.bookId),
    index("sync_history_book_source_idx").on(t.bookId, t.source),
  ],
);

// ---------------------------------------------------------------------------
// better-auth tables
// ---------------------------------------------------------------------------

export const users = createTable("users", (d) => ({
  id: d.varchar({ length: 36 }).notNull().primaryKey(),
  name: d.text().notNull(),
  email: d.varchar({ length: 255 }).notNull().unique(),
  emailVerified: d.boolean().notNull().default(false),
  image: d.text(),
  createdAt: d.timestamp().notNull().defaultNow(),
  updatedAt: d.timestamp().notNull().defaultNow(),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const accounts = createTable(
  "accounts",
  (d) => ({
    id: d.varchar({ length: 36 }).notNull().primaryKey(),
    accountId: d.text().notNull(),
    providerId: d.text().notNull(),
    userId: d
      .varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: d.text(),
    refreshToken: d.text(),
    idToken: d.text(),
    accessTokenExpiresAt: d.timestamp(),
    refreshTokenExpiresAt: d.timestamp(),
    scope: d.text(),
    password: d.text(),
    createdAt: d.timestamp().notNull().defaultNow(),
    updatedAt: d.timestamp().notNull().defaultNow(),
  }),
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
  "sessions",
  (d) => ({
    id: d.varchar({ length: 36 }).notNull().primaryKey(),
    expiresAt: d.timestamp().notNull(),
    token: d.text().notNull().unique(),
    createdAt: d.timestamp().notNull().defaultNow(),
    updatedAt: d.timestamp().notNull().defaultNow(),
    ipAddress: d.text(),
    userAgent: d.text(),
    userId: d
      .varchar({ length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  }),
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verifications = createTable("verifications", (d) => ({
  id: d.varchar({ length: 36 }).notNull().primaryKey(),
  identifier: d.text().notNull(),
  value: d.text().notNull(),
  expiresAt: d.timestamp().notNull(),
  createdAt: d.timestamp().defaultNow(),
  updatedAt: d.timestamp().defaultNow(),
}));
