#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const TARGET_EXTENSIONS = new Set(['.css', '.svelte']);
const SKIP_PATH_SNIPPETS = ['src/lib/design-system', 'src/assets'];

const COLOR_LITERAL_PATTERN = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(/;
const RADIUS_PROPERTY_PATTERN =
  /border(?:-top-left|-top-right|-bottom-left|-bottom-right)?-radius\s*:\s*([^;]+);?/;

const violations = [];

walk(SRC_DIR);

if (violations.length > 0) {
  console.error('Design system violations detected. Use semantic tokens instead of literals.');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.reason}`);
    console.error(`  ${violation.snippet}`);
  }
  process.exit(1);
}

console.log('Design system check passed.');

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const normalized = fullPath.replace(/\\/g, '/');

    if (SKIP_PATH_SNIPPETS.some((snippet) => normalized.includes(snippet))) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    lintFile(fullPath);
  }
}

function lintFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes('ds-allow-literal')) {
      return;
    }

    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('//')
    ) {
      return;
    }

    const isCustomProperty = trimmed.startsWith('--');

    if (!isCustomProperty && COLOR_LITERAL_PATTERN.test(trimmed) && !trimmed.includes('var(')) {
      violations.push({
        file: toRelative(filePath),
        line: index + 1,
        reason: 'color literal is not allowed',
        snippet: trimmed,
      });
      return;
    }

    const radiusMatch = trimmed.match(RADIUS_PROPERTY_PATTERN);
    if (radiusMatch) {
      const value = radiusMatch[1]?.trim() ?? '';
      const radiusAllowed = value.startsWith('var(') || value === '0' || value === '0px';

      if (radiusAllowed) {
        return;
      }

      violations.push({
        file: toRelative(filePath),
        line: index + 1,
        reason: 'radius literal is not allowed',
        snippet: trimmed,
      });
    }
  });
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}
