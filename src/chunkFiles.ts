import type { RepoFile } from "./loadFiles.ts";

export type FileChunk = {
  filePath: string;
  chunkId: string;
  text: string;
};

export function chunkFiles(files: RepoFile[], chunkSize = 1500): FileChunk[] {
  const chunks: FileChunk[] = [];

  for (const file of files) {
    const content = file.content;
    let start = 0;
    let index = 0;

    while (start < content.length) {
      const end = start + chunkSize;
      const text = content.slice(start, end);

      chunks.push({
        filePath: file.path,
        chunkId: `${file.path}#${index}`,
        text,
      });

      start = end;
      index++;
    }
  }

  return chunks;
}
