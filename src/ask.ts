import OpenAI from "openai";
import type { RepoFile } from "./loadFiles.js";
import { chunkFiles } from "./chunkFiles.js";
import type { FileChunk } from "./chunkFiles.js";

// Initialize OpenAI client using API key from .env
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Break text into tokens (words)
 * Used for simple keyword matching
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Remove duplicate tokens
 * Prevents over-counting the same word
 */
function uniqueTokens(text: string): string[] {
  return [...new Set(tokenize(text))];
}

/**
 * Score how relevant a FILE is to the question
 *
 * Why:
 * - We DON'T want to chunk entire repo (too big)
 * - First pick best files, then chunk those
 */
function scoreFile(question: string, file: RepoFile): number {
  const qTokens = uniqueTokens(question);

  // Use both file name and content
  const filePath = file.path.toLowerCase();
  const contentStart = file.content.slice(0, 8000).toLowerCase();

  let score = 0;

  for (const token of qTokens) {
    if (token.length < 2) continue;

    // Strong signal: filename match
    if (filePath.includes(token)) score += 10;

    // Weaker signal: content match
    if (contentStart.includes(token)) score += 3;
  }

  /**
   * Domain heuristic:
   * If question mentions "auth", boost auth-related files
   */
  if (question.toLowerCase().includes("auth")) {
    if (
      filePath.includes("auth") ||
      contentStart.includes("login") ||
      contentStart.includes("token") ||
      contentStart.includes("jwt") ||
      contentStart.includes("oauth")
    ) {
      score += 15;
    }
  }

  return score;
}

/**
 * Score how relevant a CHUNK is to the question
 *
 * More granular than file-level scoring
 */
function scoreChunk(question: string, chunk: FileChunk): number {
  const qTokens = uniqueTokens(question);

  const filePath = chunk.filePath.toLowerCase();
  const text = chunk.text.toLowerCase();

  let score = 0;

  for (const token of qTokens) {
    if (token.length < 2) continue;

    // File name still matters
    if (filePath.includes(token)) score += 8;

    // Content match is more important here
    if (text.includes(token)) score += 4;
  }

  // Same domain-specific boost for auth
  if (question.toLowerCase().includes("auth")) {
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

  console.log("chunk score: ", score + " - ", chunk.filePath);

  return score;
}

/**
 * Pick top N most relevant files
 *
 * This is CRITICAL:
 * Reduces search space from entire repo → only important files
 */
function pickTopFiles(
  question: string,
  files: RepoFile[],
  limit = 8,
): RepoFile[] {
  return [...files]
    .map((file) => ({
      file,
      score: scoreFile(question, file),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.file);
}

/**
 * Group chunks by file path
 *
 * Needed so we can:
 * - find neighboring chunks easily
 */
function buildChunkLookup(chunks: FileChunk[]): Map<string, FileChunk[]> {
  const map = new Map<string, FileChunk[]>();

  for (const chunk of chunks) {
    const arr = map.get(chunk.filePath) ?? [];
    arr.push(chunk);
    map.set(chunk.filePath, arr);
  }

  // Sort chunks in order for each file
  for (const arr of map.values()) {
    arr.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  return map;
}

/**
 * Select best chunks AND include neighbors
 *
 * Why neighbors matter:
 * - Code often spans multiple chunks
 * - Without neighbors, context gets cut off
 */
function pickTopChunksWithNeighbors(
  question: string,
  chunks: FileChunk[],
  topChunkLimit = 12,
): FileChunk[] {
  // Score all chunks
  const scored = [...chunks]
    .map((chunk) => ({
      chunk,
      score: scoreChunk(question, chunk),
    }))
    .sort((a, b) => b.score - a.score);

  // Take top chunks
  const topChunks = scored.slice(0, topChunkLimit).map((item) => item.chunk);
  const chunkLookup = buildChunkLookup(chunks);

  // Use Map to dedupe chunks
  const selected = new Map<string, FileChunk>();

  for (const chunk of topChunks) {
    selected.set(chunk.chunkId, chunk);

    // Get neighboring chunks
    const siblings = chunkLookup.get(chunk.filePath) ?? [];

    const prev = siblings.find((c) => c.chunkIndex === chunk.chunkIndex - 1);
    const next = siblings.find((c) => c.chunkIndex === chunk.chunkIndex + 1);

    if (prev) selected.set(prev.chunkId, prev);
    if (next) selected.set(next.chunkId, next);
  }

  // Sort nicely for readability
  return [...selected.values()].sort((a, b) => {
    if (a.filePath === b.filePath) {
      return a.chunkIndex - b.chunkIndex;
    }
    return a.filePath.localeCompare(b.filePath);
  });
}

/**
 * Format chunks into a single string
 *
 * This becomes the CONTEXT sent to the LLM
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
 * MAIN ENTRY: ask a question about a codebase
 */
export async function askCodebase(question: string, files: RepoFile[]) {
  // Step 1: pick relevant files
  const topFiles = pickTopFiles(question, files, 8);

  // Step 2: chunk only those files (not entire repo)
  const chunks = chunkFiles(topFiles, 3000, 300);

  // Step 3: pick best chunks + neighbors
  const selectedChunks = pickTopChunksWithNeighbors(question, chunks, 12);

  // Step 4: build context string
  const context = formatContext(selectedChunks);

  // Step 5: call LLM
  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "system",
        content:
          "You are a codebase intelligence assistant. Answer only using the provided repository context. Be specific and mention file paths when possible.",
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
