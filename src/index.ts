import "dotenv/config";
import { loadFilesRecursive } from "./loadFiles.js";
import { askCodebase } from "./ask.js";

/**
 * CLI entry point.
 *
 * Expected usage:
 * npx tsx src/index.ts <repo-path> "<question>"
 *
 * Example:
 * npx tsx src/index.ts ../my-repo "Where is authentication handled?"
 */
async function main() {
  const repoPath = process.argv[2];
  const question = process.argv.slice(3).join(" ");

  // Basic validation so the tool fails clearly instead of behaving strangely.
  if (!repoPath || !question) {
    console.log(`Usage: npx tsx src/index.ts <repo-path> "<question>"`);
    process.exit(1);
  }

  // Read the target repository into memory.
  // This returns an array of RepoFile objects.
  const files = loadFilesRecursive(repoPath);

  console.log(`Loaded ${files.length} files`);
  console.log(`Running hybrid retrieval...\n`);

  // Ask the codebase agent to answer the question using retrieved repo context.
  const result = await askCodebase(question, files);

  console.log("Top files used:");
  for (const file of result.topFiles) {
    console.log(`- ${file.path}`);
  }

  console.log(`\nSelected chunks: ${result.selectedChunks.length}\n`);

  // Final model answer.
  console.log(result.answer);
}

// Run program
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
