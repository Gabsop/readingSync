import { SQLiteDatabase } from "expo-sqlite";
import { CREATE_TABLES_SQL, DATABASE_VERSION } from "./schema";

/**
 * Initialize the database: create tables and run migrations.
 * Passed as the `onInit` callback to `<SQLiteProvider>`.
 */
export async function initializeDatabase(db: SQLiteDatabase) {
  const currentVersion = await getSchemaVersion(db);

  if (currentVersion < DATABASE_VERSION) {
    await db.execAsync(CREATE_TABLES_SQL);
    await setSchemaVersion(db, DATABASE_VERSION);
  }
}

async function getSchemaVersion(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  return result?.user_version ?? 0;
}

async function setSchemaVersion(db: SQLiteDatabase, version: number) {
  await db.execAsync(`PRAGMA user_version = ${version}`);
}
