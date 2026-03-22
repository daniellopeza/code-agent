import OpenAI from "openai";
import type { FileChunk } from "./chunkFiles.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askCodebase(
  question: string,
  chunks: FileChunk[],
  dryRun: boolean = false,
) {
  // improve relevance: smart retrieval, not bling slicing
  const selected = chunks.slice(0, 12);

  const context = selected
    .map(
      (chunk) =>
        `FILE: ${chunk.filePath}\nCHUNK: ${chunk.chunkId}\n${chunk.text}`,
    )
    .join("\n\n---\n\n");

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

  console.log("context: ", context);

  return response.output_text;
}
