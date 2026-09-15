import { lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const artifacts = [
  "build", "dist", "target", "src/shell/gen", "deps/cache/seekdb-driver-build",
  "docs/.vitepress/cache", "docs/.vitepress/dist",
  ...["", "src/mac_ui/", "docs/"].flatMap(prefix =>
    [".vite", ".vite-temp", ".cache"].map(name => `${prefix}node_modules/${name}`)),
];

/** Remove a repository-relative artifact without traversing symlinked parents; propagate I/O errors. */
function removeArtifact(root, relative) {
  const parts = relative.split("/");
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    const stat = lstatSync(parent, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return;
  }
  rmSync(join(root, relative), { recursive: true, force: true });
}

/** Remove incremental compiler and Finder metadata in project sources, skipping dependencies and symlinks. */
function cleanMetadata(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "deps", "repos"].includes(entry.name) || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) cleanMetadata(path);
    else if (entry.name.endsWith(".tsbuildinfo") || entry.name === ".DS_Store") rmSync(path);
  }
}

/** Delete generated project outputs under root; retain installed dependencies, toolchains and source files. */
export function clean(root) {
  for (const path of artifacts) removeArtifact(root, path);
  cleanMetadata(root);
  console.log("Cleaned build outputs, generated files and development caches.");
}
