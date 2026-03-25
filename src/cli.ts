#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";

import { loadFilesRecursive } from "./loadFiles.js";
import { askCodebase } from "./ask.js";

const program = new Command();

// Commands:
// code-agent ask     → runs ask handler
// code-agent explain → runs explain handler
// code-agent plan    → runs plan handler

program
  .name("code-agent")
  .description("AI-powered codebase agent")
  .version("1.0.0");

//
// ✅ COMMAND 1: ask
//
program
  .command("ask")
  .description("Ask a question about a codebase")
  .argument("<repoPath>", "Path to repo")
  .argument("<question...>", "Question to ask")
  .action(async (repoPath: string, questionParts: string[]) => {
    const question = questionParts.join(" ");

    console.log("Loading repo...");
    const files = loadFilesRecursive(repoPath);

    console.log(`Loaded ${files.length} files`);
    console.log("Thinking...\n");

    const result = await askCodebase(question, files);

    console.log("Top files:");
    result.topFiles.forEach((f) => console.log(`- ${f.path}`));

    console.log("\nAnswer:\n");
    console.log(result.answer);
  });

//
// ✅ COMMAND 2: explain
//
program
  .command("explain")
  .description("Explain a single file")
  .argument("<filePath>", "Path to file")
  .action(async (filePath: string) => {
    const fs = await import("fs");

    const content = fs.readFileSync(filePath, "utf-8");

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content:
            "Explain this code clearly. Describe purpose, key functions, and how it fits in a system.",
        },
        {
          role: "user",
          content: content,
        },
      ],
    });

    console.log("\nExplanation:\n");
    console.log(response.output_text);
  });

//
// ✅ COMMAND 3: plan
//
program
  .command("plan")
  .description("Suggest what files to change for a feature")
  .argument("<repoPath>", "Path to repo")
  .argument("<request...>", "Feature request")
  .action(async (repoPath: string, requestParts: string[]) => {
    const request = requestParts.join(" ");

    const files = loadFilesRecursive(repoPath);

    const fileList = files.map((f) => f.path).join("\n");

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content:
            "You are a senior engineer. Given a repo file list, suggest which files should be modified and why.",
        },
        {
          role: "user",
          content: `Request: ${request}\n\nFiles:\n${fileList}`,
        },
      ],
    });

    console.log("\nPlan:\n");
    console.log(response.output_text);
  });

program.parse();
