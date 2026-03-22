import "dotenv/config";
import { loadFilesRecursive } from "./loadFiles.js";
import { chunkFiles } from "./chunkFiles.js";
import { askCodebase } from "./ask.js";

async function main() {
  const repoPath = process.argv[2];
  const question = process.argv.slice(3).join(" ");

  if (!repoPath || !question) {
    console.log(`Usage: npx tsx src/index.ts <repo-path> "<question>"`);
    process.exit(1);
  }

  const files = loadFilesRecursive(repoPath);
  const chunks = chunkFiles(files);

  console.log(`Loaded ${files.length} files`);
  console.log(`Created ${chunks.length} chunks`);
  console.log(`\nThinking...\n`);

  const answer = await askCodebase(question, chunks);
  console.log(answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
