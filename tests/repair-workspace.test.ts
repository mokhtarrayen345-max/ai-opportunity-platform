import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, symlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertWorkspaceFilePath } from "@/services/repair-workspace";

const roots: string[] = [];
async function tempRoot(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), "aop-repair-authorized-" + prefix));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("authorized repair workspace file paths", () => {
  it("allows a regular file within the authorized workspace", async () => {
    const root = await tempRoot("regular-");
    await writeFile(join(root, "safe.txt"), "safe", "utf8");
    await expect(assertWorkspaceFilePath(root, "safe.txt")).resolves.toBe(join(root, "safe.txt"));
  });

  it("rejects a file symlink that points outside the workspace", async () => {
    const root = await tempRoot("link-root-");
    const outside = await tempRoot("link-outside-");
    await writeFile(join(outside, "secret.txt"), "not for the repair workspace", "utf8");
    await symlink(join(outside, "secret.txt"), join(root, "leak.txt"));
    await expect(assertWorkspaceFilePath(root, "leak.txt")).rejects.toThrow("Symbolic links");
  });

  it("rejects symlinked parent directories", async () => {
    const root = await tempRoot("parent-root-");
    const outside = await tempRoot("parent-outside-");
    await writeFile(join(outside, "file.txt"), "outside", "utf8");
    await symlink(outside, join(root, "external"), "dir");
    await expect(assertWorkspaceFilePath(root, "external/file.txt")).rejects.toThrow("Symbolic links");
  });

  it("permits a missing leaf only when explicitly requested", async () => {
    const root = await tempRoot("new-file-");
    await expect(assertWorkspaceFilePath(root, "new.txt", true)).resolves.toBe(join(root, "new.txt"));
    await expect(assertWorkspaceFilePath(root, "new.txt")).rejects.toThrow();
  });

  it("rejects paths outside the authorized workspace", async () => {
    const root = await tempRoot("traversal-");
    await expect(assertWorkspaceFilePath(root, "../outside.txt", true)).rejects.toThrow();
  });
});
