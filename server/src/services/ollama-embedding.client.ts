export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingKind = "document" | "query";
export type EmbedTexts = (
  texts: string[],
  kind: EmbeddingKind,
) => Promise<number[][]>;

// nomic-embed-text expects a task prefix on both documents and queries.
function withTaskPrefix(
  model: string,
  kind: EmbeddingKind,
  text: string,
): string {
  if (!model.startsWith("nomic-embed-text")) return text;
  return `${kind === "document" ? "search_document" : "search_query"}: ${text}`;
}

export function createOllamaEmbedder(
  baseUrl: string,
  model: string,
): EmbedTexts {
  return async (texts, kind) => {
    if (texts.length === 0) return [];

    let response: Response;
    try {
      response = await fetch(new URL("/api/embed", baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: texts.map((text) => withTaskPrefix(model, kind, text)),
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new Error(
        "Could not reach Ollama; check that it is running and the model is pulled.",
      );
    }
    if (!response.ok) {
      throw new Error(
        `Ollama embedding request failed with HTTP ${response.status}.`,
      );
    }

    const body = (await response.json()) as { embeddings?: unknown };
    const embeddings = body.embeddings;
    if (
      !Array.isArray(embeddings) ||
      embeddings.length !== texts.length ||
      !embeddings.every(
        (vector) =>
          Array.isArray(vector) && vector.length === EMBEDDING_DIMENSIONS,
      )
    ) {
      throw new Error(
        `Ollama returned embeddings that do not match ${EMBEDDING_DIMENSIONS} dimensions.`,
      );
    }
    return embeddings as number[][];
  };
}
