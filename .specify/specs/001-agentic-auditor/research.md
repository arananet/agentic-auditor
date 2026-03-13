# Research Document

## Cloudflare Workers AI Integration
- Validated `@cf/meta/llama-3.1-8b-instruct` for fast inference.
- Found that standard fetch with `Authorization: Bearer` to the REST API is the cleanest implementation for Next.js Route Handlers vs installing the heavy Cloudflare SDK.

## Cheerio vs Puppeteer
- Selected Cheerio for Next.js Edge compatibility. Puppeteer requires heavy chromium binaries not supported in Vercel/Cloudflare serverless environments.
