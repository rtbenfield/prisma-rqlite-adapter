import { beforeEach, expect, test } from "vitest";
import { DataTypesEnum } from "./generated/prisma/client.js";
import { prisma, setup } from "./setup.js";

beforeEach(async () => {
  await setup();
});

test("data types", async () => {
  const created = await prisma.dataTypes.create({
    data: {
      id: "cb8129ec-dc75-435e-be76-703ecee488f4",
      int: 1,
      bigInt: 1,
      float: 1.1,
      decimal: 1.1,
      string: "string",
      enumField: DataTypesEnum.ONE,
      bytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
      dateTime: new Date(1900, 0, 1),
      boolean: true,
      json: { a: 1 },
    },
  });

  const found = await prisma.dataTypes.findUnique({
    where: { id: created.id },
  });

  expect(found).toEqual(created);
  expect(found).toMatchInlineSnapshot(`
    {
      "bigInt": 1n,
      "boolean": true,
      "bytes": Uint8Array [
        255,
        255,
        255,
        255,
      ],
      "dateTime": 1900-01-01T05:00:00.000Z,
      "decimal": "1.1",
      "enumField": "ONE",
      "float": 1.1,
      "id": "cb8129ec-dc75-435e-be76-703ecee488f4",
      "int": 1,
      "json": {
        "a": 1,
      },
      "string": "string",
    }
  `);
});
