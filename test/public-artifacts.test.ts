import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isForbiddenPublicArtifact } from "../src/lib/security";

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

describe("public deployment artifacts", () => {
  it("contains no hidden secrets, backups, archives, dumps, or source maps", () => {
    const publicDirectory = resolve(process.cwd(), "public");
    const violations = listFiles(publicDirectory)
      .map((file) => relative(publicDirectory, file))
      .filter(isForbiddenPublicArtifact)
      .sort();

    expect(violations).toEqual([]);
  });
});
