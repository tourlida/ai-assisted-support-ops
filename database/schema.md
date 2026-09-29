# Database Schema

The executable source of truth is [`migrations/001_initial_schema.sql`](migrations/001_initial_schema.sql). This document describes that migration as written.

## Model Overview

Structured CSV records are modeled as five normalized domain tables: `customers`, `products`, `orders`, `order_items`, and `support_tickets`. The PDFs have a separate document provenance model: `documents`, `document_pages`, and `document_chunks`. There are deliberately no foreign keys between domain tables and documents because the provided PDFs do not identify specific customer, product, order, or ticket IDs.

The migration creates schema only. It does not load CSV records or PDF rows, extract page text, generate chunks, or create embeddings. It does not install `pgvector`.

Every structured table includes `source_file` and `source_row_number` for future CSV-import provenance. Those are additional audit columns, not columns from the CSV files. `source_row_number` includes the header as line 1, so data rows must be numbered from 2.

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

Relationships: each chunk belongs to one document and one page of that document. No chunk rows are created until a later chunking phase.

## RAG Readiness and Provenance

The original PDF remains the source of truth. `documents` records its filename, source path, optional SHA-256 checksum, type, business date, and metadata. `document_pages` stores one-based page numbers and has room for future extracted text. `document_chunks` stores derived text with both page and document keys, so retrieved content can be traced to a source page. Embeddings can be added later in a separate derived-data relation or a future schema migration, without making embeddings the only copy of the content. This initial migration intentionally contains no pgvector extension or embedding columns.

## Assumptions, Limitations, and Open Questions

- The provided business IDs are treated as stable natural primary keys and preserved as `text`.
- `delivered_at` and `created_at` source fields contain ISO dates only, so the schema uses `date` rather than inventing a time component.
- The visible “Last updated” line is the PDF business `document_date`; the PDF metadata creation date is tracked as metadata if captured later and is not substituted for the business date.
- CSV categories/statuses use the values currently observed. Adding a new value requires updating the corresponding check constraint.
- The CSV has no currency code. Amounts are stored as decimal values without assuming currency.
- `ORD-1023` source header total differs from the sum of its item rows by 50.00. There is intentionally no cross-row total check.
- `document_chunks` is a schema placeholder for later derived content, not evidence that chunking has occurred.
- The four supplied PDFs do not identify specific CSV entity IDs; no speculative document/entity relationship is defined.
- `updated_at` defaults on insertion; no automatic update trigger is installed.
- These tables have no CSV/PDF records seeded by the migration. Ingestion is out of scope for this phase.
