#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import fs from "fs";

import { loadFilesRecursive } from "./loadFiles.js";
import { askCodebase } from "./ask.js";
import OpenAI from "openai";

const program = new Command();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

program
  .name("code-agent")
  .description("AI-powered codebase agent")
  .version("1.0.0");

/**
 * COMMAND: ask
 *
 * Uses the full repo-aware retrieval pipeline:
 * - load repo files
 * - run hybrid retrieval
 * - answer using retrieved context
 */
program
  .command("ask")
  .description("Ask a question about a codebase")
  .argument("<repoPath>", "Path to repo")
  .argument("<question...>", "Question to ask")
  .action(async (repoPath: string, questionParts: string[]) => {
    const question = questionParts.join(" ");

    console.log("[cli] ask command started");
    console.log(`Loading repo from: ${repoPath}`);

    const files = loadFilesRecursive(repoPath);

    console.log(`Loaded ${files.length} files`);
    console.log("Running hybrid retrieval...\n");

    const result = await askCodebase(question, files);

    console.log("Top files used:");
    result.topFiles.forEach((file) => {
      console.log(`- ${file.path}`);
    });

    console.log(`\nSelected chunks: ${result.selectedChunks.length}\n`);

    console.log("Answer:\n");
    console.log(result.answer);
  });

/**
 * COMMAND: explain
 *
 * Explains a single file directly.
 * This is useful for zooming in after broader repo Q&A.
 */
program
  .command("explain")
  .description("Explain a single file")
  .argument("<filePath>", "Path to file")
  .action(async (filePath: string) => {
    console.log("[cli] explain command started");
    console.log(`Reading file: ${filePath}`);

    const content = fs.readFileSync(filePath, "utf-8");

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content:
            "Explain this code clearly. Describe its purpose, key functions, major dependencies, and how it fits into the surrounding system. Be concrete and readable.",
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

/**
 * COMMAND: plan
 *
 * Current version:
 * - loads repo file list
 * - asks model which files are likely relevant to a requested feature
 *
 * Later, this should be upgraded to use your hybrid retrieval pipeline
 * instead of only sending filenames.
 */
program
  .command("plan")
  .description("Suggest what files to change for a feature")
  .argument("<repoPath>", "Path to repo")
  .argument("<request...>", "Feature request")
  .action(async (repoPath: string, requestParts: string[]) => {
    const request = requestParts.join(" ");

    console.log("[cli] plan command started");
    console.log(`Loading repo from: ${repoPath}`);

    const files = loadFilesRecursive(repoPath);
    const fileList = files.map((file) => file.path).join("\n");

    console.log(`Loaded ${files.length} files`);
    console.log("Generating implementation plan...\n");

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content:
            "You are a senior engineer. Given a repository file list and a feature request, identify the most likely files to change, explain why each file matters, and suggest a reasonable order of work. Be practical and concise.",
        },
        {
          role: "user",
          content: `Feature request: ${request}\n\nRepository files:\n${fileList}`,
        },
      ],
    });

    console.log("Plan:\n");
    console.log(response.output_text);
  });

program.parse();
