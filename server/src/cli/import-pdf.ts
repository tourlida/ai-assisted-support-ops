import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkPdfPages } from "../ingestion/pdf-chunker.js";
import { extractPdfPages } from "../ingestion/pdf-extractor.js";
import type {
  PdfDocumentType,
  PdfSource,
} from "../services/pdf-import.service.js";

type Options =
  | { mode: "import" }
  | { mode: "check" }
  | { mode: "search"; query: string };

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const pdfDirectory = resolve(workspaceRoot, "datasets/rag_documents");
const usage = 'Usage: npm run ingest:pdf [-- --check | --search "question"]';

const documentTypes: Record<string, PdfDocumentType> = {
  faq: "faq",
  "refund-policy": "refund_policy",
  "shipping-policy": "shipping_policy",
  "warranty-policy": "warranty_policy",
};

function parseOptions(args: string[]): Options {
  if (args.length === 0) return { mode: "import" };
  if (args.length === 1 && args[0] === "--check") return { mode: "check" };
  if (args.length === 2 && args[0] === "--search" && args[1]?.trim()) {
    return { mode: "search", query: args[1].trim() };
  }
  throw new Error(usage);
}

async function readSources(): Promise<PdfSource[]> {
  const files = readdirSync(pdfDirectory)
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .sort();
  if (files.length === 0)
    throw new Error("No PDF files found in datasets/rag_documents.");

  const sources: PdfSource[] = [];
  for (const filename of files) {
    const bytes = readFileSync(resolve(pdfDirectory, filename));
    const pages = await extractPdfPages(new Uint8Array(bytes));
    const { title, documentDate, chunks } = chunkPdfPages(pages);
    if (chunks.length === 0)
      throw new Error(`${filename}: no text could be extracted.`);

    sources.push({
      filename,
      source: `datasets/rag_documents/${filename}`,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      documentType: documentTypes[filename.replace(/\.pdf$/i, "")] ?? "other",
      title,
      documentDate,
      pages,
      chunks,
    });
  }
  return sources;
}

async function run(options: Options): Promise<void> {
  if (options.mode === "check") {
    for (const source of await readSources()) {
      console.log(
        `${source.filename}: ${source.pages.length} page(s), ${source.chunks.length} chunk(s)`,
      );
      for (const chunk of source.chunks) {
        console.log(
          `  [${chunk.chunk_index}] ${chunk.heading ?? "(no heading)"} (${chunk.content.length} chars)`,
        );
      }
    }
    console.log("Check-only mode made no database or Ollama calls.");
    return;
  }

  const [{ pool }, { env }, { createOllamaEmbedder }, service] =
    await Promise.all([
      import("../db/pool.js"),
      import("../config/env.js"),
      import("../services/ollama-embedding.client.js"),
      import("../services/pdf-import.service.js"),
    ]);
  const embed = createOllamaEmbedder(env.OLLAMA_BASE_URL, env.EMBEDDING_MODEL);

  try {
    if (options.mode === "search") {
      const [vector] = await embed([options.query], "query");
      if (!vector) throw new Error("No query embedding was returned.");
      const matches = await service.searchChunks(
        vector,
        env.EMBEDDING_MODEL,
        3,
        pool,
      );
      for (const match of matches) {
        console.log(
          `${match.distance.toFixed(4)}  ${match.filename} p.${match.page_number}  ${match.heading ?? ""}`,
        );
        console.log(`  ${match.content.replace(/\n/g, " ")}`);
      }
      if (matches.length === 0)
        console.log("No embedded chunks found. Run npm run ingest:pdf first.");
      return;
    }

    const results = await service.importPdfDocuments(
      await readSources(),
      embed,
      env.EMBEDDING_MODEL,
      pool,
    );
    for (const result of results)
      console.log(
        `${result.status}: ${result.source} (${result.chunks} chunk(s))`,
      );
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
    console.error(
      error instanceof Error
        ? error.message
        : "PDF import failed due to an unexpected error.",
    );
    process.exitCode = 1;
  }
}
