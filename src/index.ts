import {
  ColumnTypeEnum,
  DriverAdapterError,
  type ArgType,
  type ColumnType,
  type ConnectionInfo,
  type IsolationLevel,
  type SqlDriverAdapter,
  type SqlDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
  type Transaction,
  type TransactionOptions,
} from "@prisma/driver-adapter-utils";

/** Standard request headers for rqlite HTTP requests. */
const requestHeaders = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "@rtbenfield/prisma-rqlite-adapter",
});

export interface PrismaRqliteAdapterConfig {
  /**
   * The URL of the rqlite server.
   */
  connectionString: string | URL;

  /**
   * Optional. Specifies the `freshness` parameter to include on rqlite requests.
   * @see {@link https://rqlite.io/docs/api/read-consistency/#limiting-read-staleness | rqlite docs}
   */
  freshness?:
    | `${number}ns`
    | `${number}us`
    | `${number}ms`
    | `${number}s`
    | `${number}m`
    | `${number}h`;

  /**
   * Optional. Specifies the `freshness_strict` parameter to include on rqlite requests.
   * @see {@link https://rqlite.io/docs/api/read-consistency/#limiting-read-staleness | rqlite docs}
   */
  freshnessStrict?: boolean;

  /**
   * Optional. Specifies the `level` parameter to include on rqlite requests.
   * @see {@link https://rqlite.io/docs/api/read-consistency/ | rqlite docs}
   */
  level?: "weak" | "linearizable" | "strong" | "none" | "auto";

  /**
   * Optional. Specifies the `queue` parameter to include on rqlite requests.
   * @see {@link https://rqlite.io/docs/api/queued-writes/ | rqlite docs}
   */
  queue?: boolean;
}

/**
 * Prisma ORM driver adapter for rqlite.
 *
 * @example
 * ```ts
 * const prisma = new PrismaClient({
 *   adapter: new PrismaRqliteAdapter({
 *     connectionString: "http://localhost:4001",
 *   }),
 * });
 * ```
 */
export class PrismaRqliteAdapter implements SqlDriverAdapterFactory {
  readonly #config: PrismaRqliteAdapterConfig;

  readonly adapterName = "@rtbenfield/prisma-rqlite-adapter";
  readonly provider = "sqlite";

  constructor(config: PrismaRqliteAdapterConfig) {
    this.#config = config;
  }

  connect(): Promise<SqlDriverAdapter> {
    return Promise.resolve(new PrismaRqliteConnection(this.#config));
  }
}

class PrismaRqliteConnection implements SqlDriverAdapter {
  readonly #config: PrismaRqliteAdapterConfig;
  readonly #schemaName = crypto.randomUUID().slice(0, 8);

  readonly adapterName = "@rtbenfield/prisma-rqlite-adapter";
  readonly provider = "sqlite";

  constructor(config: PrismaRqliteAdapterConfig) {
    this.#config = config;
  }

  dispose(): Promise<void> {
    // nothing to dispose of
    return Promise.resolve();
  }

  getConnectionInfo(): ConnectionInfo {
    // TODO: maxBindValues is the SQLite default. Is it correct for rqlite?
    // schemaName is made up to replace in the SQL to workaround an rqlite bug
    return { maxBindValues: 999, schemaName: this.#schemaName };
  }

  async executeRaw(params: SqlQuery): Promise<number> {
    const { sql, args, argTypes } = params;

    const rewritten = this.#rewriteSql(sql);
    const convertedArgs = convertArgs(args, argTypes);

    const url = this.#getUrl(`/db/execute`);
    const response = await fetch(url.href, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify([[rewritten, ...convertedArgs]]),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, text: ${text}`);
    }

    const data: RqliteResponse = await response.json();
    const result = data.results.at(0);
    if (!result) {
      throw new Error("rqlite returned no results");
    } else if ("error" in result) {
      throw new DriverAdapterError({
        kind: "sqlite",
        extendedCode: 1,
        message: result.error,
      });
    } else if ("rows_affected" in result) {
      // this is the happy path
      return result.rows_affected;
    } else if (Object.keys(result).length === 0) {
      // empty result object happens when DDL commands are run
      return 0;
    } else {
      throw new Error(`unexpected rqlite response structure`);
    }
  }

  async executeScript(_script: string): Promise<void> {
    throw new Error(`executeScript not implemented`);
  }

  async queryRaw(params: SqlQuery): Promise<SqlResultSet> {
    const { sql, args, argTypes } = params;

    const rewritten = this.#rewriteSql(sql);
    const convertedArgs = convertArgs(args, argTypes);

    const url = this.#getUrl(`/db/request`);
    const response = await fetch(url.href, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify([[rewritten, ...convertedArgs]]),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, text: ${text}`);
    }

    const data: RqliteResponse = await response.json();
    const result = data.results.at(0);
    if (!result) {
      throw new Error("rqlite returned no results");
    } else if ("error" in result) {
      throw new DriverAdapterError({
        kind: "sqlite",
        extendedCode: 1,
        message: result.error,
      });
    } else if ("columns" in result) {
      // this is the happy path
      const columnTypes = result.types.map(mapColumnType);
      return {
        columnNames: result.columns,
        columnTypes,
        rows: (result.values ?? []).map((r) => mapRow(r, columnTypes)),
      };
    } else {
      throw new Error(`unexpected rqlite response structure`);
    }
  }

  startTransaction(_isolationLevel?: IsolationLevel): Promise<Transaction> {
    return Promise.resolve(new PrismaRqliteTransaction(this));
  }

  #getUrl(path: string): URL {
    const url = new URL(path, this.#config.connectionString);
    if (typeof this.#config.freshness === "string") {
      url.searchParams.set("freshness", this.#config.freshness);
    }
    if (this.#config.freshnessStrict === true) {
      url.searchParams.set("freshness_strict", "y");
    }
    if (typeof this.#config.level === "string") {
      url.searchParams.set("level", this.#config.level);
    }
    if (this.#config.queue === true) {
      url.searchParams.set("queue", "y");
    }
    return url;
  }

  #rewriteSql(sql: string): string {
    // TODO: file bugs with rqlite's SQL parser for this case
    // 1. backticks break RETURNING keyword detection
    // 2. schema name breaks RETURNING keyword detection
    return sql.replaceAll("`", `"`).replaceAll(`"${this.#schemaName}".`, "");
  }
}

class PrismaRqliteTransaction implements Transaction {
  readonly #adapter: PrismaRqliteConnection;

  readonly adapterName = "@rtbenfield/prisma-rqlite-adapter";
  readonly provider = "sqlite";

  constructor(adapter: PrismaRqliteConnection) {
    this.#adapter = adapter;
    console.warn(
      "The Prisma ORM rqlite adapter does not support transactions yet. Implicit & explicit transactions will be ignored and run as individual queries, which breaks the guarantees of the ACID properties of transactions.",
    );
  }

  get options(): TransactionOptions {
    return { usePhantomQuery: true };
  }

  commit(): Promise<void> {
    // transactions are not supported
    return Promise.resolve();
  }

  executeRaw(params: SqlQuery): Promise<number> {
    return this.#adapter.executeRaw(params);
  }

  queryRaw(params: SqlQuery): Promise<SqlResultSet> {
    return this.#adapter.queryRaw(params);
  }

  rollback(): Promise<void> {
    // transactions are not supported
    return Promise.resolve();
  }
}

interface RqliteResponse {
  results: Array<
    | {
        columns: Array<string>;
        rows: Array<Record<string, unknown>>;
        types: Array<string>;
        values?: Array<Array<unknown>>;
      }
    | {
        last_insert_id: number;
        rows_affected: number;
      }
    | {
        error: string;
      }
    | {}
  >;
  time: number;
}

/**
 * Transforms Prisma ORM query parameters to rqlite parameter values.
 *
 * @param args - The Prisma ORM argument values to convert.
 * @param argTypes - The Prisma ORM argument types.
 * @returns The equivalent rqlite parameter values.
 */
function convertArgs(
  args: Array<unknown>,
  argTypes: Array<ArgType>,
): Array<unknown> {
  return args.map((arg, index) => {
    switch (argTypes[index]) {
      case "Bytes":
        // convert Uint8Array to hex string and prefix with "x"
        // don't use Buffer.from for broader runtime compatibility
        const hex = Array.from(arg as Uint8Array)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        return `x'${hex}'`;
      default:
        return arg;
    }
  });
}

/**
 * Maps a rqlite column type to a Prisma ORM column type.
 *
 * @param type - The rqlite column type string.
 * @returns The Prisma column type enum value.
 */
function mapColumnType(type: string): ColumnType {
  switch (type) {
    // PRAGMA table_info and index_list return empty strings for some types
    // TODO: raise this as an issue with rqlite
    case "":
      return ColumnTypeEnum.Text;
    case "bigint":
      return ColumnTypeEnum.Int64;
    case "blob":
      return ColumnTypeEnum.Bytes;
    case "boolean":
      return ColumnTypeEnum.Boolean;
    case "datetime":
      return ColumnTypeEnum.DateTime;
    case "decimal":
      return ColumnTypeEnum.Numeric;
    case "integer":
      return ColumnTypeEnum.Int32;
    case "jsonb":
      return ColumnTypeEnum.Json;
    case "numeric":
      return ColumnTypeEnum.Numeric;
    case "real":
      return ColumnTypeEnum.Float;
    case "text":
      return ColumnTypeEnum.Text;
    default:
      throw new Error(`unmapped rqlite column type: ${type}`);
  }
}

/**
 * Applies transformations to a row of data returned by rqlite to prepare it for
 * consumption by Prisma ORM.
 *
 * @param row - A single row of data returned by rqlite.
 * @param columnTypes - The types of the columns in the row data.
 * @returns The transformed row for Prisma ORM to consume.
 */
function mapRow(
  row: Array<unknown>,
  columnTypes: Array<ColumnType>,
): Array<unknown> {
  for (let i = 0; i < row.length; i++) {
    const value = row[i];
    const columnType = columnTypes[i];
    switch (columnType) {
      case ColumnTypeEnum.Bytes: {
        // rqlite returns bytes as base64
        // don't use Buffer for broader runtime compatibility
        if (typeof value === "string") {
          row[i] = Array.from(atob(value)).map((c) => c.charCodeAt(0));
        } else if (Array.isArray(value)) {
          // rqlite may return bytes as an array of numbers
          // no conversion is necessary in this case
        } else {
          throw new Error(`unexpected type for blob column at position ${i}`);
        }
        break;
      }
      case ColumnTypeEnum.Numeric: {
        if (typeof value === "string") {
          // DATETIME is returned as type=numeric but the value is a string
          // if we see this in the results, mutate the column type to DateTime
          // TODO: raise this as an issue with rqlite
          columnTypes[i] = ColumnTypeEnum.DateTime;
        }
        break;
      }
      default:
        break;
    }
  }
  return row;
}
