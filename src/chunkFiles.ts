import type { RepoFile } from "./loadFiles.js";

export type FileChunk = {
  filePath: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
};

export function chunkFiles(
  files: RepoFile[],
  chunkSize = 3000,
  overlap = 300,
): FileChunk[] {
  const chunks: FileChunk[] = [];

  for (const file of files) {
    const content = file.content;
    let start = 0;
    let index = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const text = content.slice(start, end);

      chunks.push({
        filePath: file.path,
        chunkId: `${file.path}#${index}`,
        chunkIndex: index,
        text,
      });

      if (end >= content.length) break;

      start += chunkSize - overlap;
      index++;
    }
  }

  return chunks;
}
