import type { Pool, PoolClient } from "pg";
import { pool as applicationPool } from "../db/pool.js";
import {
  datasetFiles,
  ImportValidationError,
  parseImportBatch,
  type DatasetFile,
  type ImportBatch,
  type ImportIssue,
} from "../ingestion/csv-batch-parser.js";

export type CsvFileManifestEntry = {
  source_file: string;
  sha256: string | null;
  row_count: number | null;
};

export type CsvImportInput = {
  contents: Partial<Record<DatasetFile, string>>;
  manifest: Record<DatasetFile, CsvFileManifestEntry>;
  issues: ImportIssue[];
};

function getRowCounts(batch: ImportBatch): Record<string, number> {
  return {
    customers: batch.customers.length,
    products: batch.products.length,
    orders: batch.orders.length,
    order_items: batch.orderItems.length,
    support_tickets: batch.supportTickets.length,
  };
}

function updateManifestCounts(
  manifest: Record<DatasetFile, CsvFileManifestEntry>,
  batch: ImportBatch,
): void {
  manifest["customers.csv"].row_count = batch.customers.length;
  manifest["products.csv"].row_count = batch.products.length;
  manifest["orders.csv"].row_count = batch.orders.length;
  manifest["order_items.csv"].row_count = batch.orderItems.length;
  manifest["support_tickets.csv"].row_count = batch.supportTickets.length;
}

async function upsertRows<T extends object>(
  client: PoolClient,
  table: string,
  columns: readonly (keyof T & string)[],
  rows: readonly T[],
): Promise<void> {
  const columnSql = columns.map((column) => `"${column}"`).join(", ");
  const parameters = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = columns
    .filter((column) => column !== "id")
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(", ");
  const statement = `INSERT INTO "${table}" (${columnSql}) VALUES (${parameters}) ON CONFLICT ("id") DO UPDATE SET ${updates}`;

  for (const row of rows) {
    await client.query(
      statement,
      columns.map((column) => row[column]),
    );
  }
}

async function writeBatch(
  client: PoolClient,
  batch: ImportBatch,
): Promise<void> {
  await upsertRows(
    client,
    "customers",
    [
      "id",
      "name",
      "email",
      "tier",
      "join_date",
      "source_file",
      "source_row_number",
    ],
    batch.customers,
  );
  await upsertRows(
    client,
    "products",
    [
      "id",
      "name",
      "category",
      "price",
      "stock",
      "source_file",
      "source_row_number",
    ],
    batch.products,
  );
  await upsertRows(
    client,
    "orders",
    [
      "id",
      "customer_id",
      "status",
      "total_amount",
      "order_date",
      "estimated_delivery",
      "delivered_at",
      "source_file",
      "source_row_number",
    ],
    batch.orders,
  );
  await upsertRows(
    client,
    "order_items",
    [
      "id",
      "order_id",
      "product_id",
      "quantity",
      "unit_price",
      "source_file",
      "source_row_number",
    ],
    batch.orderItems,
  );
  await upsertRows(
    client,
    "support_tickets",
    [
      "id",
      "customer_id",
      "order_id",
      "category",
      "priority",
      "status",
      "summary",
      "created_at",
      "source_file",
      "source_row_number",
    ],
    batch.supportTickets,
  );
}

function errorSummary(error: unknown): string {
  if (error instanceof ImportValidationError)
    return error.message.slice(0, 4000);
  if (error instanceof Error && "code" in error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
      ? `Database operation failed (SQLSTATE ${code}).`
      : "Database operation failed.";
  }
  return "Import failed due to an unexpected internal error.";
}

export async function markRunFailed(
  database: Pool,
  runId: string,
  error: unknown,
  manifest: Record<DatasetFile, CsvFileManifestEntry>,
): Promise<void> {
  await database.query(
    `UPDATE data_import_runs
     SET status = 'failed', finished_at = now(), error_summary = $2, file_manifest = $3::jsonb
     WHERE id = $1`,
    [runId, errorSummary(error), JSON.stringify(manifest)],
  );
}

export async function createAuditRun(
  database: Pool,
  manifest: Record<DatasetFile, CsvFileManifestEntry>,
): Promise<string> {
  const result = await database.query<{ id: string }>(
    "INSERT INTO data_import_runs (file_manifest) VALUES ($1::jsonb) RETURNING id::text",
    [JSON.stringify(manifest)],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Could not create import audit record");
  return id;
}

export async function commitBatch(
  database: Pool,
  runId: string,
  manifest: Record<DatasetFile, CsvFileManifestEntry>,
  batch: ImportBatch,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await writeBatch(client, batch);
    await client.query(
      `UPDATE data_import_runs
       SET status = 'succeeded', finished_at = now(), file_manifest = $2::jsonb,
           row_counts = $3::jsonb, warnings = $4::jsonb
       WHERE id = $1`,
      [
        runId,
        JSON.stringify(manifest),
        JSON.stringify(getRowCounts(batch)),
        JSON.stringify(batch.warnings),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function importCsvBatch(
  input: CsvImportInput,
  database: Pool = applicationPool,
): Promise<ImportBatch> {
  let runId: string | undefined;
  try {
    runId = await createAuditRun(database, input.manifest);
    if (input.issues.length > 0) throw new ImportValidationError(input.issues);

    const batch = parseImportBatch(
      input.contents as Record<DatasetFile, string>,
    );
    updateManifestCounts(input.manifest, batch);
    await database.query(
      "UPDATE data_import_runs SET file_manifest = $2::jsonb, row_counts = $3::jsonb WHERE id = $1",
      [
        runId,
        JSON.stringify(input.manifest),
        JSON.stringify(getRowCounts(batch)),
      ],
    );
    await commitBatch(database, runId, input.manifest, batch);
    return batch;
  } catch (error) {
    if (runId) {
      try {
        await markRunFailed(database, runId, error, input.manifest);
      } catch {
        throw new Error(
          `Import run ${runId} failed and its audit status could not be updated.`,
        );
      }
    }
    throw error;
  }
}
