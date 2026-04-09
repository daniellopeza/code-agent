import fs from "fs";
import path from "path";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".py",
  ".go",
  ".java",
  ".cs",
]);

export type RepoFile = {
  path: string;
  content: string;
};

export type ScoredRepoFile = {
  file: RepoFile;
  score: number;
};

export type FileWithEmbedding = RepoFile & {
  embedding: number[];
};

export function loadFilesRecursive(rootDir: string): RepoFile[] {
  const results: RepoFile[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) {
          console.log("ignoring: ", entry.name);
          continue;
        }

        console.log("walk full path: ", fullPath);
        walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf8");
        results.push({
          path: fullPath,
          content,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  walk(rootDir);
  return results;
}
