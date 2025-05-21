import { expect, test } from "vitest";
import { PrismaRqliteAdapter } from "../src/index.js";
import { PrismaClient } from "./generated/prisma/client.js";
import { prisma } from "./setup.js";

test("invalid connection string", async () => {
  const prisma = new PrismaClient({
    adapter: new PrismaRqliteAdapter({
      connectionString: "http://localhost:9999",
    }),
  });

  await expect(
    prisma.$queryRaw`SELECT 1`,
  ).rejects.toThrowErrorMatchingInlineSnapshot(`[TypeError: fetch failed]`);
  await expect(
    prisma.$executeRaw`SELECT 1`,
  ).rejects.toThrowErrorMatchingInlineSnapshot(`[TypeError: fetch failed]`);
});

test("invalid query text", async () => {
  await expect(
    prisma.$executeRaw`asoidja`,
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `
    [PrismaClientKnownRequestError: 
    Invalid \`prisma.$executeRaw()\` invocation:


    Raw query failed. Code: \`1\`. Message: \`near "asoidja": syntax error\`]
  `,
  );

  await expect(
    prisma.$queryRaw`asoidja`,
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `
    [PrismaClientKnownRequestError: 
    Invalid \`prisma.$queryRaw()\` invocation:


    Raw query failed. Code: \`1\`. Message: \`near "asoidja": syntax error\`]
  `,
  );
});

test("unknown table", async () => {
  await expect(
    prisma.$executeRaw`SELECT * FROM unknown_table`,
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `
    [PrismaClientKnownRequestError: 
    Invalid \`prisma.$executeRaw()\` invocation:


    Raw query failed. Code: \`1\`. Message: \`no such table: unknown_table\`]
  `,
  );

  await expect(
    prisma.$queryRaw`SELECT * FROM unknown_table`,
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `
    [PrismaClientKnownRequestError: 
    Invalid \`prisma.$queryRaw()\` invocation:


    Raw query failed. Code: \`1\`. Message: \`no such table: unknown_table\`]
  `,
  );
});
