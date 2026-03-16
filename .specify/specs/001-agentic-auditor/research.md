# Research Document

## Cloudflare Workers AI Integration
- Validated `@cf/meta/llama-3.1-8b-instruct` for fast inference.
- Standard fetch with `Authorization: Bearer` to the REST API is the cleanest implementation for Next.js Route Handlers.
- **Free Tier:** 10,000 neurons/day. Each inference call consumes neurons proportional to token count. When the quota is exhausted, `LlmAnalyzer` returns an error and the auditor falls back to heuristic scoring automatically.

## Page Rendering Strategy: Playwright over Cheerio-only
- The original implementation used vanilla `fetch` + Cheerio for fast, serverless-compatible parsing.
- However, many enterprise sites require JavaScript execution to render meaningful content. Vanilla fetch returns blank or partial HTML.
- Selected **Playwright Chromium** (headless singleton) for page rendering. The rendered HTML is then parsed by Cheerio.
- A separate `fetchTextFile()` helper uses native `fetch` (no browser) for plain-text resources (robots.txt, llms.txt) where JavaScript execution is unnecessary.
- Playwright adds ~250 MB to the Docker image but is kept in `serverComponentsExternalPackages` so Next.js does not bundle it.

## Robots.txt Parsing
- The original implementation used a simplistic regex on the full file. This causes false positives/negatives for bots when a disallow rule appears in a different user-agent block.
- Replaced with a proper block-level parser (`parseRobotsBlocks` + `isBotAllowed`) that correctly handles multi-agent groups per RFC 9309.

## Lexical Diversity / Heaps' Law
- Measuring unique words across an entire long page unfairly penalises rich content (Heaps' law: vocabulary grows sub-linearly with corpus size).
- Fixed: lexical diversity is now measured on a 500-word sample window from the beginning of the body text.

## CLI Tooling
- `tsx` is used as the runtime for the CLI (no transpilation step needed). It is a dev dependency.
- The CLI reuses `AuditorService` directly, so it has full feature parity with the web app.
- PDF generation reuses Playwright (already a dependency) via a dynamic import to avoid loading the browser for `--format md`.
