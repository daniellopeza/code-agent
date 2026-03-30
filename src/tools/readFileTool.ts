import type { RepoFile } from "../loadFiles.js";

export function readFileTool(
  files: RepoFile[],
  path: string,
): RepoFile | undefined {
  return files.find((file) => file.path === path);
}
