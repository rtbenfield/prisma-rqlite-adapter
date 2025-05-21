import { PrismaRqliteAdapter } from "../src/index.js";
import { PrismaClient } from "./generated/prisma/client.js";

export const prisma = new PrismaClient({
  adapter: new PrismaRqliteAdapter({
    connectionString: "http://localhost:4001",
  }),
});

export async function setup() {
  const response = await fetch("http://localhost:4001/db/execute", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "@rtbenfield/prisma-rqlite-adapter",
    },
    body: JSON.stringify([
      [`DELETE FROM "DataTypes"`],
      [`DELETE FROM "Tasks"`],
      [`DELETE FROM "User"`],
    ]),
  });
  if (!response.ok) {
    throw new Error(`rqlite error! status: ${response.status}`);
  }
  await response.body?.cancel();
}
