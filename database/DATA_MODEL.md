# Data Model Report

## 1. Summary of Discovered Data

The supplied structured dataset consists of five CSV files containing 43 records across customers (8), products (6), orders (10), order items (14), and support tickets (5). The four PDFs under `datasets/rag_documents/` are one-page FAQ, refund, shipping, and warranty documents. They contain readable text and explicit titles and last-updated dates, but their PDF metadata titles and authors are anonymous.

The CSVs have headers, use ISO `YYYY-MM-DD` date strings, and contain no exact duplicate rows. Every source `id` is non-empty and unique within its file. All candidate customer, order, and product references checked across CSVs resolve. A monetary discrepancy exists in order `ORD-1023`: its header total is 278.99, while its three item rows total 228.99. Both source values must be preserved; the schema does not impose a cross-row sum constraint.

## 2. CSV File Analysis

### `customers.csv` (8 rows)

| Column | Proposed PostgreSQL type | Nullable in source | Notes |
| --- | --- | --- | --- |
| `id` | `text` | No | Eight distinct source identifiers; primary key candidate. |
| `name` | `text` | No | Important customer name. |
| `email` | `text` | No | Eight distinct values; candidate case-insensitive unique key. |
| `tier` | `text` | No | Categorical values: `gold`, `silver`, `bronze`. |
| `join_date` | `date` | No | ISO date; values span 2022-10-09 through 2024-03-04. |

No blank values or exact duplicate rows were found. Names and email addresses appear unique in this sample; only email is constrained unique because display names are not reliable identifiers.

### `products.csv` (6 rows)

| Column | Proposed PostgreSQL type | Nullable in source | Notes |
| --- | --- | --- | --- |
| `id` | `text` | No | Six distinct source identifiers; primary key candidate. |
| `name` | `text` | No | Product name; six distinct values in this sample, but not used as a key. |
| `category` | `text` | No | Categorical values: `Electronics`, `Accessories`. |
| `price` | `numeric(12,2)` | No | Non-negative decimal price. |
| `stock` | `integer` | No | Non-negative whole-unit inventory count. |

No blanks, duplicate rows, negative stock, or repeated product names were found. Product names are not constrained unique because names can change or be reused.

### `orders.csv` (10 rows)

| Column | Proposed PostgreSQL type | Nullable in source | Notes |
| --- | --- | --- | --- |
| `id` | `text` | No | Ten distinct source identifiers; primary key candidate. |
| `customer_id` | `text` | No | Foreign key to `customers.id`; all references resolve. |
| `status` | `text` | No | Values: `delivered`, `processing`, `cancelled`, `shipped`. |
| `total_amount` | `numeric(12,2)` | No | Non-negative order-header amount. |
| `order_date` | `date` | No | ISO date. |
| `estimated_delivery` | `date` | Yes | Blank for one cancelled order. |
| `delivered_at` | `date` | Yes | Blank for four rows; source values have day precision despite the `_at` suffix. |

No exact duplicate rows were found. All customer references resolve. The supplied delivery statuses and dates are retained without lifecycle assumptions beyond non-negative amounts and estimated delivery not preceding the order date.

### `order_items.csv` (14 rows)

| Column | Proposed PostgreSQL type | Nullable in source | Notes |
| --- | --- | --- | --- |
| `id` | `text` | No | Fourteen distinct source identifiers; primary key candidate. |
| `order_id` | `text` | No | Foreign key to `orders.id`; all references resolve. |
| `product_id` | `text` | No | Foreign key to `products.id`; all references resolve. |
| `quantity` | `integer` | No | All current values are 1; require positive quantity without assuming the sample is exhaustive. |
| `unit_price` | `numeric(12,2)` | No | Non-negative price snapshot for this order line. |

No exact duplicate rows or blank values were found. The order/product pair is not declared unique because separate lines may validly represent different price or fulfillment conditions.

### `support_tickets.csv` (5 rows)

| Column | Proposed PostgreSQL type | Nullable in source | Notes |
| --- | --- | --- | --- |
| `id` | `text` | No | Five distinct source identifiers; primary key candidate. |
| `customer_id` | `text` | No | Foreign key to `customers.id`. |
| `order_id` | `text` | No | References an order belonging to the same customer in all five rows. |
| `category` | `text` | No | Values: `late_delivery`, `cancellation`, `product_question`, `shipping`. |
| `priority` | `text` | No | Values: `high`, `medium`, `low`. |
| `status` | `text` | No | Values: `open`, `closed`. |
| `summary` | `text` | No | Free-text ticket summary. |
| `created_at` | `date` | No | ISO date only, not a time-of-day timestamp. |

No exact duplicate rows, blank values, missing references, or customer/order ownership mismatches were found.

## 3. PDF Analysis

All four files under `datasets/rag_documents/` are readable one-page PDFs. Their PDF metadata reports an anonymous title and author, unspecified creator/subject, ReportLab as producer, and metadata creation/modification date 2026-09-28. Titles and business document dates are therefore taken from visible page text, not anonymous PDF title metadata. Each visible page identifies “SupportOps Demo Company” and version 1.0.

| Filename | Type | Visible title | Visible document date | Pages | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `faq.pdf` | FAQ | Support FAQ | 2024-04-08 | 1 | `e5e6f8b95520f061aeda177a5e5d233737628112ae85067de8632ca033ba71d2` |
| `refund-policy.pdf` | Policy | Refund Policy | 2024-05-01 | 1 | `dd261364216a3e741773c809f543f6867621e478858575978827fea940d1f77f` |
| `shipping-policy.pdf` | Policy | Shipping Policy | 2024-05-01 | 1 | `eb98ba0831700bb41c3cdfdaf2e80ddac1e5714048fe9d834f6e60718b9d8e6f` |
| `warranty-policy.pdf` | Policy | Warranty Policy | 2024-04-10 | 1 | `c41e4d63a805db190c152c2f0bc2ef85327d96ef9a7209112fd5a2ca47c955a0` |

The FAQ discusses order status, customer privacy, refunds, and workflow. The refund policy mentions order delivery dates, compensation, approvals, and fraud escalation. The shipping policy explains delivery estimates and tracking. The warranty policy discusses electronics/accessories and warranty claims. These are general policies and contain no supplied customer, product, order, or ticket identifiers. No structured-entity foreign key to a document is justified by the content.

## 4. Identified Entities

- `customers`: customer identity, contact, tier, and join date.
- `products`: catalog product, category, current price, and stock.
- `orders`: customer order header and delivery lifecycle dates.
- `order_items`: products and price/quantity snapshots belonging to an order.
- `support_tickets`: customer support issue, associated customer/order, classification, summary, and creation date.
- `documents`: source PDF file, title/type/date, checksum, and flexible source metadata.
- `document_pages`: page-level source and future extracted text.
- `document_chunks`: future semantic text segments, each linked to a document and its source page.
- `users`: SupportOps application accounts for authenticated access; separate from imported `customers` and not linked to them.

## 5. Identified Relationships

- One customer can have many orders; each order belongs to one customer.
- One order can have many order items; each item references one product.
- One product can appear in many order items.
- A customer can have many support tickets; each ticket references one customer and one order.
- Each ticket's `(order_id, customer_id)` pair is constrained to an order belonging to that customer.
- One document has many pages; one page has many future chunks.
- No relation between the provided PDFs and a particular structured customer, order, product, or ticket is evidenced; document/domain associations are intentionally absent.

## 6. Proposed Schema

The normalized domain tables are `customers`, `products`, `orders`, `order_items`, and `support_tickets`. The document preparation tables are `documents`, `document_pages`, and `document_chunks`. Source IDs remain text primary keys rather than being replaced by generated keys; document/page/chunk records use generated `bigint` keys because no source identifiers exist for those entities.

The later application-authentication migration adds `users` as a separate identity table with a generated UUID key. It is not derived from any CSV and is not related to `customers`; customers are business data, while users are people allowed to access the application.

### Application Authentication: `users`

Migration `002_add_users.sql` adds a standalone application-account relation:

| Column | Type | Null? | Design |
| --- | --- | --- | --- |
| `id` | `uuid` | No | Primary key generated by PostgreSQL `gen_random_uuid()`. |
| `email` | `text` | No | Nonblank, trimmed lowercase canonical form; unique via an index on `lower(email)`. The application should normalize input before insert/login. |
| `password_hash` | `text` | No | Nonblank application-generated Argon2/bcrypt or equivalent hash; no plaintext or migration-generated credentials. |
| `role` | `text` | No | Check constraint allows only `agent` or `admin`; defaults to `agent`. |
| `is_active` | `boolean` | No | Defaults to `true`. |
| `created_at` | `timestamptz` | No | Defaults to `now()`. |
| `updated_at` | `timestamptz` | No | Defaults to `now()`; no trigger is defined. |

`users` is not a customer profile and has no relationship to `customers`. Password hashing/verification, login, inactive-account rejection, and JWT/session handling are future application responsibilities, not database-migration behavior.

Each structured row also carries `source_file` and `source_row_number` provenance fields. These are ingestion-populated audit attributes, not columns present in the CSVs. Document provenance is captured by relative source path, original filename, SHA-256 checksum, document date/type, page number, and JSONB metadata.

## 7. Primary-Key Decisions

The `id` column from each CSV is non-empty and unique in its file, so it is the primary key for its corresponding entity table. Emails are case-insensitively unique in the sample and receive a unique index on `lower(email)`. Product names are not treated as keys. Document pages and chunks use generated integer identifiers and retain their document/page parent keys.

## 8. Foreign-Key Decisions

`orders.customer_id` references `customers.id`; `order_items.order_id` and `order_items.product_id` reference their respective parent tables. Tickets reference both customer and order, with a composite foreign key ensuring that the order belongs to the recorded customer. Pages reference documents. Chunks reference a page/document pair using a composite foreign key, ensuring a chunk cannot claim a page from a different document. Parent deletion cascades only through the document -> page -> chunk preparation tree; domain rows use restrictive/default deletion behavior.

`users` has no foreign keys to the business tables. No source requirement or data establishes that application users correspond to customers.

## 9. Normalization Decisions

Customers, products, orders, order items, and tickets are separate relations following their distinct identities and observed relationships. Order line `unit_price` is retained as a transaction-time snapshot, even though products also have a current catalog `price`. Product category and customer tier remain constrained text rather than lookup tables because the current scope has small categorical domains and no independent category attributes. Ticket categories, priorities, order statuses, and product categories use checks grounded in observed values. New source categories will require a conscious schema migration.

## 10. Document Model Decisions

`documents` stores source identity and metadata. `document_pages` provides a stable page-level provenance record and allows future extracted text. `document_chunks` is reserved for future derived chunks; each chunk links to both its document and source page. No page text extraction or chunking is performed in this phase, so no page/chunk rows are inserted. No embeddings or vector extension/columns are created.

## 11. Metadata Decisions

JSONB object metadata is used only for variable document, page, and chunk attributes that are not stable relational fields. Common queryable facts (filename, source, checksum, document date/type, page number, and chunk index) are typed columns. No JSONB GIN index is added without a known query need. CSV fields remain typed relational columns, not a generic JSON or CSV table.

## 12. Data-Quality Issues

- `ORD-1023` has `total_amount=278.99`, but its item lines sum to 228.99; difference is 50.00. The schema preserves source values and does not add an aggregate check that would reject the observed source record.
- Monetary columns contain decimal values but no currency code. Do not assume a currency from the euro threshold mentioned in a policy document; currency remains unresolved.
- `orders.delivered_at` and `support_tickets.created_at` are named like timestamps but contain dates only, so the initial types use `date` and do not invent time precision.
- The CSV email values use example.com addresses. They are preserved as source data.
- Blank delivery dates are meaningful/expected for some orders and are nullable.
- No exact duplicate CSV rows, missing candidate foreign keys, repeated primary-key candidates, negative stock, or ticket/customer-order mismatches were found.

## 13. Assumptions

- Source IDs are stable identifiers suitable for primary keys and are preserved verbatim.
- The visible “Last updated” date in each PDF is the business `document_date`; PDF filesystem/metadata creation dates are provenance metadata, not policy dates.
- Structured source paths and CSV data-row numbers (header is row 1) will be populated by a future import process.
- Constraint domains represent the currently supplied data and can be expanded through migrations if future source values require them.
- `document_type` distinguishes `faq`, `refund_policy`, `shipping_policy`, `warranty_policy`, and `other`.

## 14. Unresolved Questions

- What currency do order totals, product prices, and unit prices represent? The CSVs have no currency field.
- Are product category and customer tier vocabularies closed, or may additional values appear in future feeds?
- Is source row number sufficient provenance for the eventual CSV import, or will a batch/import-run entity be required?
- Should future document associations be made to products/orders/tickets? The current PDFs do not name specific structured IDs, so none are added now.

## 15. Design Rationale

The schema gives each CSV entity a normal relational table, preserves provided identifiers and transaction snapshots, and uses foreign keys/checks/indexes for observed integrity and likely support lookup paths. Document source data, pages, and future chunks are modeled independently from business entities and remain traceable to the original document and page. This separates original/source content from derived chunks and leaves an embedding layer addable later without redesigning the core relations. The SQL migration is the implementation source of truth; the companion schema and ERD documents describe that migration.

Application identities are kept distinct from the imported customer entity. The `users` table stores an application-generated password hash, a constrained `agent`/`admin` role, an active flag, and timestamps. It stores no plaintext password, JWT, JWT secret, or session secret; password hashing/verification and inactive-account rejection belong to future application code.
