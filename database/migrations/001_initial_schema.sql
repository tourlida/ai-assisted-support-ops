BEGIN;

CREATE TABLE customers (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL,
    tier text NOT NULL CHECK (tier IN ('gold', 'silver', 'bronze')),
    join_date date NOT NULL,
    source_file text NOT NULL CHECK (btrim(source_file) <> ''),
    source_row_number integer NOT NULL CHECK (source_row_number > 1)
);

CREATE UNIQUE INDEX uq_customers_email_lower
    ON customers (lower(email));

CREATE TABLE products (
    id text PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL CHECK (category IN ('Electronics', 'Accessories')),
    price numeric(12, 2) NOT NULL CHECK (price >= 0),
    stock integer NOT NULL CHECK (stock >= 0),
    source_file text NOT NULL CHECK (btrim(source_file) <> ''),
    source_row_number integer NOT NULL CHECK (source_row_number > 1)
);

CREATE TABLE orders (
    id text PRIMARY KEY,
    customer_id text NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('delivered', 'processing', 'cancelled', 'shipped')),
    total_amount numeric(12, 2) NOT NULL CHECK (total_amount >= 0),
    order_date date NOT NULL,
    estimated_delivery date,
    delivered_at date,
    source_file text NOT NULL CHECK (btrim(source_file) <> ''),
    source_row_number integer NOT NULL CHECK (source_row_number > 1),
    CONSTRAINT ck_orders_estimated_delivery_after_order
        CHECK (estimated_delivery IS NULL OR estimated_delivery >= order_date),
    CONSTRAINT ck_orders_delivered_at_after_order
        CHECK (delivered_at IS NULL OR delivered_at >= order_date),
    CONSTRAINT uq_orders_id_customer UNIQUE (id, customer_id)
);

CREATE INDEX ix_orders_customer_order_date
    ON orders (customer_id, order_date DESC);

CREATE TABLE order_items (
    id text PRIMARY KEY,
    order_id text NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    product_id text NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
    source_file text NOT NULL CHECK (btrim(source_file) <> ''),
    source_row_number integer NOT NULL CHECK (source_row_number > 1)
);

CREATE INDEX ix_order_items_order_id ON order_items (order_id);
CREATE INDEX ix_order_items_product_id ON order_items (product_id);

CREATE TABLE support_tickets (
    id text PRIMARY KEY,
    customer_id text NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    order_id text NOT NULL,
    category text NOT NULL CHECK (
        category IN ('late_delivery', 'cancellation', 'product_question', 'shipping')
    ),
    priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    status text NOT NULL CHECK (status IN ('open', 'closed')),
    summary text NOT NULL,
    created_at date NOT NULL,
    source_file text NOT NULL CHECK (btrim(source_file) <> ''),
    source_row_number integer NOT NULL CHECK (source_row_number > 1),
    CONSTRAINT fk_support_tickets_order_customer
        FOREIGN KEY (order_id, customer_id)
        REFERENCES orders (id, customer_id)
        ON DELETE RESTRICT
);

CREATE INDEX ix_support_tickets_customer_created_at
    ON support_tickets (customer_id, created_at DESC);
CREATE INDEX ix_support_tickets_order_id ON support_tickets (order_id);

CREATE TABLE documents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    filename text NOT NULL CHECK (btrim(filename) <> ''),
    title text,
    document_type text NOT NULL CHECK (
        document_type IN ('faq', 'refund_policy', 'shipping_policy', 'warranty_policy', 'other')
    ),
    source text NOT NULL UNIQUE CHECK (btrim(source) <> ''),
    checksum text CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
    document_date date,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_documents_type_date
    ON documents (document_type, document_date DESC);

CREATE TABLE document_pages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    page_number integer NOT NULL CHECK (page_number > 0),
    extracted_text text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT uq_document_pages_document_page UNIQUE (document_id, page_number),
    CONSTRAINT uq_document_pages_id_document UNIQUE (id, document_id)
);

CREATE TABLE document_chunks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL,
    page_id bigint NOT NULL,
    chunk_index integer NOT NULL CHECK (chunk_index >= 0),
    content text NOT NULL CHECK (btrim(content) <> ''),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_document_chunks_document_index UNIQUE (document_id, chunk_index),
    CONSTRAINT fk_document_chunks_page_document
        FOREIGN KEY (page_id, document_id)
        REFERENCES document_pages (id, document_id)
        ON DELETE CASCADE
);

CREATE INDEX ix_document_chunks_page_id ON document_chunks (page_id);

COMMENT ON TABLE customers IS 'Customer records from the structured CSV source.';
COMMENT ON TABLE products IS 'Product catalog records; price is the current catalog price.';
COMMENT ON TABLE orders IS 'Order headers; total_amount preserves the source header value.';
COMMENT ON TABLE order_items IS 'Order lines with a transaction-time unit price snapshot.';
COMMENT ON TABLE support_tickets IS 'Support tickets linked to their owning customer and that customer’s order.';
COMMENT ON TABLE documents IS 'Original document identity and provenance; source content remains independent of derived RAG data.';
COMMENT ON TABLE document_pages IS 'Page-level document provenance and future extracted text.';
COMMENT ON TABLE document_chunks IS 'Future derived text chunks, each constrained to a page of the same source document.';

COMMENT ON COLUMN customers.source_row_number IS 'One-based physical CSV line number, including the header row; data rows start at 2.';
COMMENT ON COLUMN documents.checksum IS 'Optional lowercase SHA-256 hex digest of the original source file.';
COMMENT ON COLUMN document_chunks.chunk_index IS 'Zero-based chunk position within the source document.';

COMMIT;
