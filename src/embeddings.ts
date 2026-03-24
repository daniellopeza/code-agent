import OpenAI from "openai";
import type { FileChunk } from "./chunkFiles.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ChunkWithEmbedding = FileChunk & {
  embedding: number[];
};

export async function embedTextOpenAPIWrapper(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

export async function embedChunks(
  chunks: FileChunk[],
): Promise<ChunkWithEmbedding[]> {
  const texts = chunks.map((chunk) => `FILE: ${chunk.filePath}\n${chunk.text}`);

  const embeddings = await embedTextOpenAPIWrapper(texts);

  return chunks.map((chunk, index) => {
    const embedding = embeddings[index];
    if (!embedding) {
      throw new Error(`Missing embedding for chunk ${index}`);
    }

    return {
      ...chunk,
      embedding,
    };
  });
}

export async function embedQuery(query: string): Promise<number[]> {
  const embeddings = await embedTextOpenAPIWrapper([query]);

  const embedding = embeddings[0];
  if (!embedding) {
    throw new Error("No embedding returned for query");
  }

  return embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // both vectors must have exactly the same number of dimensions (n) to compute cosine similarity
  // because we are using the same model, that model always outputs vectors of fixed size
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: a=${a.length}, b=${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i];
    const bVal = b[i];

    if (aVal === undefined || bVal === undefined) {
      throw new Error(`Missing embedding value at index ${i}`);
    }

    dot += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
