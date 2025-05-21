import type { PrismaConfig } from "prisma";
import { PrismaRqliteAdapter } from "./src/index.js";

export default {
  earlyAccess: true,
  schema: "./prisma",

  migrate: {
    // @ts-expect-error type definitions don't include adapter yet?
    async adapter() {
      return new PrismaRqliteAdapter({
        connectionString: "http://localhost:4001",
      });
    },
  },
} satisfies PrismaConfig;
