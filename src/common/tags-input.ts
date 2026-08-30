export function parseTagInput(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
