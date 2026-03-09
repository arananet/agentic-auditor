#  GEO Agentic Auditor

> **The high-fidelity readiness check for the Generative Era.**

Developed by **Eduardo Arana** and **Soda 🥤**.

##  Project Vision

The **Agentic Auditor** is a production-grade diagnostic tool designed to evaluate if a website is optimized for discovery and citation by Generative AI engines (ChatGPT, Claude, Perplexity, Gemini, and SearchGPT). 

Unlike traditional SEO, which focuses on search engine ranking, this auditor measures **Generative Engine Optimization (GEO)**—ensuring your digital footprint is machine-readable, authoritative, and "agent-friendly."

##  Intelligence Engine (The GEO Spectrum)

The auditing logic is powered by a suite of **11 specialized GEO Skills** adapted from the [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) framework. The system orchestrates these skills to analyze a domain across five critical dimensions:

### 1. AI Citability (`geo-citability`)
Analyzes content blocks for "quotability." We evaluate passage self-containment, statistical density, and the presence of direct, authoritative answer blocks that LLMs prefer for citations.

### 2. Brand Authority & Mentions (`geo-brand-mentions`)
Scans third-party signals across the web (Reddit, Wikipedia, LinkedIn) to score entity recognition. This prevents "Entity Collision" and ensures AI models correctly distinguish the brand.

### 3. Technical GEO Infrastructure (`geo-crawlers` + `geo-llmstxt`)
Checks for AI-specific technical signals:
- **llms.txt**: Verification of the new machine-readable context standard.
- **robots.txt**: Explicit directives for AI crawlers (GPTBot, PerplexityBot).
- **Crawlability**: Ensuring content isn't trapped behind client-side rendering walls.

### 4. Content E-E-A-T (`geo-content`)
Evaluates **Experience, Expertise, Authoritativeness, and Trustworthiness**. This assesses author credentials, source citations, and content freshness—the signals that modern AI search uses to weigh reliability.

### 5. Semantic Schema (`geo-schema`)
Validates `application/ld+json` structured data. We specifically hunt for GEO-critical types: `Person`, `Organization`, `FAQPage`, and `ProfessionalService` to build a deterministic map for engines.

##  Technical Architecture

This project is a high-performance **Next.js 14** application with a separated concern architecture:

- **Frontend (`/src/components`)**: Modular React components styled with a high-contrast terminal aesthetic (Amber/Neon Green).
- **Backend (`/src/app/api/audit`)**: Route Handlers acting as the controller layer.
- **Services (`/src/services`)**: Business logic isolation. The `AuditorService` handles the heavy lifting of DOM traversal and HTTP probes using `cheerio`.
- **Externals**: Optimized for **Railway** deployment using Webpack externals for server-side processing libraries.

##  Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/arananet/agentic-auditor.git

# 2. Install dependencies
npm install

# 3. Launch the terminal
npm run dev
```

##  Deployment

Configured for instant deployment on **Railway** via the included `Dockerfile` and `railway.json`.
