import { parse } from "csv-parse/sync";

export const datasetFiles = [
  "customers.csv",
  "products.csv",
  "orders.csv",
  "order_items.csv",
  "support_tickets.csv",
] as const;

export type DatasetFile = (typeof datasetFiles)[number];

type SourceRow = {
  source_file: string;
  source_row_number: number;
};

export type CustomerRow = SourceRow & {
  id: string;
  name: string;
  email: string;
  tier: "gold" | "silver" | "bronze";
  join_date: string;
};

export type ProductRow = SourceRow & {
  id: string;
  name: string;
  category: "Electronics" | "Accessories";
  price: string;
  stock: number;
};

export type OrderRow = SourceRow & {
  id: string;
  customer_id: string;
  status: "delivered" | "processing" | "cancelled" | "shipped";
  total_amount: string;
  order_date: string;
  estimated_delivery: string | null;
  delivered_at: string | null;
};

export type OrderItemRow = SourceRow & {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
};

export type SupportTicketRow = SourceRow & {
  id: string;
  customer_id: string;
  order_id: string;
  category: "late_delivery" | "cancellation" | "product_question" | "shipping";
  priority: "high" | "medium" | "low";
  status: "open" | "closed";
  summary: string;
  created_at: string;
};

export type ImportBatch = {
  customers: CustomerRow[];
  products: ProductRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  supportTickets: SupportTicketRow[];
  warnings: string[];
};

export type ImportIssue = {
  file: DatasetFile;
  rowNumber?: number;
  field?: string;
  message: string;
};

export class ImportValidationError extends Error {
  constructor(readonly issues: ImportIssue[]) {
    super(issues.map(formatIssue).join("\n"));
    this.name = "ImportValidationError";
  }
}

class InvalidFieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type RawRow = Record<string, string>;
type RowParser<T extends SourceRow> = (row: RawRow, source: SourceRow) => T;
type ParsedRecord = { record: string[]; info: { lines: number } };

const headers: Record<DatasetFile, string[]> = {
  "customers.csv": ["id", "name", "email", "tier", "join_date"],
  "products.csv": ["id", "name", "category", "price", "stock"],
  "orders.csv": [
    "id",
    "customer_id",
    "status",
    "total_amount",
    "order_date",
    "estimated_delivery",
    "delivered_at",
  ],
  "order_items.csv": ["id", "order_id", "product_id", "quantity", "unit_price"],
  "support_tickets.csv": [
    "id",
    "customer_id",
    "order_id",
    "category",
    "priority",
    "status",
    "summary",
    "created_at",
  ],
};

function formatIssue(issue: ImportIssue): string {
  const location =
    issue.rowNumber === undefined
      ? issue.file
      : `${issue.file}:${issue.rowNumber}`;
  return `${location}${issue.field ? ` (${issue.field})` : ""}: ${issue.message}`;
}

function nonblank(row: RawRow, field: string): string {
  const value = row[field];
  if (value === undefined || value.trim() === "") {
    throw new InvalidFieldError(field, "must not be blank");
  }
  return value;
}

function choice<T extends string>(
  row: RawRow,
  field: string,
  choices: readonly T[],
): T {
  const value = nonblank(row, field);
  if (!choices.includes(value as T)) {
    throw new InvalidFieldError(field, `must be one of ${choices.join(", ")}`);
  }
  return value as T;
}

function dateValue(
  row: RawRow,
  field: string,
  nullable = false,
): string | null {
  const value = row[field];
  if (nullable && (value === undefined || value.trim() === "")) return null;
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidFieldError(field, "must be a valid YYYY-MM-DD date");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new InvalidFieldError(field, "must be a valid YYYY-MM-DD date");
  }
  return value;
}

function decimalValue(row: RawRow, field: string): string {
  const value = nonblank(row, field);
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || value.split(".")[0]!.length > 10) {
    throw new InvalidFieldError(
      field,
      "must be a non-negative decimal with at most 2 decimal places",
    );
  }
  return value;
}

function integerValue(row: RawRow, field: string, minimum: number): number {
  const value = nonblank(row, field);
  if (!/^\d+$/.test(value)) {
    throw new InvalidFieldError(
      field,
      `must be a whole number greater than or equal to ${minimum}`,
    );
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > 2_147_483_647
  ) {
    throw new InvalidFieldError(
      field,
      `must be a whole number between ${minimum} and 2147483647`,
    );
  }
  return parsed;
}

function parseFile<T extends SourceRow>(
  file: DatasetFile,
  contents: string,
  parseRow: RowParser<T>,
): T[] {
  let records: ParsedRecord[];
  try {
    records = parse(contents, {
      bom: true,
      info: true,
      relax_column_count: true,
    }) as unknown as ParsedRecord[];
  } catch {
    throw new ImportValidationError([
      { file, message: "contains invalid CSV syntax" },
    ]);
  }

  if (records.length === 0) {
    throw new ImportValidationError([{ file, message: "is empty" }]);
  }

  const actualHeaders = records[0]!.record;
  if (
    actualHeaders.length !== headers[file].length ||
    actualHeaders.some((header, index) => header !== headers[file]![index])
  ) {
    throw new ImportValidationError([
      {
        file,
        rowNumber: 1,
        message: `headers must be ${headers[file].join(",")}`,
      },
    ]);
  }

  const rows: T[] = [];
  const issues: ImportIssue[] = [];
  let previousPhysicalLine = records[0]!.info.lines;

  for (const entry of records.slice(1)) {
    const rowNumber = previousPhysicalLine + 1;
    previousPhysicalLine = entry.info.lines;
    if (entry.record.length !== headers[file].length) {
      issues.push({
        file,
        rowNumber,
        message: `expected ${headers[file].length} columns, found ${entry.record.length}`,
      });
      continue;
    }

    const rawRow = Object.fromEntries(
      headers[file].map((header, index) => [header, entry.record[index]!]),
    ) as RawRow;
    const source = {
      source_file: `datasets/${file}`,
      source_row_number: rowNumber,
    };
    try {
      rows.push(parseRow(rawRow, source));
    } catch (error) {
      if (error instanceof InvalidFieldError) {
        issues.push({
          file,
          rowNumber,
          field: error.field,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }

  if (issues.length > 0) throw new ImportValidationError(issues);
  return rows;
}

function assertUnique<T extends SourceRow>(
  rows: T[],
  file: DatasetFile,
  field = "id",
): void {
  const seen = new Set<string>();
  const issues: ImportIssue[] = [];
  for (const row of rows) {
    const value = String(row[field as keyof T]);
    const comparisonValue = field === "email" ? value.toLowerCase() : value;
    if (seen.has(comparisonValue)) {
      issues.push({
        file,
        rowNumber: row.source_row_number,
        field,
        message: "duplicates a value already present in this file",
      });
    }
    seen.add(comparisonValue);
  }
  if (issues.length > 0) throw new ImportValidationError(issues);
}

function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function formatCents(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function validateRelationships(batch: Omit<ImportBatch, "warnings">): string[] {
  const issues: ImportIssue[] = [];
  const customerIds = new Set(batch.customers.map((row) => row.id));
  const productIds = new Set(batch.products.map((row) => row.id));
  const orders = new Map(batch.orders.map((row) => [row.id, row]));

  for (const order of batch.orders) {
    if (order.estimated_delivery && order.estimated_delivery < order.order_date) {
      issues.push({
        file: "orders.csv",
        rowNumber: order.source_row_number,
        field: "estimated_delivery",
        message: "must be on or after order_date",
      });
    }
    if (order.delivered_at && order.delivered_at < order.order_date) {
      issues.push({
        file: "orders.csv",
        rowNumber: order.source_row_number,
        field: "delivered_at",
        message: "must be on or after order_date",
      });
    }
    if (!customerIds.has(order.customer_id)) {
      issues.push({
        file: "orders.csv",
        rowNumber: order.source_row_number,
        field: "customer_id",
        message: `references missing customer ${order.customer_id}`,
      });
    }
  }
  for (const item of batch.orderItems) {
    if (!orders.has(item.order_id)) {
      issues.push({
        file: "order_items.csv",
        rowNumber: item.source_row_number,
        field: "order_id",
        message: `references missing order ${item.order_id}`,
      });
    }
    if (!productIds.has(item.product_id)) {
      issues.push({
        file: "order_items.csv",
        rowNumber: item.source_row_number,
        field: "product_id",
        message: `references missing product ${item.product_id}`,
      });
    }
  }
  for (const ticket of batch.supportTickets) {
    if (!customerIds.has(ticket.customer_id)) {
      issues.push({
        file: "support_tickets.csv",
        rowNumber: ticket.source_row_number,
        field: "customer_id",
        message: `references missing customer ${ticket.customer_id}`,
      });
    }
    const order = orders.get(ticket.order_id);
    if (!order) {
      issues.push({
        file: "support_tickets.csv",
        rowNumber: ticket.source_row_number,
        field: "order_id",
        message: `references missing order ${ticket.order_id}`,
      });
    } else if (order.customer_id !== ticket.customer_id) {
      issues.push({
        file: "support_tickets.csv",
        rowNumber: ticket.source_row_number,
        field: "customer_id",
        message: `does not own order ${ticket.order_id}`,
      });
    }
  }
  if (issues.length > 0) throw new ImportValidationError(issues);

  const itemTotals = new Map<string, bigint>();
  for (const item of batch.orderItems) {
    itemTotals.set(
      item.order_id,
      (itemTotals.get(item.order_id) ?? 0n) +
        cents(item.unit_price) * BigInt(item.quantity),
    );
  }
  const warnings: string[] = [];
  for (const order of batch.orders) {
    const linesTotal = itemTotals.get(order.id);
    if (linesTotal !== undefined && linesTotal !== cents(order.total_amount)) {
      warnings.push(
        `Order ${order.id} header total ${order.total_amount} differs from item total ${formatCents(linesTotal)}.`,
      );
    }
  }
  return warnings;
}

export function parseImportBatch(
  contents: Readonly<Record<DatasetFile, string>>,
): ImportBatch {
  const parseIssues: ImportIssue[] = [];
  function collectRows<T extends SourceRow>(parseRows: () => T[]): T[] {
    try {
      return parseRows();
    } catch (error) {
      if (error instanceof ImportValidationError) {
        parseIssues.push(...error.issues);
        return [];
      }
      throw error;
    }
  }

  const customers = collectRows(() =>
    parseFile("customers.csv", contents["customers.csv"], (row, source) => ({
      ...source,
      id: nonblank(row, "id"),
      name: nonblank(row, "name"),
      email: nonblank(row, "email"),
      tier: choice(row, "tier", ["gold", "silver", "bronze"]),
      join_date: dateValue(row, "join_date")!,
    })),
  );
  const products = collectRows(() =>
    parseFile("products.csv", contents["products.csv"], (row, source) => ({
      ...source,
      id: nonblank(row, "id"),
      name: nonblank(row, "name"),
      category: choice(row, "category", ["Electronics", "Accessories"]),
      price: decimalValue(row, "price"),
      stock: integerValue(row, "stock", 0),
    })),
  );
  const orders = collectRows(() =>
    parseFile("orders.csv", contents["orders.csv"], (row, source) => ({
      ...source,
      id: nonblank(row, "id"),
      customer_id: nonblank(row, "customer_id"),
      status: choice(row, "status", [
        "delivered",
        "processing",
        "cancelled",
        "shipped",
      ]),
      total_amount: decimalValue(row, "total_amount"),
      order_date: dateValue(row, "order_date")!,
      estimated_delivery: dateValue(row, "estimated_delivery", true),
      delivered_at: dateValue(row, "delivered_at", true),
    })),
  );
  const orderItems = collectRows(() =>
    parseFile(
      "order_items.csv",
      contents["order_items.csv"],
      (row, source) => ({
        ...source,
        id: nonblank(row, "id"),
        order_id: nonblank(row, "order_id"),
        product_id: nonblank(row, "product_id"),
        quantity: integerValue(row, "quantity", 1),
        unit_price: decimalValue(row, "unit_price"),
      }),
    ),
  );
  const supportTickets = collectRows(() =>
    parseFile(
      "support_tickets.csv",
      contents["support_tickets.csv"],
      (row, source) => ({
        ...source,
        id: nonblank(row, "id"),
        customer_id: nonblank(row, "customer_id"),
        order_id: nonblank(row, "order_id"),
        category: choice(row, "category", [
          "late_delivery",
          "cancellation",
          "product_question",
          "shipping",
        ]),
        priority: choice(row, "priority", ["high", "medium", "low"]),
        status: choice(row, "status", ["open", "closed"]),
        summary: nonblank(row, "summary"),
        created_at: dateValue(row, "created_at")!,
      }),
    ),
  );

  if (parseIssues.length > 0) throw new ImportValidationError(parseIssues);

  const uniquenessIssues: ImportIssue[] = [];
  for (const check of [
    () => assertUnique(customers, "customers.csv"),
    () => assertUnique(products, "products.csv"),
    () => assertUnique(orders, "orders.csv"),
    () => assertUnique(orderItems, "order_items.csv"),
    () => assertUnique(supportTickets, "support_tickets.csv"),
    () => assertUnique(customers, "customers.csv", "email"),
  ]) {
    try {
      check();
    } catch (error) {
      if (error instanceof ImportValidationError)
        uniquenessIssues.push(...error.issues);
      else throw error;
    }
  }
  if (uniquenessIssues.length > 0)
    throw new ImportValidationError(uniquenessIssues);

  const batch = { customers, products, orders, orderItems, supportTickets };
  return { ...batch, warnings: validateRelationships(batch) };
}
