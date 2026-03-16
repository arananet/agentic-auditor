# Geo Agentic Auditor

Geo Agentic Auditor is a deterministic, heuristics-based, and LLM-accelerated Generative Engine Optimization (GEO) scanner. It evaluates a website's readiness for next-generation AI agents, LLMs, and RAG pipelines using 11 dedicated metrics.

## Features

- **Heuristic + Semantic Scanning**: Employs continuous density scoring and structural parsing to mimic how search engines (GPTBot, ClaudeBot, Perplexity) see the web.
- **Playwright Rendering**: Uses a headless Chromium singleton to render fully JavaScript-driven websites before analysis.
- **LLM Acceleration (Optional)**: Automatically upgrades from density heuristics to deep semantic NLP classification when configured with Cloudflare Workers AI (**Free Tier: 10,000 neurons/day**).
- **Live Log Streaming**: Per-strategy progress lines streamed to the browser console panel in real time.
- **Turnstile Protected**: Robust edge-level bot protection ensures the audit tool cannot be abused.
- **Print-to-PDF**: Browser-native technical report with stamped filename (`GEO_Audit_<host>_<ts>`).
- **CLI Batch Auditor**: `npm run audit:cli` — audit one URL or a batch file, output `.md` + `.pdf` reports.
- **SOLID Architecture**: Strategy Design Pattern, 11 `IAuditStrategy` implementations.

## Architecture

This project is a Next.js 14 application. It uses **Playwright** headless Chromium for page rendering (replacing vanilla `fetch`) and **Cheerio** for high-performance DOM parsing of the rendered HTML. Plain-text resources (robots.txt, llms.txt) are fetched directly without a browser via the `fetchTextFile()` helper.

## Getting Started

### 1. Prerequisites
- Node.js 18+
- npm

### 2. Installation
```bash
git clone https://github.com/arananet/agentic-auditor.git
cd agentic-auditor
npm install
npx playwright install chromium   # download headless browser binary (~250 MB)
```

### 3. Configuration & Secrets

Create a `.env.local` file:

```env
# Required: Cloudflare Turnstile Bot Protection
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here

# Optional: Cloudflare Workers AI for Deep Semantic Analysis
# Free Tier = 10,000 neurons/day (shared across Sentiment + Intent audits)
CF_AI_ACCOUNT_ID=your_account_id_here
CF_AI_API_TOKEN=your_api_token_here
```

**⚠️ Security Notice**: Never expose `CF_AI_API_TOKEN` or `TURNSTILE_SECRET_KEY` in client-side code or commit them to a public repository.

#### About the Cloudflare Workers AI Free Tier
The app uses `@cf/meta/llama-3.1-8b-instruct` via the Cloudflare Workers AI **Free Tier**, which provides **10,000 neurons per day**. This limit is displayed on the homepage. Once exhausted, Sentiment and Intent audits fall back to heuristic scoring automatically. Upgrade to a paid plan to remove the cap.

### 4. Running Locally
```bash
npm run dev
```
Open `http://localhost:3000` to view the auditor.

### 5. CLI Batch Auditor
```bash
# Audit a single URL (Markdown + PDF)
npm run audit:cli -- --url https://www.example.com --output ./reports

# Batch from file
npm run audit:cli -- --urls-file cli/urls.example.txt --output ./reports --format md

# PDF only
npm run audit:cli -- --url https://www.example.com --format pdf
```

## 11 GEO Metrics Evaluated

1.  **AI Citability**: Measures density of "Answer Blocks" (X is Y), statistical evidence, and optimal passage length (134–167 words).
2.  **Technical Readiness**: Evaluates robots.txt with a proper RFC 9309 block parser; checks 16 known AI crawler tokens.
3.  **Schema Depth**: Detects 14 priority schema types (JSON-LD + microdata) with recursive extraction.
4.  **A2A Handshakes**: Validates `/llms.txt`, `/llms-full.txt`, and `/.well-known/agent.json`.
5.  **Brand Authority**: Analyses outbound link authority across 12 domains (Wikipedia, LinkedIn, Reddit, GitHub, etc.) + trust markers.
6.  **Content E-E-A-T**: Checks for explicit authorship, freshness, and word count within `<main>/<article>` only.
7.  **Intent Match**: Evaluates if headings use conversational interrogatives matching user prompts.
8.  **Structural GEO**: Counts lists, tables, definition lists (`<dl>`), `<details>/<summary>`, and semantic HTML5 tags.
9.  **Semantic Depth**: Lexical diversity measured on a 500-word window (Heaps'-law-safe).
10. **Media Context**: WCAG 2.1-sourced ratio of descriptive (4+ word) alt-tags for Vision-Language Models.
11. **Tone Alignment**: Trust-marker-based sentiment heuristic; upgraded to LLM stance analysis when Cloudflare AI is configured.

> Geo Metrics based on the https://github.com/zubair-trabzada/geo-seo-claude framework.

## Sources & References

Every finding in the auditor references its backing standard. The table below lists the primary source for each of the 11 audit dimensions.

### AI Citability
| Source | Purpose |
|---|---|
| [Aggarwal et al. (2023) — GEO: Generative Engine Optimization, KDD 2024](https://arxiv.org/abs/2311.09735) | Passage-length optimal window (134–167 words), answer-block density, citability formula |
| Bortolato (2025) — AI Overview Passage Length Analysis | Corroborates 134–167 word window for AI Overview citations; oversized passages penalised |

### Technical Readiness
| Source | Purpose |
|---|---|
| [RFC 9309 — Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309) | Industry standard for per-bot `robots.txt` directives |
| [OpenAI — Crawler documentation](https://developers.openai.com/api/docs/bots) | `GPTBot` (training), `OAI-SearchBot` (ChatGPT search), `ChatGPT-User` (user browsing) |
| [Anthropic — Claude crawler documentation](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-the-web-and-how-can-site-owners-block-the-crawler) | `ClaudeBot` (training), `Claude-SearchBot` (search quality), `Claude-User` (user browsing) |
| [Google — Common crawlers list](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers) | `Google-Extended` (Gemini AI training opt-out token) |
| [Amazon — Amazonbot documentation](https://developer.amazon.com/support/amazonbot) | `Amazonbot` (AI training + Alexa/Rufus) |
| [Apple — About Applebot](https://support.apple.com/en-us/119829) | `Applebot-Extended` (Apple Intelligence training opt-out) |
| [Meta — Web Crawlers documentation](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers) | `meta-externalagent` (AI training), `meta-webindexer` (Meta AI search), `meta-externalfetcher`, `facebookexternalhit` |
| [Google Search Central — JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) | CSR vs SSR crawlability impact |
| [Google Search Central — Robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) | `noindex`/`nofollow` meta tag handling |

### Schema Depth
| Source | Purpose |
|---|---|
| [Google Search Central — Structured data overview](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) | JSON-LD implementation and Rich Result eligibility |
| [Schema.org](https://schema.org) | Vocabulary definitions for Organization, FAQPage, Article, Product, BreadcrumbList, etc. |

### A2A Handshakes
| Source | Purpose |
|---|---|
| [llmstxt.org — LLM Text Standard](https://llmstxt.org) | `llms.txt` and `llms-full.txt` specification and format |
| [Google A2A Protocol](https://google.github.io/A2A/) | `.well-known/agent.json` A2A discovery manifest format |

### Brand Authority
| Source | Purpose |
|---|---|
| Ahrefs (Dec 2025) — Brand mentions vs backlinks in AI visibility | 75K-brand study: brand mentions 3× stronger than backlinks for AI citations; YouTube and Reddit carry highest weight |
| [Google E-E-A-T — Authoritativeness & Trustworthiness](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | Framework for brand authority signals (About pages, contact info, trust markers) |

### Content E-E-A-T
| Source | Purpose |
|---|---|
| [Google E-E-A-T — Expertise & Authoritativeness](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | Authorship metadata, freshness dating, content depth |
| [Google Search Quality Rater Guidelines](https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf) | Thin content thresholds (< 1,000 words) |

### Intent Match
| Source | Purpose |
|---|---|
| [Aggarwal et al. (2023) — GEO paper, KDD 2024](https://arxiv.org/abs/2311.09735) | Conversational heading alignment with user query patterns |

### Structural GEO
| Source | Purpose |
|---|---|
| [Aggarwal et al. (2023) — GEO paper, KDD 2024](https://arxiv.org/abs/2311.09735) | Lists and tables as "AI Magnets" — highest-signal structural elements |
| [W3C HTML Living Standard — Content Sectioning](https://html.spec.whatwg.org/multipage/sections.html) | `<main>`, `<article>`, `<section>`, `<nav>`, `<aside>` semantics |

### Semantic Depth
| Source | Purpose |
|---|---|
| [Aggarwal et al. (2023) — GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735) | Semantic density, lexical diversity, and content length thresholds |

### Media Context
| Source | Purpose |
|---|---|
| [WCAG 2.1 — SC 1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html) | Descriptive alt-text requirements; critical for Vision-Language Model image understanding |

### Tone Alignment
| Source | Purpose |
|---|---|
| [Google E-E-A-T — Trust & Authoritativeness](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | Authoritative vocabulary vs weak qualifiers; AI trust score derivation |

## License

MIT License. See the `LICENSE` file for more details.

Developed by Eduardo Arana & Soda 🥤
