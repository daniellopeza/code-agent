import type { RepoFile } from "../loadFiles.js";
import { pickTopFiles } from "../retrieval/fileRanking.js";

export function searchFilesTool(files: RepoFile[], query: string): RepoFile[] {
  return pickTopFiles(query, files, 10);
}
