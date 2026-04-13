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
 *
 * Con:
 * single entry point when running command. If you want new behavior,
 * such as ask, plan, etc. you'd likely keep adding if statements to index.ts
 * or create separate scripts.
 *
 * Easier expansion: Commander handles commands in cli.ts
 * npm run cli -- ask ../my-repo "question"
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
  const result = await askCodebase(files, question);

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
