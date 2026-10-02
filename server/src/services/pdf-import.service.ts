import type { Pool } from "pg";
import { pool as applicationPool } from "../db/pool.js";
import type { PdfChunk } from "../ingestion/pdf-chunker.js";
import type { EmbedTexts } from "./ollama-embedding.client.js";

export type PdfDocumentType =
  | "faq"
  | "refund_policy"
  | "shipping_policy"
  | "warranty_policy"
  | "other";

export type PdfSource = {
  filename: string;
  source: string;
  checksum: string;
  documentType: PdfDocumentType;
  title: string | null;
  documentDate: string | null;
  pages: string[];
  chunks: PdfChunk[];
};

export type PdfImportResult = {
  source: string;
  status: "imported" | "replaced" | "skipped";
  chunks: number;
};

export type ChunkMatch = {
  filename: string;
  page_number: number;
  heading: string | null;
  content: string;
  distance: number;
};

const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

async function importPdfDocument(
  database: Pool,
  document: PdfSource,
  vectors: number[][],
  model: string,
  replacing: boolean,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    // Pages, chunks and embeddings are removed through ON DELETE CASCADE.
    if (replacing)
      await client.query("DELETE FROM documents WHERE source = $1", [
        document.source,
      ]);

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO documents (filename, title, document_type, source, checksum, document_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id::text`,
      [
        document.filename,
        document.title,
        document.documentType,
        document.source,
        document.checksum,
        document.documentDate,
      ],
    );
    const documentId = inserted.rows[0]?.id;
    if (!documentId) throw new Error("Could not create document record");

    const pageIds = new Map<number, string>();
    for (const [index, text] of document.pages.entries()) {
      const page = await client.query<{ id: string }>(
        `INSERT INTO document_pages (document_id, page_number, extracted_text)
         VALUES ($1, $2, $3) RETURNING id::text`,
        [documentId, index + 1, text],
      );
      const pageId = page.rows[0]?.id;
      if (!pageId) throw new Error("Could not create page record");
      pageIds.set(index + 1, pageId);
    }

    for (const [index, chunk] of document.chunks.entries()) {
      const pageId = pageIds.get(chunk.page_number);
      const vector = vectors[index];
      if (!pageId || !vector)
        throw new Error("Chunk is missing its page or embedding");

      const row = await client.query<{ id: string }>(
        `INSERT INTO document_chunks (document_id, page_id, chunk_index, content, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id::text`,
        [
          documentId,
          pageId,
          chunk.chunk_index,
          chunk.content,
          JSON.stringify({ heading: chunk.heading }),
        ],
      );
      await client.query(
        `INSERT INTO document_chunk_embeddings (chunk_id, model, embedding)
         VALUES ($1, $2, $3::vector)`,
        [row.rows[0]?.id, model, toVectorLiteral(vector)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function importPdfDocuments(
  documents: readonly PdfSource[],
  embed: EmbedTexts,
  model: string,
  database: Pool = applicationPool,
): Promise<PdfImportResult[]> {
  const results: PdfImportResult[] = [];

  for (const document of documents) {
    const existing = await database.query<{
      checksum: string | null;
      embedded: string;
    }>(
      `SELECT d.checksum,
              (SELECT count(*) FROM document_chunk_embeddings e
                 JOIN document_chunks c ON c.id = e.chunk_id
                WHERE c.document_id = d.id AND e.model = $2)::text AS embedded
         FROM documents d WHERE d.source = $1`,
      [document.source, model],
    );
    const current = existing.rows[0];

    if (
      current?.checksum === document.checksum &&
      Number(current.embedded) > 0
    ) {
      results.push({
        source: document.source,
        status: "skipped",
        chunks: Number(current.embedded),
      });
      continue;
    }

    const vectors = await embed(
      document.chunks.map((chunk) => chunk.content),
      "document",
    );
    await importPdfDocument(
      database,
      document,
      vectors,
      model,
      current !== undefined,
    );
    results.push({
      source: document.source,
      status: current ? "replaced" : "imported",
      chunks: document.chunks.length,
    });
  }
  return results;
}

export async function searchChunks(
  queryVector: number[],
  model: string,
  limit = 3,
  database: Pool = applicationPool,
): Promise<ChunkMatch[]> {
  const result = await database.query<ChunkMatch>(
    `SELECT d.filename,
            p.page_number,
            c.metadata->>'heading' AS heading,
            c.content,
            (e.embedding <=> $1::vector)::float8 AS distance
       FROM document_chunk_embeddings e
       JOIN document_chunks c ON c.id = e.chunk_id
       JOIN document_pages p ON p.id = c.page_id
       JOIN documents d ON d.id = c.document_id
      WHERE e.model = $2
      ORDER BY e.embedding <=> $1::vector
      LIMIT $3`,
    [toVectorLiteral(queryVector), model, limit],
  );
  return result.rows;
}
