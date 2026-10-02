import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { chunkPdfPages } from "../src/ingestion/pdf-chunker.js";
import {
  EMBEDDING_DIMENSIONS,
  type EmbedTexts,
} from "../src/services/ollama-embedding.client.js";
import {
  importPdfDocuments,
  searchChunks,
  type PdfSource,
} from "../src/services/pdf-import.service.js";

const model = "test-embedding-model";

function unitVector(index: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[index] = 1;
  return vector;
}

// Chunks mentioning "alpha" map to dimension 0, everything else to dimension 1.
const keywordEmbedder: EmbedTexts = async (texts) =>
  texts.map((text) => unitVector(text.includes("alpha") ? 0 : 1));

function buildSource(source: string, body: string): PdfSource {
  const pages = [
    `Test Policy\nDemo • Last updated 2024-01-02\n1. Alpha\n${body}\n2. Beta\nBeta content stays here.`,
  ];
  const { title, documentDate, chunks } = chunkPdfPages(pages);
  return {
    filename: source.split("/").pop() ?? source,
    source,
    checksum: createHash("sha256").update(body).digest("hex"),
    documentType: "other",
    title,
    documentDate,
    pages,
    chunks,
  };
}

describe("PDF chunker", () => {
  it("splits on headings, prefixes the title, and reads the document date", () => {
    const result = chunkPdfPages([
      "Refund Policy\nDemo Co • Version 1.0 • Last updated 2024-05-01\n1. Eligibility\nOrders can be refunded within 30 days\nof delivery.\n2. Approval\nLarge refunds need approval.",
    ]);

    expect(result.title).toBe("Refund Policy");
    expect(result.documentDate).toBe("2024-05-01");
    expect(result.chunks).toEqual([
      {
        page_number: 1,
        chunk_index: 0,
        heading: "1. Eligibility",
        content:
          "Refund Policy - 1. Eligibility\nOrders can be refunded within 30 days of delivery.",
      },
      {
        page_number: 1,
        chunk_index: 1,
        heading: "2. Approval",
        content: "Refund Policy - 2. Approval\nLarge refunds need approval.",
      },
    ]);
  });

  it("splits an oversized section at sentence boundaries and numbers chunks across pages", () => {
    const sentence =
      "This sentence is padded to make the section long enough to split.";
    const longBody = Array.from({ length: 30 }, () => sentence).join(" ");
    const result = chunkPdfPages([
      "Guide\nOverview\n" + longBody,
      "Next\nSecond page text.",
    ]);

    expect(result.chunks.length).toBeGreaterThan(2);
    expect(result.chunks.every((chunk) => chunk.content.length <= 1100)).toBe(
      true,
    );
    expect(result.chunks.map((chunk) => chunk.chunk_index)).toEqual(
      result.chunks.map((_, index) => index),
    );
    expect(result.chunks.at(-1)?.page_number).toBe(2);
  });
});

describe("PDF import service", () => {
  it("imports, skips an unchanged file, and replaces a changed file without orphans", async () => {
    const database = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
    const source = `datasets/rag_documents/test-${randomUUID()}.pdf`;

    try {
      const first = await importPdfDocuments(
        [buildSource(source, "Original alpha text.")],
        keywordEmbedder,
        model,
        database,
      );
      expect(first).toEqual([{ source, status: "imported", chunks: 2 }]);

      const second = await importPdfDocuments(
        [buildSource(source, "Original alpha text.")],
        keywordEmbedder,
        model,
        database,
      );
      expect(second[0]?.status).toBe("skipped");

      const third = await importPdfDocuments(
        [buildSource(source, "Changed alpha text.")],
        keywordEmbedder,
        model,
        database,
      );
      expect(third[0]?.status).toBe("replaced");

      const counts = await database.query<{
        documents: string;
        chunks: string;
        embeddings: string;
      }>(
        `SELECT (SELECT count(*) FROM documents WHERE source = $1)::text AS documents,
                (SELECT count(*) FROM document_chunks c JOIN documents d ON d.id = c.document_id WHERE d.source = $1)::text AS chunks,
                (SELECT count(*) FROM document_chunk_embeddings e JOIN document_chunks c ON c.id = e.chunk_id
                   JOIN documents d ON d.id = c.document_id WHERE d.source = $1)::text AS embeddings`,
        [source],
      );
      expect(counts.rows[0]).toEqual({
        documents: "1",
        chunks: "2",
        embeddings: "2",
      });
    } finally {
      await database.query("DELETE FROM documents WHERE source = $1", [source]);
      await database.end();
    }
  });

  it("rolls back the whole document when an embedding is missing", async () => {
    const database = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
    const source = `datasets/rag_documents/test-${randomUUID()}.pdf`;
    const shortEmbedder: EmbedTexts = async (texts) =>
      texts.slice(1).map(() => unitVector(0));

    try {
      await expect(
        importPdfDocuments(
          [buildSource(source, "Alpha text.")],
          shortEmbedder,
          model,
          database,
        ),
      ).rejects.toThrow();

      const remaining = await database.query(
        "SELECT 1 FROM documents WHERE source = $1",
        [source],
      );
      expect(remaining.rowCount).toBe(0);
    } finally {
      await database.query("DELETE FROM documents WHERE source = $1", [source]);
      await database.end();
    }
  });

  it("returns the nearest chunk first with its document and page", async () => {
    const database = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
    const source = `datasets/rag_documents/test-${randomUUID()}.pdf`;

    try {
      await importPdfDocuments(
        [buildSource(source, "The alpha content lives here.")],
        keywordEmbedder,
        model,
        database,
      );

      const matches = await searchChunks(unitVector(0), model, 2, database);

      expect(matches).toHaveLength(2);
      expect(matches[0]).toMatchObject({ page_number: 1, heading: "1. Alpha" });
      expect(matches[0]?.distance).toBeLessThan(matches[1]?.distance ?? 0);
    } finally {
      await database.query("DELETE FROM documents WHERE source = $1", [source]);
      await database.end();
    }
  });
});
