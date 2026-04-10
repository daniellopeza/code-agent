import OpenAI from "openai";
import type { RepoFile } from "../loadFiles.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function summarizeFileTool(file: RepoFile): Promise<string> {
  const content = file.content.slice(0, 12000);
  const truncated = file.content.length > 12000;

  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content:
          "You are a code intelligence assistant. Summarize the purpose and key behavior of this source file, focusing on what it does, what components or systems it interacts with, and why it matters for a developer looking at the codebase.",
      },
      {
        role: "user",
        content: `FILE PATH: ${file.path}\n\n${content}\n\n${
          truncated
            ? "(TRUNCATED CONTENT: only the first 12,000 characters are shown)"
            : ""
        }`,
      },
    ],
    max_output_tokens: 500,
  });

  const summary = response.output_text?.trim();
  if (!summary) {
    throw new Error(`No summary returned for ${file.path}`);
  }

  return summary;
}
