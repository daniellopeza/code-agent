import OpenAI from "openai";
import type { FileChunk } from "./chunkFiles.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_/\-. ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreChunk(question: string, chunk: FileChunk): number {
  const qTokens = tokenize(question);
  const chunkText = `${chunk.filePath}\n${chunk.text}`.toLowerCase();

  let score = 0;

  for (const token of qTokens) {
    if (token.length < 2) continue;

    if (chunk.filePath.toLowerCase().includes(token)) {
      score += 8;
    }

    if (chunkText.includes(token)) {
      score += 3;
    }
  }

  if (question.toLowerCase().includes("auth")) {
    if (
      chunk.filePath.toLowerCase().includes("auth") ||
      chunkText.includes("login") ||
      chunkText.includes("token") ||
      chunkText.includes("jwt")
    ) {
      score += 10;
    }
  }

  return score;
}

function rankChunks(question: string, chunks: FileChunk[]): FileChunk[] {
  return [...chunks]
    .map((chunk) => ({
      chunk,
      score: scoreChunk(question, chunk),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.chunk);
}

export async function askCodebase(
  question: string,
  chunks: FileChunk[],
  dryRun: boolean = false,
) {
  const ranked = rankChunks(question, chunks);

  const selected = ranked.slice(0, 20);

  const context = selected
    .map(
      (chunk) =>
        `FILE: ${chunk.filePath}\nCHUNK: ${chunk.chunkId}\n${chunk.text}`,
    )
    .join("\n\n---\n\n");

  console.log("context: ", context);
  if (dryRun) return "Done without LLM.";

  const response = await client.responses.create({
    model: "gpt-4.1",
    input: [
      {
        role: "system",
        content:
          "You are a codebase intelligence assistant. Answer only using the provided repo context. If unsure, say what is missing.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nCodebase context:\n${context}`,
      },
    ],
  });

  return response.output_text;
}
