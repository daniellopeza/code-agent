import type { RepoFile, ScoredRepoFile } from "../loadFiles.js";
import { pickTopFiles, hybridPickTopFiles } from "../retrieval/fileRanking.js";

export async function searchFilesTool(
  files: RepoFile[],
  query: string,
  useSemantic: boolean = true,
): Promise<ScoredRepoFile[]> {
  if (useSemantic && process.env.OPENAI_API_KEY) {
    try {
      return await hybridPickTopFiles(query, files, 10);
    } catch (error) {
      console.warn("Semantic ranking failed, falling back to lexical:", error);
      return pickTopFiles(query, files, 10);
    }
  }
  return pickTopFiles(query, files, 10);
}
