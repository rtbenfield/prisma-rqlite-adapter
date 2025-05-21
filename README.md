# Prisma ORM driver adapter for rqlite

This is an _unofficial_ driver adapter for [Prisma ORM](https://www.prisma.io/orm) that allows you to use [rqlite](https://rqlite.io/) as a database.

## Features

| Feature               | Supported  | Note                                                                                                     |
| --------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| Prisma Client queries | ✅ yes     | Prisma Client queries work, but are not batched into a single rqlite request.                            |
| Migrations            | ⚠️ partial | `prisma db push` and `prisma db pull` work, but other commands are not yet available to driver adapters. |
| Transactions          | ❌ no      | Explicit and implicit transactions are not supported. See the note below.                                |

> [!CAUTION]
> Prisma ORM operations that perform explicit and implicit transactions, including nested creates, updates, and deletes, will be run as individual queries, which breaks the guarantees of the ACID properties of transactions.

> [!NOTE]  
> Prisma ORM multi-query operations including nested creates, updates, and deletes are not batched into a single rqlite request. This results in multiple round trips to the database and, unfortunately, higher latency.

## Setup

Install the package with your preferred package manager:

```sh
npm install @rtbenfield/prisma-rqlite-adapter
```

Enable the `driverAdapters` preview feature in your Prisma schema:

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

Initialize your Prisma Client with the adapter:

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaRqliteAdapterFactory } from "@rtbenfield/prisma-rqlite-adapter";

const prisma = new PrismaClient({
  adapter: new PrismaRqliteAdapterFactory({
    // specify the rqlite database URL here
    connectionString: process.env.RQLITE_URL,

    // *optional* rqlite query options for advanced use cases
    freshness: "1s",
    freshnessStrict: true,
    level: "strong",
    queue: true,
  }),
});
```

Optionally create a `prisma.config.ts` file to configure the adapter for migrations:

```ts
// prisma.config.ts
import type { PrismaConfig } from "prisma";
import { PrismaRqliteAdapterFactory } from "@rtbenfield/prisma-rqlite-adapter";

export default {
  earlyAccess: true,
  schema: "./prisma",

  migrate: {
    async adapter() {
      return new PrismaRqliteAdapterFactory({
        connectionString: process.env.RQLITE_URL,
      });
    },
  },
} satisfies PrismaConfig;
```
