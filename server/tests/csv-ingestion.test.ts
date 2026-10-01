import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import {
  datasetFiles,
  ImportValidationError,
  parseImportBatch,
  type DatasetFile,
  type ImportBatch,
} from "../src/ingestion/csv-batch-parser.js";
import {
  commitBatch,
  createAuditRun,
  markRunFailed,
} from "../src/services/csv-import.service.js";

const validFiles: Record<DatasetFile, string> = {
  "customers.csv":
    "id,name,email,tier,join_date\nC-1,Jane Doe,jane@example.com,gold,2024-01-01\n",
  "products.csv":
    "id,name,category,price,stock\nP-1,Phone,Electronics,12.50,4\n",
  "orders.csv":
    "id,customer_id,status,total_amount,order_date,estimated_delivery,delivered_at\nO-1,C-1,delivered,12.50,2024-01-01,,2024-01-02\n",
  "order_items.csv":
    "id,order_id,product_id,quantity,unit_price\nI-1,O-1,P-1,1,12.50\n",
  "support_tickets.csv":
    "id,customer_id,order_id,category,priority,status,summary,created_at\nT-1,C-1,O-1,shipping,low,open,Package delayed,2024-01-03\n",
};

describe("CSV ingestion contract", () => {
  it("parses the five files, preserves source provenance, and accepts nullable dates", () => {
    const batch = parseImportBatch(validFiles);

    expect(batch.customers[0]).toMatchObject({
      source_file: "datasets/customers.csv",
      source_row_number: 2,
    });
    expect(batch.orders[0]?.estimated_delivery).toBeNull();
    expect(batch.orders[0]?.delivered_at).toBe("2024-01-02");
    expect(batch.warnings).toEqual([]);
  });

  it("handles quoted commas and multiline values while keeping physical start-line provenance", () => {
    const contents = {
      ...validFiles,
      "customers.csv":
        'id,name,email,tier,join_date\nC-1,"Jane,\nDoe",jane@example.com,gold,2024-01-01\nC-2,Sam,sam@example.com,silver,2024-01-02\n',
    };

    const batch = parseImportBatch(contents);

    expect(
      batch.customers.map(({ name, source_row_number }) => ({
        name,
        source_row_number,
      })),
    ).toEqual([
      { name: "Jane,\nDoe", source_row_number: 2 },
      { name: "Sam", source_row_number: 4 },
    ]);
  });

  it("rejects a header that differs from the source contract", () => {
    const contents = {
      ...validFiles,
      "products.csv": validFiles["products.csv"].replace("id,name", "name,id"),
    };

    expect(() => parseImportBatch(contents)).toThrow(
      /products\.csv:1: headers must be id,name,category,price,stock/,
    );
  });

  it("collects invalid date and decimal fields with source locations", () => {
    const contents = {
      ...validFiles,
      "customers.csv": validFiles["customers.csv"].replace(
        "2024-01-01",
        "2024-02-30",
      ),
      "products.csv": validFiles["products.csv"].replace("12.50", "1.234"),
    };

    try {
      parseImportBatch(contents);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ImportValidationError);
      expect((error as ImportValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: "customers.csv",
            rowNumber: 2,
            field: "join_date",
          }),
          expect.objectContaining({
            file: "products.csv",
            rowNumber: 2,
            field: "price",
          }),
        ]),
      );
    }
  });

  it("rejects duplicate IDs and unresolved or mismatched foreign keys", () => {
    const duplicate = {
      ...validFiles,
      "products.csv": `${validFiles["products.csv"]}P-1,Tablet,Electronics,8.00,1\n`,
    };
    expect(() => parseImportBatch(duplicate)).toThrow(
      /duplicates a value already present/,
    );

    const mismatched = {
      ...validFiles,
      "support_tickets.csv": validFiles["support_tickets.csv"].replace(
        "T-1,C-1",
        "T-1,C-2",
      ),
    };
    expect(() => parseImportBatch(mismatched)).toThrow(
      /does not own order O-1/,
    );
  });

  it("rejects an estimated delivery date before the order date", () => {
    const contents = {
      ...validFiles,
      "orders.csv": validFiles["orders.csv"].replace(
        "2024-01-01,,2024-01-02",
        "2024-01-01,2023-12-31,2024-01-02",
      ),
    };

    expect(() => parseImportBatch(contents)).toThrow(
      /estimated_delivery.*must be on or after order_date/,
    );
  });

  it("reports header/item total differences without rejecting the batch", () => {
    const contents = {
      ...validFiles,
      "orders.csv": validFiles["orders.csv"].replace("12.50", "15.00"),
    };

    expect(parseImportBatch(contents).warnings).toEqual([
      "Order O-1 header total 15.00 differs from item total 12.50.",
    ]);
  });

  it("rolls back partial writes and retains a sanitized failed audit row", async () => {
    const database = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
    const id = `INGEST-ROLLBACK-${randomUUID()}`;
    const manifest = Object.fromEntries(
      datasetFiles.map((file) => [
        file,
        {
          source_file: `datasets/${file}`,
          sha256: "0".repeat(64),
          row_count: null,
        },
      ]),
    ) as Record<
      DatasetFile,
      { source_file: string; sha256: string; row_count: number | null }
    >;
    const batch: ImportBatch = {
      customers: [
        {
          id,
          name: "Rollback Test",
          email: `${id.toLowerCase()}@example.invalid`,
          tier: "gold",
          join_date: "2024-01-01",
          source_file: "datasets/customers.csv",
          source_row_number: 2,
        },
      ],
      products: [
        {
          id,
          name: "Invalid Test Product",
          category: "Electronics",
          price: "1.00",
          stock: -1,
          source_file: "datasets/products.csv",
          source_row_number: 2,
        },
      ],
      orders: [],
      orderItems: [],
      supportTickets: [],
      warnings: [],
    };
    let runId: string | undefined;

    try {
      runId = await createAuditRun(database, manifest);
      let failure: unknown;
      try {
        await commitBatch(database, runId, manifest, batch);
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeDefined();
      await markRunFailed(database, runId, failure, manifest);

      const [customerResult, auditResult] = await Promise.all([
        database.query("SELECT 1 FROM customers WHERE id = $1", [id]),
        database.query<{ status: string; error_summary: string }>(
          "SELECT status, error_summary FROM data_import_runs WHERE id = $1",
          [runId],
        ),
      ]);
      expect(customerResult.rowCount).toBe(0);
      expect(auditResult.rows[0]).toMatchObject({
        status: "failed",
        error_summary: "Database operation failed (SQLSTATE 23514).",
      });
      expect(auditResult.rows[0]?.error_summary).not.toContain(id);
    } finally {
      if (runId)
        await database.query("DELETE FROM data_import_runs WHERE id = $1", [
          runId,
        ]);
      await database.end();
    }
  });

  it("updates matching IDs and retains rows omitted from a later batch", async () => {
    const database = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
    const id = `INGEST-UPSERT-${randomUUID()}`;
    const runIds: string[] = [];
    const manifest = Object.fromEntries(
      datasetFiles.map((file) => [
        file,
        {
          source_file: `datasets/${file}`,
          sha256: "0".repeat(64),
          row_count: null,
        },
      ]),
    ) as Record<
      DatasetFile,
      { source_file: string; sha256: string; row_count: number | null }
    >;
    const firstCustomer = {
      id,
      name: "Before Reimport",
      email: `${id.toLowerCase()}@example.invalid`,
      tier: "gold" as const,
      join_date: "2024-01-01",
      source_file: "datasets/customers.csv",
      source_row_number: 2,
    };
    const batches: ImportBatch[] = [
      {
        customers: [firstCustomer],
        products: [],
        orders: [],
        orderItems: [],
        supportTickets: [],
        warnings: [],
      },
      {
        customers: [
          { ...firstCustomer, name: "After Reimport", source_row_number: 3 },
        ],
        products: [],
        orders: [],
        orderItems: [],
        supportTickets: [],
        warnings: [],
      },
      {
        customers: [],
        products: [],
        orders: [],
        orderItems: [],
        supportTickets: [],
        warnings: [],
      },
    ];

    try {
      for (const batch of batches) {
        const runId = await createAuditRun(database, manifest);
        runIds.push(runId);
        await commitBatch(database, runId, manifest, batch);
      }

      const result = await database.query<{
        name: string;
        source_row_number: number;
        count: string;
      }>(
        "SELECT name, source_row_number, count(*) OVER ()::text AS count FROM customers WHERE id = $1",
        [id],
      );
      expect(result.rows).toEqual([
        { name: "After Reimport", source_row_number: 3, count: "1" },
      ]);
    } finally {
      if (runIds.length > 0) {
        await database.query(
          "DELETE FROM data_import_runs WHERE id = ANY($1::bigint[])",
          [runIds],
        );
      }
      await database.query("DELETE FROM customers WHERE id = $1", [id]);
      await database.end();
    }
  });
});
