import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema.js";

export function createDatabaseConnection(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
  });

  const db = drizzle(client, { schema });
  return { db, client };
}

export type DatabaseConnection = ReturnType<typeof createDatabaseConnection>;
export type Database = DatabaseConnection["db"];
