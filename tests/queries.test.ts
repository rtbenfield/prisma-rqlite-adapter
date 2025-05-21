import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma, setup } from "./setup.js";

beforeEach(async () => {
  await setup();
});

afterAll(async () => {
  // checks disposal() call
  await prisma.$disconnect();
});

test("create + createMany + findMany + count", async () => {
  const user = await prisma.user.create({
    data: {
      email: "test@example.com",
    },
  });
  expect(user.email).toBe("test@example.com");

  const createMany = await prisma.user.createMany({
    data: [{ email: "test2@example.com" }, { email: "test3@example.com" }],
  });
  expect(createMany.count).toBe(2);

  const createManyAndReturn = await prisma.user.createManyAndReturn({
    data: [{ email: "test4@example.com" }, { email: "test5@example.com" }],
  });
  expect(createManyAndReturn).toHaveLength(2);

  const users = await prisma.user.findMany();
  expect(users).toHaveLength(5);

  const count = await prisma.user.count();
  expect(count).toBe(5);
});

test("create + nested", async () => {
  const user = await prisma.user.create({
    data: {
      email: "test34@example.com",
      tasks: {
        create: [{ title: "test1" }, { title: "test2" }],
      },
    },
    include: { tasks: true },
  });
  expect(user.tasks).toHaveLength(2);
});

test("createMany", async () => {
  const createMany = await prisma.user.createMany({
    data: [{ email: "test1@example.com" }, { email: "test2@example.com" }],
  });
  expect(createMany.count).toBe(2);
});

test("createManyAndReturn", async () => {
  const createMany = await prisma.user.createManyAndReturn({
    data: [{ email: "test1@example.com" }, { email: "test2@example.com" }],
  });
  expect(createMany).toHaveLength(2);
});

test("queryRaw", async () => {
  const random = crypto.randomUUID();
  const result = await prisma.$queryRaw`SELECT ${random} AS "value"`;
  expect(result).toEqual([{ value: random }]);
});

test("executeRaw", async () => {
  const r = () => crypto.randomUUID();
  const result =
    await prisma.$executeRaw`INSERT INTO "User" ("id", "email") VALUES
      (${r()}, ${r()}),
      (${r()}, ${r()}),
      (${r()}, ${r()})`;
  expect(result).toBe(3);
});

test("transaction", async () => {
  const r = () => crypto.randomUUID();
  const result = await prisma.$transaction([
    prisma.user.create({ data: { id: r(), email: "test@example.com" } }),
    prisma.user.create({ data: { id: r(), email: "test2@example.com" } }),
  ]);
  expect(result).toHaveLength(2);
});

test("interactive transaction", async () => {
  const r = () => crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { id: r(), email: "test@example.com" } });
    await tx.user.create({ data: { id: r(), email: "test2@example.com" } });
  });
});
