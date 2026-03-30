import type { RepoFile } from "../loadFiles.js";

function tokenize(text: unknown): string[] {
  const safeText = typeof text === "string" ? text : String(text ?? "");

  return safeText
    .toLowerCase()
    .replace(/[^a-z0-9_./-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueTokens(text: unknown): string[] {
  return [...new Set(tokenize(text))];
}

export function scoreFile(question: string, file: RepoFile): number {
  const qTokens = uniqueTokens(question);
  const filePath = String(file.path ?? "").toLowerCase();
  const contentStart = String(file.content ?? "")
    .slice(0, 8000)
    .toLowerCase();

  let score = 0;

  for (const token of qTokens) {
    if (token.length < 2) continue;

    if (filePath.includes(token)) score += 10;
    if (contentStart.includes(token)) score += 3;
  }

  if (question.toLowerCase().includes("auth")) {
    if (
      filePath.includes("auth") ||
      contentStart.includes("login") ||
      contentStart.includes("token") ||
      contentStart.includes("jwt") ||
      contentStart.includes("oauth")
    ) {
      score += 15;
    }
  }

  return score;
}

export function pickTopFiles(
  question: string,
  files: RepoFile[],
  limit = 10,
): RepoFile[] {
  return [...files]
    .map((file) => ({
      file,
      score: scoreFile(question, file),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.file);
}
