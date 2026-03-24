import OpenAI from "openai";
import type { RepoFile } from "./loadFiles.js";
import { chunkFiles } from "./chunkFiles.js";
import type { FileChunk } from "./chunkFiles.js";
import {
  embedChunks,
  embedQuery,
  cosineSimilarity,
  type ChunkWithEmbedding,
} from "./embeddings.js";

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

function scoreFile(question: string, file: RepoFile): number {
  const qTokens = uniqueTokens(question);
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

function scoreChunkKeyword(question: string, chunk: FileChunk): number {
  const qTokens = uniqueTokens(question);
  const filePath = chunk.filePath.toLowerCase();
  const text = chunk.text.toLowerCase();

  let score = 0;

  for (const token of qTokens) {
    if (token.length < 2) continue;
    if (filePath.includes(token)) score += 8;
    if (text.includes(token)) score += 4;
  }

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

function pickTopKeywordChunks(
  question: string,
  chunks: FileChunk[],
  limit = 40,
): FileChunk[] {
  return [...chunks]
    .map((chunk) => ({
      chunk,
      score: scoreChunkKeyword(question, chunk),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
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

function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) return values.map(() => 1);

  return values.map((v) => (v - min) / (max - min));
}

async function pickHybridTopChunks(
  question: string,
  chunks: FileChunk[],
  candidateLimit = 40,
  finalTopChunkLimit = 10,
): Promise<FileChunk[]> {
  // First: cheap keyword filtering to reduce embedding load
  const candidateChunks = pickTopKeywordChunks(
    question,
    chunks,
    candidateLimit,
  );

  // Only embed the candidate set, not every chunk
  const embeddedChunks = await embedChunks(candidateChunks);
  const queryEmbedding = await embedQuery(question);

  const keywordScores = embeddedChunks.map((chunk) =>
    scoreChunkKeyword(question, chunk),
  );

  const semanticScores = embeddedChunks.map((chunk) =>
    cosineSimilarity(queryEmbedding, chunk.embedding),
  );

  const normalizedKeyword = normalizeScores(keywordScores);
  const normalizedSemantic = normalizeScores(semanticScores);

  if (
    normalizedKeyword.length !== normalizedSemantic.length ||
    normalizedKeyword.length !== embeddedChunks.length
  ) {
    throw new Error("Hybrid score array length mismatch");
  }

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
        keywordScore: keywordScores[index],
        semanticScore: semanticScores[index],
        hybridScore,
      };
    })
    .sort((a, b) => b.hybridScore - a.hybridScore);

  const topChunks = ranked
    .slice(0, finalTopChunkLimit)
    .map((item) => item.chunk);

  // Build lookup from ALL original chunks so neighbor retrieval still works
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

  return [...selected.values()].sort((a, b) => {
    if (a.filePath === b.filePath) {
      return a.chunkIndex - b.chunkIndex;
    }
    return a.filePath.localeCompare(b.filePath);
  });
}

function formatContext(chunks: FileChunk[]): string {
  return chunks
    .map(
      (chunk) =>
        `FILE: ${chunk.filePath}\nCHUNK: ${chunk.chunkId}\n${chunk.text}`,
    )
    .join("\n\n---\n\n");
}

export async function askCodebase(question: string, files: RepoFile[]) {
  const topFiles = pickTopFiles(question, files, 10);
  const chunks = chunkFiles(topFiles, 3000, 300);

  const selectedChunks = await pickHybridTopChunks(question, chunks, 10);
  const context = formatContext(selectedChunks);

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
