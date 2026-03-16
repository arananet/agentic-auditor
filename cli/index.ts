#!/usr/bin/env node
/**
 * geo-audit CLI
 *
 * Usage:
 *   npx tsx cli/index.ts --url <url> [--output <dir>] [--format md|pdf|both] [--urls-file <file>]
 *
 * Examples:
 *   npx tsx cli/index.ts --url https://www.example.com --output ./reports
 *   npx tsx cli/index.ts --url https://www.example.com --format pdf
 *   npx tsx cli/index.ts --urls-file ./urls.txt --output ./reports --format both
 *
 * Environment variables (optional, same as web app):
 *   CF_AI_ACCOUNT_ID, CF_AI_API_TOKEN   → enables deep LLM analysis via Cloudflare Workers AI
 *
 * Output files:
 *   <output>/<hostname>_<timestamp>.md
 *   <output>/<hostname>_<timestamp>.pdf
 */

import fs from 'fs';
import path from 'path';
import { AuditorService } from '../src/services/auditor.service';
import { renderMarkdown } from './reporters/markdown';
import { renderPdf } from './reporters/pdf';

// ---------------------------------------------------------------------------
// Argument parsing (no external deps)
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): {
  urls: string[];
  outputDir: string;
  formats: Set<'md' | 'pdf'>;
} {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
  };

  const urlArg = get('--url');
  const urlsFile = get('--urls-file');
  const outputDir = get('--output') ?? './geo-reports';
  const formatArg = (get('--format') ?? 'both').toLowerCase();

  // Resolve URLs
  const urls: string[] = [];
  if (urlArg) urls.push(urlArg);
  if (urlsFile) {
    const resolved = path.resolve(urlsFile);
    if (!fs.existsSync(resolved)) {
      console.error(`[ERROR] --urls-file not found: ${resolved}`);
      process.exit(1);
    }
    const lines = fs.readFileSync(resolved, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    urls.push(...lines);
  }

  if (urls.length === 0) {
    console.error('Usage: npx tsx cli/index.ts --url <url> [--output <dir>] [--format md|pdf|both]');
    console.error('       npx tsx cli/index.ts --urls-file <file> [--output <dir>] [--format md|pdf|both]');
    process.exit(1);
  }

  // Resolve formats
  const formats = new Set<'md' | 'pdf'>();
  if (formatArg === 'md' || formatArg === 'markdown') {
    formats.add('md');
  } else if (formatArg === 'pdf') {
    formats.add('pdf');
  } else {
    formats.add('md');
    formats.add('pdf');
  }

  return { urls, outputDir, formats };
}

// ---------------------------------------------------------------------------
// File-safe filename: "https://www.example.com/about" → "www.example.com_about"
// ---------------------------------------------------------------------------
function safeFilename(url: string, timestamp: string): string {
  const u = new URL(url);
  const slug = (u.hostname + u.pathname.replace(/\/$/, ''))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${slug}_${timestamp}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const { urls, outputDir, formats } = parseArgs(process.argv);

  // Ensure output directory exists
  const absOutput = path.resolve(outputDir);
  fs.mkdirSync(absOutput, { recursive: true });

  const service = new AuditorService();
  let exitCode = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const label = urls.length > 1 ? `[${i + 1}/${urls.length}] ` : '';

    // Basic URL validation
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    } catch {
      console.error(`${label}[SKIP] Invalid URL: ${url}`);
      exitCode = 1;
      continue;
    }

    console.log(`\n${label}Auditing ${url} …`);

    let report;
    try {
      report = await service.runAudit(url, (msg) => process.stdout.write(`  ${msg}\n`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label}[FAILED] ${msg}`);
      exitCode = 1;
      continue;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = safeFilename(url, timestamp);

    console.log(`\n  Overall Score: ${report.overallScore}/100`);

    // --- Markdown ---
    if (formats.has('md')) {
      const mdPath = path.join(absOutput, `${base}.md`);
      const md = renderMarkdown(url, report);
      fs.writeFileSync(mdPath, md, 'utf8');
      console.log(`  ✅ Markdown → ${mdPath}`);
    }

    // --- PDF ---
    if (formats.has('pdf')) {
      const pdfPath = path.join(absOutput, `${base}.pdf`);
      try {
        await renderPdf(url, report, pdfPath);
        console.log(`  ✅ PDF      → ${pdfPath}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [WARN] PDF generation failed: ${msg}`);
        exitCode = 1;
      }
    }
  }

  console.log('\nDone.');
  process.exit(exitCode);
}

main().catch(err => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
