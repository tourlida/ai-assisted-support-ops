import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  datasetFiles,
  ImportValidationError,
  parseImportBatch,
  type DatasetFile,
  type ImportBatch,
  type ImportIssue,
} from "../ingestion/csv-batch-parser.js";
import type {
  CsvFileManifestEntry,
  CsvImportInput,
} from "../services/csv-import.service.js";

type ImportOptions = { checkOnly: boolean };

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const datasetsDirectory = resolve(workspaceRoot, "datasets");

function parseOptions(args: string[]): ImportOptions {
  if (args.length === 0) return { checkOnly: false };
  if (args.length === 1 && args[0] === "--check") return { checkOnly: true };
  throw new Error("Usage: npm run ingest:csv [-- --check]");
}

function readSources(): CsvImportInput {
  const contents: Partial<Record<DatasetFile, string>> = {};
  const manifest = {} as Record<DatasetFile, CsvFileManifestEntry>;
  const issues: ImportIssue[] = [];

  for (const file of datasetFiles) {
    const sourceFile = `datasets/${file}`;
    manifest[file] = { source_file: sourceFile, sha256: null, row_count: null };
    try {
      const bytes = readFileSync(resolve(datasetsDirectory, file));
      manifest[file].sha256 = createHash("sha256").update(bytes).digest("hex");
      try {
        contents[file] = new TextDecoder("utf-8", { fatal: true }).decode(
          bytes,
        );
      } catch {
        issues.push({ file, message: "must be valid UTF-8" });
      }
    } catch {
      issues.push({ file, message: "could not read source file" });
    }
  }
  return { contents, manifest, issues };
}

function printReport(batch: ImportBatch, checkOnly: boolean): void {
  const counts = {
    customers: batch.customers.length,
    products: batch.products.length,
    orders: batch.orders.length,
    order_items: batch.orderItems.length,
    support_tickets: batch.supportTickets.length,
  };
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  console.log(
    `${checkOnly ? "Validation passed" : "Import completed"}: ${total} rows across five CSV files.`,
  );
  for (const [table, count] of Object.entries(counts))
    console.log(`  ${table}: ${count}`);
  for (const warning of batch.warnings) console.warn(`Warning: ${warning}`);
  if (checkOnly) console.log("Check-only mode made no database changes.");
}

function formatError(error: unknown): string {
  if (error instanceof ImportValidationError) return error.message;
  if (error instanceof Error && error.message.startsWith("Usage:"))
    return error.message;
  if (error instanceof Error && "code" in error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
      ? `Database operation failed (SQLSTATE ${code}).`
      : "Database operation failed.";
  }
  return "Import failed due to an unexpected internal error.";
}

async function run(options: ImportOptions): Promise<void> {
  const input = readSources();
  if (options.checkOnly) {
    if (input.issues.length > 0) throw new ImportValidationError(input.issues);
    const batch = parseImportBatch(
      input.contents as Record<DatasetFile, string>,
    );
    printReport(batch, true);
    return;
  }

  const [{ pool }, { importCsvBatch }] = await Promise.all([
    import("../db/pool.js"),
    import("../services/csv-import.service.js"),
  ]);
  try {
    const batch = await importCsvBatch(input, pool);
    printReport(batch, false);
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await run(parseOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}
