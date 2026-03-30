import OpenAI from "openai";
import { pickTopFiles } from "./retrieval/fileRanking.js";
import type { RepoFile } from "./loadFiles.js";
import { chunkFiles } from "./chunkFiles.js";
import type { FileChunk } from "./chunkFiles.js";
import { embedChunks, embedQuery, cosineSimilarity } from "./embeddings.js";

// OpenAI client used for the final answer-generation step.
// Embeddings are handled in embeddings.ts.
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AskCodebaseResult = {
  answer: string;
  selectedChunks: FileChunk[];
  topFiles: RepoFile[];
};

/**
 * Split text into normalized tokens  (words) for simple keyword matching.
 *
 * Why:
 * We want a cheap first-pass relevance check before using embeddings.
 */
function tokenize(text: string): string[] {
  console.log("tokenize: ", text);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Same as tokenize(), but removes duplicates.
 *
 * Why:
 * If a question repeats the same word, we do not want to over-count it.
 */
function uniqueTokens(text: string): string[] {
  return [...new Set(tokenize(text))];
}

/**
 * Score a chunk using keyword matching only.
 *
 * This is cheaper than embeddings and is used to create
 * a candidate set before semantic reranking.
 */
function scoreChunkKeywordFromTokens(
  questionTokens: string[],
  questionLower: string,
  chunk: FileChunk,
): number {
  const filePath = String(chunk.filePath ?? "").toLowerCase();
  const text = String(chunk.text ?? "").toLowerCase();

  let score = 0;

  for (const token of questionTokens) {
    if (token.length < 2) continue;

    if (filePath.includes(token)) score += 8;
    if (text.includes(token)) score += 4;
  }

  if (questionLower.includes("auth")) {
    if (
      filePath.includes("auth") ||
      text.includes("login") ||
      text.includes("token") ||
      text.includes("jwt") ||
      text.includes("oauth")
    ) {
      score += 10;
    }
  }

  return score;
}

/**
 * Cheap keyword-only chunk filtering.
 *
 * Why:
 * Embeddings are more expensive than keyword matching.
 * So we first reduce the chunk set to the best keyword candidates.
 */
function pickTopKeywordChunks(
  question: string,
  chunks: FileChunk[],
  limit = 40,
): FileChunk[] {
  const qTokens = uniqueTokens(question);
  const questionLower = question.toLowerCase();

  return [...chunks]
    .map((chunk) => ({
      chunk,
      score: scoreChunkKeywordFromTokens(qTokens, questionLower, chunk),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}

/**
 * Hybrid retrieval:
 * 1. Use keyword ranking to cheaply select candidate chunks
 * 2. Use embeddings to semantically rerank those candidates
 * 3. Add neighbor chunks for continuity
 *
 * Why:
 * This gives us the benefits of both approaches:
 * - keyword matching for exact names/symbols/file paths
 * - embeddings for semantic meaning and synonyms
 */
/**
 * Build a map from file path -> ordered chunks for that file.
 *
 * Why:
 * Later, when we find a strong chunk, we also want to include
 * neighboring chunks for context continuity.
 */
function buildChunkLookup(chunks: FileChunk[]): Map<string, FileChunk[]> {
  const map = new Map<string, FileChunk[]>();

  for (const chunk of chunks) {
    const arr = map.get(chunk.filePath) ?? [];
    arr.push(chunk);
    map.set(chunk.filePath, arr);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  return map;
}

/**
 * Normalize scores into a 0..1 range so different scoring systems
 * can be combined more fairly.
 *
 * Why:
 * Keyword scores and embedding similarity scores live on different scales.
 */
function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  // If all scores are identical, give them all a normalized score of 1
  // so we avoid dividing by zero.
  if (min === max) return values.map(() => 1);

  return values.map((v) => (v - min) / (max - min));
}

async function pickHybridTopChunks(
  question: string,
  chunks: FileChunk[],
  candidateLimit = 40,
  finalTopChunkLimit = 10,
): Promise<FileChunk[]> {
  // Step 1: cheap keyword filter to reduce embedding volume.
  const candidateChunks = pickTopKeywordChunks(
    question,
    chunks,
    candidateLimit,
  );

  // Step 2: embed only the candidate chunks, not the full chunk set.
  if (candidateChunks.length === 0) {
    return [];
  }

  const embeddedChunks = await embedChunks(candidateChunks);

  // Step 3: embed the user question once.
  const queryEmbedding = await embedQuery(question);

  // Step 4: compute both keyword scores and semantic similarity scores.
  const qTokens = uniqueTokens(question);
  const questionLower = question.toLowerCase();

  const keywordScores = embeddedChunks.map((chunk) =>
    scoreChunkKeywordFromTokens(qTokens, questionLower, chunk),
  );

  const semanticScores = embeddedChunks.map((chunk) =>
    cosineSimilarity(queryEmbedding, chunk.embedding),
  );

  // Step 5: normalize both score sets so they can be merged.
  const normalizedKeyword = normalizeScores(keywordScores);
  const normalizedSemantic = normalizeScores(semanticScores);

  if (
    normalizedKeyword.length !== normalizedSemantic.length ||
    normalizedKeyword.length !== embeddedChunks.length
  ) {
    throw new Error("Hybrid score array length mismatch");
  }

  // Step 6: combine keyword and semantic scores into one hybrid score.
  // Slightly favor semantic similarity because it captures meaning better.
  const ranked = embeddedChunks
    .map((chunk, index) => {
      const k = normalizedKeyword[index];
      const s = normalizedSemantic[index];

      if (k === undefined || s === undefined) {
        throw new Error(`Missing score at index ${index}`);
      }

      const hybridScore = k * 0.45 + s * 0.55;

      return {
        chunk,
        hybridScore,
      };
    })
    .sort((a, b) => b.hybridScore - a.hybridScore);

  // Step 7: take the best hybrid-ranked chunks.
  const topChunks = ranked
    .slice(0, finalTopChunkLimit)
    .map((item) => item.chunk);

  // Build neighbor lookup from ALL original chunks, not just candidate chunks.
  // That way we can still pull adjacent context even if the neighbor itself
  // was not in the embedding candidate set.
  const chunkLookup = buildChunkLookup(chunks);

  const selected = new Map<string, FileChunk>();

  for (const chunk of topChunks) {
    selected.set(chunk.chunkId, chunk);

    const siblings = chunkLookup.get(chunk.filePath) ?? [];
    const prev = siblings.find((c) => c.chunkIndex === chunk.chunkIndex - 1);
    const next = siblings.find((c) => c.chunkIndex === chunk.chunkIndex + 1);

    if (prev) selected.set(prev.chunkId, prev);
    if (next) selected.set(next.chunkId, next);
  }

  // Sort results so the final context is easier to read and more coherent.
  return [...selected.values()].sort((a, b) => {
    if (a.filePath === b.filePath) {
      return a.chunkIndex - b.chunkIndex;
    }
    return a.filePath.localeCompare(b.filePath);
  });
}

/**
 * Convert selected chunks into one prompt-friendly context string.
 *
 * Why:
 * The answer model needs plain text context, not structured objects.
 */
function formatContext(chunks: FileChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `FILE: ${chunk.filePath}\nCHUNK: ${chunk.chunkId}\n${chunk.text}`,
    )
    .join("\n\n---\n\n");
}

/**
 * Main function used by the CLI.
 *
 * Full flow:
 * 1. Pick top files
 * 2. Chunk those files
 * 3. Run hybrid retrieval over chunks
 * 4. Build final context
 * 5. Ask the LLM for an answer grounded in that context
 */
export async function askCodebase(
  files: RepoFile[],
  question: string,
): Promise<AskCodebaseResult> {
  // Broad file-level filtering first.
  const topFiles = pickTopFiles(question, files, 10);

  // Chunk only the most relevant files.
  const chunks = chunkFiles(topFiles, 3000, 250);

  // Hybrid retrieval over the chunk set.
  const selectedChunks = await pickHybridTopChunks(question, chunks, 40, 10);

  // Convert selected chunks into final text context for the model.
  const context =
    selectedChunks.length > 0
      ? formatContext(selectedChunks)
      : topFiles
          .map((file) => `FILE: ${file.path}\n${file.content.slice(0, 4000)}`)
          .join("\n\n---\n\n");

  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content:
          "You are a codebase intelligence assistant. Answer only using the provided repository context. Be specific and mention file paths when possible. If uncertain, say what is missing.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nRepository context:\n${context}`,
      },
    ],
  });

  return {
    answer: response.output_text,
    selectedChunks,
    topFiles,
  };
}
