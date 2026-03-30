import { loadFilesRecursive } from "../loadFiles.js";
import type { RepoFile } from "../loadFiles.js";

export function loadRepoTool(repoPath: string): RepoFile[] {
  return loadFilesRecursive(repoPath).map((file) => ({
    path: file.path,
    content: file.content,
  }));
}
