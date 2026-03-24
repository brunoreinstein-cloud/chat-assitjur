/**
 * verify-doc-links.ts
 *
 * O que faz: Verifica se todos os links em documentos Markdown apontam para ficheiros que existem.
 * Quando usar: Antes de commitar mudanças em docs ou de fazer release.
 *
 * Uso: tsx scripts/verify-doc-links.ts
 */

import fs from "node:fs";
import path from "node:path";

// Extensões de ficheiros que podem ser linkeados
const VALID_EXTENSIONS = [".md", ".ts", ".tsx", ".json"];

// Diretórios a verificar
const DIRS_TO_CHECK = ["docs", "."];

// Pattern para encontrar links em markdown: [texto](caminho)
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

// LinkResult interface removed (no longer used)

function findMarkdownFiles(): string[] {
  const files: string[] = [];

  function walkDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip node_modules, .git, etc.
        if (entry.name.startsWith(".") && entry.name !== ".agents") {
          continue;
        }
        if (entry.name === "node_modules") {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith(".md")) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.error(`Error reading ${dir}:`, err);
    }
  }

  for (const dir of DIRS_TO_CHECK) {
    walkDir(dir);
  }

  return files;
}

function extractLinks(
  filePath: string
): { line: number; text: string; url: string }[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const links: { line: number; text: string; url: string }[] = [];

  lines.forEach((line, lineIndex) => {
    LINK_PATTERN.lastIndex = 0; // Reset regex
    let match = LINK_PATTERN.exec(line);
    while (match !== null) {
      links.push({
        line: lineIndex + 1,
        text: match[1],
        url: match[2],
      });
      match = LINK_PATTERN.exec(line);
    }
  });

  return links;
}

function validateLink(
  docPath: string,
  url: string
): { exists: boolean; error?: string } {
  // Ignore external URLs
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { exists: true }; // Assume external links work
  }

  // Ignore anchors (#)
  if (url.startsWith("#")) {
    return { exists: true }; // Assume internal anchors work
  }

  const docDir = path.dirname(docPath);
  const targetPath = path.resolve(docDir, url);

  // Check if file exists (or if directory exists for README)
  if (fs.existsSync(targetPath)) {
    return { exists: true };
  }

  // Check without file extension (for README.md → README)
  for (const ext of VALID_EXTENSIONS) {
    const pathWithExt = targetPath + ext;
    if (fs.existsSync(pathWithExt)) {
      return { exists: true };
    }
  }

  // Check if it's a directory link to README.md
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    const readmePath = path.join(targetPath, "README.md");
    if (fs.existsSync(readmePath)) {
      return { exists: true };
    }
  }

  return {
    exists: false,
    error: `File not found: ${url} (resolved to ${targetPath})`,
  };
}

function main() {
  console.log("[verify-doc-links] Starting verification...\n");

  const mdFiles = findMarkdownFiles();
  console.log(`Found ${mdFiles.length} markdown files\n`);

  let totalLinks = 0;
  let brokenLinks = 0;

  for (const file of mdFiles) {
    const links = extractLinks(file);
    if (links.length === 0) {
      continue;
    }

    totalLinks += links.length;
    console.log(`📄 ${file} (${links.length} links)`);

    for (const link of links) {
      const validation = validateLink(file, link.url);

      if (!validation.exists) {
        brokenLinks++;
        console.log(
          `  ❌ Line ${link.line}: [${link.text}](${link.url}) — ${validation.error}`
        );
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `Total links: ${totalLinks} | Broken: ${brokenLinks} | Valid: ${totalLinks - brokenLinks}`
  );

  if (brokenLinks === 0) {
    console.log("✅ All documentation links are valid!\n");
    process.exit(0);
  } else {
    console.log(
      `❌ Found ${brokenLinks} broken link(s). Fix them before deploying.\n`
    );
    process.exit(1);
  }
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error("[verify-doc-links] Error:", error);
    process.exit(1);
  }
})();
