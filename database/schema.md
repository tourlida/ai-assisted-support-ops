# Database Schema

The executable source of truth is [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql), [`migrations/002_add_users.sql`](migrations/002_add_users.sql), [`migrations/003_add_user_name.sql`](migrations/003_add_user_name.sql), [`migrations/004_add_data_import_runs.sql`](migrations/004_add_data_import_runs.sql), and [`migrations/005_add_chunk_embeddings.sql`](migrations/005_add_chunk_embeddings.sql). This document describes the resulting schema.

## Model Overview

Structured CSV records are modeled as five normalized business-data tables: `customers`, `products`, `orders`, `order_items`, and `support_tickets`. Application access is modeled separately by `users`. A `user` is a person authorized to access the SupportOps application; a `customer` is a business entity whose order and support data is managed by the system. They are different concepts and `users` has no foreign key to `customers`. The PDFs have a separate document provenance model: `documents`, `document_pages`, and `document_chunks`. There are deliberately no foreign keys between business-domain tables and documents because the provided PDFs do not identify specific customer, product, order, or ticket IDs.

The migrations create the relational schema, the import-run audit table, and the `pgvector` extension with a chunk-embeddings table. The separate CSV CLI loads the five structured CSV files, and the separate PDF CLI loads documents, pages, chunks, and embeddings.

The `users` table stores only application-generated password hashes, never plaintext passwords. Password hashing and verification, login, inactive-account rejection, and future JWT/session behavior belong to the application layer and are not implemented by these migrations.

Every structured table includes `source_file` and `source_row_number` for CSV-import provenance. The CLI populates these additional audit columns; they are not columns from the CSV files. `source_row_number` includes the header as line 1, so data rows start at 2.

## CSV Import Run Auditing

### `data_import_runs`

Purpose: Audit one explicit batch across the five structured CSV source files.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | No | Primary key. |
| `status` | `text` | No | `running`, `succeeded`, or `failed`; defaults to `running`. |
| `started_at` | `timestamptz` | No | Defaults to `now()`. |
| `finished_at` | `timestamptz` | Yes | Required when status is `succeeded` or `failed`; null while `running`. |
| `file_manifest` | `jsonb` | No | JSON object of source path, SHA-256, and per-file row count. |
| `row_counts` | `jsonb` | No | JSON object of validated records per target table; defaults to `{}`. |
| `warnings` | `jsonb` | No | JSON array of non-blocking data-quality observations; defaults to `[]`. |
| `error_summary` | `text` | Yes | Required only for a failed run; bounded and contains no connection credentials. |

Indexes: primary-key index on `id`; `ix_data_import_runs_started_at` on `started_at DESC`.

There is no foreign key from this audit record to the imported rows. The run is created before batch processing so a validation or database failure can be recorded independently of the business-data transaction. Successful business upserts and the `succeeded` status commit together. Failed business writes roll back, then the run is marked `failed` in a separate statement. A process interruption may leave status `running`.

`npm run ingest:csv -- --check` validates the fixed five-file source set without a database connection and does not create an audit record. A normal invocation requires migration 004 to have been applied first.

## Structured Domain Tables

### `customers`

Purpose: Customer identity and account attributes from `customers.csv`.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `text` | No | Primary key; preserves source customer ID. |
| `name` | `text` | No |  |
| `email` | `text` | No | Unique case-insensitively via `uq_customers_email_lower` on `lower(email)`. |
| `tier` | `text` | No | Check: `gold`, `silver`, or `bronze`. |
| `join_date` | `date` | No |  |
| `source_file` | `text` | No | Must not be blank after trimming. |
| `source_row_number` | `integer` | No | Must be greater than 1. |

Indexes: primary-key index on `id`; unique expression index `uq_customers_email_lower`.

Relationships: one customer can have many orders and support tickets.

### `products`

Purpose: Product catalog records from `products.csv`.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `text` | No | Primary key; preserves source product ID. |
| `name` | `text` | No | Not declared unique; names are not stable identifiers. |
| `category` | `text` | No | Check: `Electronics` or `Accessories`. |
| `price` | `numeric(12,2)` | No | Check: greater than or equal to zero; current catalog price. |
| `stock` | `integer` | No | Check: greater than or equal to zero. |
| `source_file` | `text` | No | Must not be blank after trimming. |
| `source_row_number` | `integer` | No | Must be greater than 1. |

Indexes: primary-key index on `id`.

Relationships: one product can appear in many order items.

### `orders`

Purpose: Order header and delivery dates from `orders.csv`.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `text` | No | Primary key; preserves source order ID. |
| `customer_id` | `text` | No | Foreign key to `customers.id`; delete restricted. |
| `status` | `text` | No | Check: `delivered`, `processing`, `cancelled`, or `shipped`. |
| `total_amount` | `numeric(12,2)` | No | Check: greater than or equal to zero; source header total. |
| `order_date` | `date` | No |  |
| `estimated_delivery` | `date` | Yes | If present, must be on or after `order_date`. |
| `delivered_at` | `date` | Yes | If present, must be on or after `order_date`; source has date precision only. |
| `source_file` | `text` | No | Must not be blank after trimming. |
| `source_row_number` | `integer` | No | Must be greater than 1. |

Unique constraints/indexes: primary key on `id`; unique pair `uq_orders_id_customer` on (`id`, `customer_id`) supports the ticket ownership composite foreign key; `ix_orders_customer_order_date` on (`customer_id`, `order_date DESC`) supports customer order-history queries.

Relationships: each order belongs to one customer and has many order items and support tickets.

### `order_items`

Purpose: Order lines from `order_items.csv`, including the transaction-time unit price.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `text` | No | Primary key; preserves source order-item ID. |
| `order_id` | `text` | No | Foreign key to `orders.id`; delete restricted. |
| `product_id` | `text` | No | Foreign key to `products.id`; delete restricted. |
| `quantity` | `integer` | No | Check: greater than zero. |
| `unit_price` | `numeric(12,2)` | No | Check: greater than or equal to zero; order-line price snapshot. |
| `source_file` | `text` | No | Must not be blank after trimming. |
| `source_row_number` | `integer` | No | Must be greater than 1. |

Indexes: primary-key index on `id`; `ix_order_items_order_id` on `order_id`; `ix_order_items_product_id` on `product_id`.

Relationships: each item belongs to one order and references one product. The (`order_id`, `product_id`) pair is not constrained unique.

### `support_tickets`

Purpose: Support issue records from `support_tickets.csv`.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `text` | No | Primary key; preserves source ticket ID. |
| `customer_id` | `text` | No | Foreign key to `customers.id`; delete restricted. |
| `order_id` | `text` | No | Part of composite foreign key with `customer_id` to `orders(id, customer_id)`; delete restricted. |
| `category` | `text` | No | Check: `late_delivery`, `cancellation`, `product_question`, or `shipping`. |
| `priority` | `text` | No | Check: `high`, `medium`, or `low`. |
| `status` | `text` | No | Check: `open` or `closed`. |
| `summary` | `text` | No |  |
| `created_at` | `date` | No | Source has date precision, not time-of-day. |
| `source_file` | `text` | No | Must not be blank after trimming. |
| `source_row_number` | `integer` | No | Must be greater than 1. |

Indexes: primary-key index on `id`; `ix_support_tickets_customer_created_at` on (`customer_id`, `created_at DESC`); `ix_support_tickets_order_id` on `order_id`.

Relationships: each ticket references one customer and one of that customer's orders. The composite foreign key prevents mismatched customer/order ownership.

## Document and RAG-Preparation Tables

### `documents`

Purpose: Original document identity and provenance for source files such as PDFs.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | No | Primary key. |
| `filename` | `text` | No | Must not be blank after trimming; preserves original filename. |
| `title` | `text` | Yes | Human-readable title when available. |
| `document_type` | `text` | No | Check: `faq`, `refund_policy`, `shipping_policy`, `warranty_policy`, or `other`. |
| `source` | `text` | No | Unique source path/URI; must not be blank after trimming. |
| `checksum` | `text` | Yes | If present, must be 64 lowercase hexadecimal characters (SHA-256). |
| `document_date` | `date` | Yes | Business document date when available. |
| `metadata` | `jsonb` | No | Defaults to `{}`; must be a JSON object. |
| `created_at` | `timestamptz` | No | Defaults to `now()`. |
| `updated_at` | `timestamptz` | No | Defaults to `now()`; application must maintain it on updates. |

Indexes: primary-key index on `id`; unique index on `source`; `ix_documents_type_date` on (`document_type`, `document_date DESC`).

Relationships: one document has many pages. No domain entity relationship is present in this dataset.

### `document_pages`

Purpose: Page-level provenance and storage location for future extracted text.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | No | Primary key. |
| `document_id` | `bigint` | No | Foreign key to `documents.id`; deleting a document cascades to pages. |
| `page_number` | `integer` | No | Check: greater than zero; unique per document. |
| `extracted_text` | `text` | Yes | Reserved for later extraction; not populated in this phase. |
| `metadata` | `jsonb` | No | Defaults to `{}`; must be a JSON object. |

Unique constraints/indexes: `uq_document_pages_document_page` on (`document_id`, `page_number`); `uq_document_pages_id_document` on (`id`, `document_id`) supports the chunk composite foreign key.

Relationships: each page belongs to one document and can have many chunks.

### `document_chunks`

Purpose: Future derived text segments, each traceable to an exact page of its source document.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `bigint GENERATED ALWAYS AS IDENTITY` | No | Primary key. |
| `document_id` | `bigint` | No | Part of composite foreign key to `document_pages(id, document_id)`. |
| `page_id` | `bigint` | No | Part of composite foreign key to `document_pages(id, document_id)`. |
| `chunk_index` | `integer` | No | Check: zero or greater; zero-based within the document. |
| `content` | `text` | No | Must not be blank after trimming. |
| `metadata` | `jsonb` | No | Defaults to `{}`; must be a JSON object. |
| `created_at` | `timestamptz` | No | Defaults to `now()`. |
| `updated_at` | `timestamptz` | No | Defaults to `now()`; application must maintain it on updates. |

Unique constraints/indexes: primary key on `id`; `uq_document_chunks_document_index` on (`document_id`, `chunk_index`); `ix_document_chunks_page_id` on `page_id`. The composite foreign key (`page_id`, `document_id`) references `document_pages(id, document_id)` and cascades deletion from the page. This prevents chunks from associating a page with the wrong document.

Relationships: each chunk belongs to one document and one page of that document. Chunk rows are created by the PDF CLI.

### `document_chunk_embeddings`

Purpose: One embedding per chunk and embedding model. `document_chunks.content` stays the source of truth; embeddings are derived and can be regenerated.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `chunk_id` | `bigint` | No | Part of the primary key; foreign key to `document_chunks.id`, deleting a chunk cascades. |
| `model` | `text` | No | Part of the primary key; embedding model name, must not be blank. |
| `embedding` | `vector(768)` | No | Fixed 768 dimensions, matching `nomic-embed-text`. |
| `created_at` | `timestamptz` | No | Defaults to `now()`. |

Primary key: (`chunk_id`, `model`). No ANN index is defined; at the current data size an exact cosine scan (`<=>`) is used. Add HNSW only if the chunk count grows. A model with a different dimension needs a new column or table.

## Application Authentication Table

### `users`

Purpose: Accounts authorized to access the SupportOps application. This is not imported customer data. `users` and `customers` are separate entities with no foreign key or implied one-to-one relationship.

| Column | PostgreSQL type | Null? | Key / constraint |
| --- | --- | --- | --- |
| `id` | `uuid` | No | Primary key; defaults to PostgreSQL `gen_random_uuid()`. |
| `name` | `text` | No | Trimmed, nonblank application display name. Added by migration 003. |
| `email` | `text` | No | Must be nonblank and already trimmed/lowercase; unique case-insensitively via `uq_users_email_lower` on `lower(email)`. |
| `password_hash` | `text` | No | Must not be blank; holds an application-generated Argon2/bcrypt or equivalent password hash, never plaintext. No password/hash is generated by the migration. |
| `role` | `text` | No | Check: `agent` or `admin`; defaults to least-privileged `agent`. |
| `is_active` | `boolean` | No | Defaults to `true`; later authentication logic must reject inactive accounts. |
| `created_at` | `timestamptz` | No | Defaults to `now()`. |
| `updated_at` | `timestamptz` | No | Defaults to `now()`; application must maintain it on updates. |

Indexes: primary-key index on `id`; unique expression index `uq_users_email_lower` on `lower(email)`.

Constraints: trimmed nonblank name; email canonical-form/nonblank check; nonblank password-hash check; role check restricted to `agent` or `admin`. There is no trigger, seed account, JWT/session field, or relationship to `customers`.

Authentication responsibility: the database stores a password hash supplied by the application. The future Node.js authentication layer will normalize input email, verify submitted passwords using the hash algorithm, and deny inactive users. JWT creation/verification and session secrets are out of scope for this schema migration.

## RAG Readiness and Provenance

The original PDF remains the source of truth. `documents` records its filename, source path, optional SHA-256 checksum, type, business date, and metadata. `document_pages` stores one-based page numbers and has room for future extracted text. `document_chunks` stores derived text with both page and document keys, so retrieved content can be traced to a source page. Embeddings are stored in a separate derived table, so the text is never only held as a vector. Migration 005 enables `pgvector`; the database image must include it (`pgvector/pgvector:pg17`).

## Assumptions, Limitations, and Open Questions

- The provided business IDs are treated as stable natural primary keys and preserved as `text`.
- `delivered_at` and `created_at` source fields contain ISO dates only, so the schema uses `date` rather than inventing a time component.
- The visible “Last updated” line is the PDF business `document_date`; the PDF metadata creation date is tracked as metadata if captured later and is not substituted for the business date.
- CSV categories/statuses use the values currently observed. Adding a new value requires updating the corresponding check constraint.
- The CSV has no currency code. Amounts are stored as decimal values without assuming currency.
- `ORD-1023` source header total differs from the sum of its item rows by 50.00. There is intentionally no cross-row total check.
- `document_chunks` is a schema placeholder for later derived content, not evidence that chunking has occurred.
- `users` are application accounts, while `customers` are imported business records. They are deliberately unlinked absent a concrete requirement.
- User email values must be stored trimmed and lowercase; the application should normalize addresses before writing them.
- `users.password_hash` is only a hash field. Hash generation/verification is deferred to the future application layer.
- The four supplied PDFs do not identify specific CSV entity IDs; no speculative document/entity relationship is defined.
- `updated_at` defaults on insertion; no automatic update trigger is installed.
- Migrations define structure but do not seed content. The five CSVs and the four PDFs are loaded by separate CLIs. Replacing a changed PDF deletes and recreates its document row, so its `documents.id` changes.
