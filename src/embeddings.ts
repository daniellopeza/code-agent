import OpenAI from "openai";
import type { FileChunk } from "./chunkFiles.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * FileChunk plus its embedding vector.
 *
 * Why:
 * Once we embed a chunk, we want to keep both:
 * - the original chunk text/metadata
 * - the numeric vector used for semantic similarity
 */
export type ChunkWithEmbedding = FileChunk & {
  embedding: number[];
};

/**
 * Very rough token estimate based on character count.
 *
 * Why:
 * The embeddings API has a max total-token limit per request.
 * This is only a rough guard, but helps us avoid huge requests.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split a list of texts into multiple batches so one embeddings request
 * does not become too large.
 *
 * Why:
 * Sending every chunk in one request can exceed API limits.
 */
function batchTextsByEstimatedTokens(
  texts: string[],
  maxEstimatedTokensPerBatch = 200000,
): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentTokenEstimate = 0;

  for (const text of texts) {
    const est = estimateTokens(text);

    // If adding this text would overflow the current batch,
    // finalize the current batch and start a new one.
    if (
      currentBatch.length > 0 &&
      currentTokenEstimate + est > maxEstimatedTokensPerBatch
    ) {
      batches.push(currentBatch);
      currentBatch = [text];
      currentTokenEstimate = est;
    } else {
      currentBatch.push(text);
      currentTokenEstimate += est;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Embed a list of texts, automatically batching requests if needed.
 *
 * Why:
 * This lets the rest of the code request embeddings for many texts
 * without worrying about per-request token limits.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batches = batchTextsByEstimatedTokens(texts, 200000);
  const allEmbeddings: number[][] = [];

  for (const batch of batches) {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  if (allEmbeddings.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: got ${allEmbeddings.length}, expected ${texts.length}`,
    );
  }

  return allEmbeddings;
}

/**
 * Embed a set of chunks.
 *
 * Why:
 * We want semantic retrieval over chunk content, not just raw text strings.
 */
export async function embedChunks(
  chunks: FileChunk[],
): Promise<ChunkWithEmbedding[]> {
  const texts = chunks.map((chunk) => `FILE: ${chunk.filePath}\n${chunk.text}`);

  const embeddings = await embedTexts(texts);

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding mismatch: ${embeddings.length} vs ${chunks.length}`,
    );
  }

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

/**
 * Embed the user question.
 *
 * Why:
 * Retrieval works by comparing the query embedding
 * against chunk embeddings in the same vector space.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const embeddings = await embedTexts([query]);

  const embedding = embeddings[0];
  if (!embedding) {
    throw new Error("No embedding returned for query");
  }

  return embedding;
}

/**
 * Compute cosine similarity between two vectors.
 *
 * Why:
 * This is the standard way to compare embedding direction/similarity.
 * Higher value generally means more semantic similarity.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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
