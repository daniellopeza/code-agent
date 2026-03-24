import "dotenv/config";
import { loadFilesRecursive } from "./loadFiles.js";
import { askCodebase } from "./ask.js";

async function main() {
  /**
   * CLI input:
   * arg[2] = repo path
   * arg[3+] = question
   */
  const repoPath = process.argv[2];
  const question = process.argv.slice(3).join(" ");

  if (!repoPath || !question) {
    console.log(`Usage: npx tsx src/index.ts <repo-path> "<question>"`);
    process.exit(1);
  }

  // Step 1: load repo files
  const files = loadFilesRecursive(repoPath);

  console.log(`Loaded ${files.length} files`);
  console.log(`Thinking...\n`);

  // Step 2: ask AI using retrieval pipeline
  const result = await askCodebase(question, files);

  console.log("Top files used:");
  for (const file of result.topFiles) {
    console.log(`- ${file.path}`);
  }

  console.log(`\nSelected chunks: ${result.selectedChunks.length}\n`);

  /**
   * Final answer from LLM
   */
  console.log(result.answer);
}

// Run program
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
