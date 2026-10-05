import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ollama } from "ollama";
import { Agent } from "undici";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const model = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2:1b";
const prompt = process.argv.slice(2).join(" ").trim();
const requestTimeoutMs = 20 * 60_000;
const dispatcher = new Agent({
  headersTimeout: requestTimeoutMs,
  bodyTimeout: requestTimeoutMs,
});
const client = new Ollama({
  host: baseUrl,
  fetch: (input, init) => {
    const requestOptions = {
      ...init,
      dispatcher,
      signal: AbortSignal.timeout(requestTimeoutMs),
    };
    return fetch(input, requestOptions);
  },
});

async function run(): Promise<void> {
  if (!prompt) {
    throw new Error('Usage: npm run sample:chat -- "your prompt"');
  }

  process.stdout.write(`Loading ${model} from local Ollama...\n`);

  let stream;
  try {
    stream = await client.chat({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach Ollama; check that the container is running.",
      );
    }
    throw error;
  }

  process.stdout.write("Response:\n");
  for await (const part of stream) process.stdout.write(part.message.content);
  process.stdout.write("\n");
}

try {
  await run();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Chat sample failed unexpectedly.",
  );
  process.exitCode = 1;
}
