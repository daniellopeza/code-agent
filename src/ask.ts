import OpenAI from "openai";
import type { FileChunk } from "./chunkFiles.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askCodebase(question: string, chunks: FileChunk[]) {
  const selected = chunks.slice(0, 12);

  const context = selected
    .map(
      (chunk) =>
        `FILE: ${chunk.filePath}\nCHUNK: ${chunk.chunkId}\n${chunk.text}`,
    )
    .join("\n\n---\n\n");

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
