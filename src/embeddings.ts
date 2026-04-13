import OpenAI from "openai";
import type { FileChunk } from "./chunkFiles.js";
import type { RepoFile, FileWithEmbedding } from "./loadFiles.js";
import { loadEmbeddingCache, saveEmbeddingCache, hashText } from "./cache.js";

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
  const cache = loadEmbeddingCache();

  const results: ChunkWithEmbedding[] = [];
  const chunksToEmbed: FileChunk[] = [];

  // First pass:
  // - reuse cached embeddings when possible
  // - collect only missing/changed chunks for fresh embedding
  for (const chunk of chunks) {
    const textHash = hashText(chunk.text);
    const cached = cache.chunks[chunk.chunkId];

    if (cached && cached.textHash === textHash) {
      results.push({
        ...chunk,
        embedding: cached.embedding,
      });
    } else {
      chunksToEmbed.push(chunk);
    }
  }

  // Embed only the chunks that were not reusable from cache
  //console.log("Chunks to embed: ", chunksToEmbed.length);

  if (chunksToEmbed.length > 0) {
    const textsToEmbed = chunksToEmbed.map(
      (chunk) => `FILE: ${chunk.filePath}\n${chunk.text}`,
    );

    const newEmbeddings = await embedTexts(textsToEmbed);

    if (newEmbeddings.length !== chunksToEmbed.length) {
      throw new Error(
        `Embedding mismatch: got ${newEmbeddings.length}, expected ${chunksToEmbed.length}`,
      );
    }

    for (let i = 0; i < chunksToEmbed.length; i++) {
      const chunk = chunksToEmbed[i];
      const embedding = newEmbeddings[i];

      if (!chunk || !embedding) {
        throw new Error(`Missing chunk or embedding at index ${i}`);
      }

      const textHash = hashText(chunk.text);

      // Update cache
      cache.chunks[chunk.chunkId] = {
        chunkId: chunk.chunkId,
        filePath: chunk.filePath,
        chunkIndex: chunk.chunkIndex,
        textHash,
        embedding,
      };

      // Add to final results
      results.push({
        ...chunk,
        embedding,
      });
    }

    saveEmbeddingCache(cache);
  }

  // Preserve original chunk order
  const resultMap = new Map(results.map((item) => [item.chunkId, item]));

  return chunks.map((chunk) => {
    const result = resultMap.get(chunk.chunkId);
    if (!result) {
      throw new Error(`Missing embedded result for chunk ${chunk.chunkId}`);
    }
    return result;
  });
}

/**
 * Embed a set of files.
 *
 * Why:
 * We want semantic retrieval over file content for hybrid ranking.
 */
export async function embedFiles(
  files: RepoFile[],
): Promise<FileWithEmbedding[]> {
  const cache = loadEmbeddingCache();

  const results: FileWithEmbedding[] = [];
  const filesToEmbed: RepoFile[] = [];

  console.log(`Embedding ${files.length} files...`);
  // First pass:
  // - reuse cached embeddings when possible
  // - collect only missing/changed files for fresh embedding
  for (const file of files) {
    console.log("Checking cache for file: ", file.path);
    const text = `FILE: ${file.path}\n${file.content.slice(0, 12000)}`;
    const textHash = hashText(text);
    const cached = cache.files[file.path];
    if (cached && cached.textHash === textHash) {
      results.push({
        ...file,
        embedding: cached.embedding,
      });
    } else {
      filesToEmbed.push(file);
    }
  }

  // Embed only the files that were not reusable from cache
  if (filesToEmbed.length > 0) {
    console.log(
      `Embedding ${filesToEmbed.length} files that were not in cache...`,
    );
    const textsToEmbed = filesToEmbed.map(
      (file) => `FILE: ${file.path}\n${file.content.slice(0, 12000)}`,
    );

    console.log("Starting embedding of files...");
    const newEmbeddings = await embedTexts(textsToEmbed);

    if (newEmbeddings.length !== filesToEmbed.length) {
      throw new Error(
        `Embedding mismatch: got ${newEmbeddings.length}, expected ${filesToEmbed.length}`,
      );
    }

    console.log("Finished embedding files. Updating cache and results...");
    for (let i = 0; i < filesToEmbed.length; i++) {
      const file = filesToEmbed[i];
      const embedding = newEmbeddings[i];

      if (!file || !embedding) {
        throw new Error(`Missing file or embedding at index ${i}`);
      }

      const text = `FILE: ${file.path}\n${file.content.slice(0, 12000)}`;
      const textHash = hashText(text);

      // Update cache
      cache.files[file.path] = {
        filePath: file.path,
        textHash,
        embedding,
      };

      // Add to final results
      results.push({
        ...file,
        embedding,
      });
    }

    saveEmbeddingCache(cache);
  }

  // Preserve original file order
  const resultMap = new Map(results.map((item) => [item.path, item]));

  return files.map((file) => {
    const result = resultMap.get(file.path);
    if (!result) {
      throw new Error(`Missing embedded result for file ${file.path}`);
    }
    return result;
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
