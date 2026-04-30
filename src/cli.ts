#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import fs from "fs";
import OpenAI from "openai";

import { runController } from "./controller/runController.js";
import { loadFilesRecursive } from "./loadFiles.js";

const program = new Command();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

program
  .name("code-agent")
  .description("AI-powered codebase agent")
  .version("1.0.0");

/**
 * COMMAND: analyze
 *
 * Multi-step analysis with evidence gathering.
 */
program
  .command("ask")
  .description("Ask a question about a codebase")
  .argument("<repoPath>", "Path to repo")
  .argument("<question...>", "Question to ask")
  .option("-v, --verbose", "Show controller steps")
  .action(
    async (
      repoPath: string,
      questionParts: string[],
      options: { verbose?: boolean },
    ) => {
      const question = questionParts.join(" ");

      console.log("[cli] ask command started");
      console.log(`Repo path: ${repoPath}`);
      console.log(`Question: ${question}\n`);

      const result = await runController({
        repoPath,
        userGoal: question,
        mode: "ask",
        verbose: options.verbose ?? false,
      });

      console.log("===============================");
      console.log("Analysis complete.");
      console.log(`Files read: ${result.filesRead.length}`);
      console.log(`Files relevant: ${result.relevantFiles.length}`);
      console.log(`Notes gathered: ${result.notes.length}`);
      console.log("");

      console.log("===============================");
      console.log("Answer:\n");
      console.log(result.finalAnswer ?? "No answer generated.");
    },
  );

/**
 * COMMAND: explain
 *
 * Explains a single file directly.
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
 * Current version still uses the file list directly.
 * Later this can also be routed through the controller.
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
