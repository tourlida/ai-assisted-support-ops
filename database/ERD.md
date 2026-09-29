# Entity Relationship Diagram

The diagrams separate business-domain data, document/RAG-preparation data, and application authentication. No relationship from `users` to `customers` is represented: application accounts and imported business customers are distinct entities.

### Structured Domain

```mermaid
erDiagram
    customers ||--o{ orders : places
    orders ||--o{ order_items : contains
    products ||--o{ order_items : appears_in
    customers ||--o{ support_tickets : opens
    orders ||--o{ support_tickets : "order_id + customer_id composite FK"

    customers {
        text id PK
        text name
        text email UK
        text tier
        date join_date
        text source_file
        integer source_row_number
    }
    products {
        text id PK
        text name
        text category
        numeric price
        integer stock
        text source_file
        integer source_row_number
    }
    orders {
        text id PK
        text customer_id FK
        text status
        numeric total_amount
        date order_date
        date estimated_delivery
        date delivered_at
        text source_file
        integer source_row_number
    }
    order_items {
        text id PK
        text order_id FK
        text product_id FK
        integer quantity
        numeric unit_price
        text source_file
        integer source_row_number
    }
    support_tickets {
        text id PK
        text customer_id FK
        text order_id FK
        text category
        text priority
        text status
        text summary
        date created_at
        text source_file
        integer source_row_number
    }
```

### Document and RAG Preparation

```mermaid
erDiagram
    documents ||--o{ document_pages : has
    document_pages ||--o{ document_chunks : contains

    documents {
        bigint id PK
        text filename
        text title
        text document_type
        text source UK
        text checksum
        date document_date
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }
    document_pages {
        bigint id PK
        bigint document_id FK
        integer page_number
        text extracted_text
        jsonb metadata
    }
    document_chunks {
        bigint id PK
        bigint document_id FK
        bigint page_id FK
        integer chunk_index
        text content
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }
```

### Application Authentication

```mermaid
erDiagram
    users {
        uuid id PK
        text name
        text email UK
        text password_hash
        text role
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
```

Notes:

- `ORDERS` has a unique (`id`, `customer_id`) key so `SUPPORT_TICKETS` can enforce that the ticket's order belongs to its customer.
- `document_chunks` references (`page_id`, `document_id`) together, ensuring a chunk's page belongs to the same document.
- `document_pages` is optional when a document is first recorded; the schema permits document metadata to be created before page inventory is available.
- `customers.email` is unique case-insensitively through an expression index on `lower(email)`.
- The domain and document diagrams are separate because no CSV-to-PDF entity relationship is supported by the source content.
- `users` is an application-authentication entity, not a customer record; it has no relationship to `customers`.
- `users.email` is stored trimmed and lowercase and is also protected by a case-insensitive unique expression index.
