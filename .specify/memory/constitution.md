# 🏛️ Geo Agentic Auditor Constitution

## Vision
The Geo Agentic Auditor ensures digital content is strictly optimized for Generative Engine Optimization (GEO). It evaluates readiness for LLMs, AI agents, and RAG pipelines.

## Principles
1. **AI-First Abstraction:** Audits must transcend naive regex pattern matching. Semantic analysis requires ML/NLP capabilities, or at least robust architectural boundaries that support them.
2. **Resilience & Scale:** All network requests must implement robust error handling (timeouts, redirects, retries). Data must be cached to minimize redundant compute.
3. **Continuous Grading:** Scoring must be granular and continuous, avoiding binary (0/100) traps, properly weighing content density, depth, and structural integrity.
4. **Architectural Elegance:** Code must adhere to SOLID principles. Hardcoded procedural checks are strictly prohibited. The system must use the Strategy Pattern for audit modules.

## Technical Mandates
- **TypeScript Strict Mode:** Mandatory.
- **Error Handling:** Graceful degradation on malformed HTML or network failures. LLM quota exhaustion must fall back to heuristics silently.
- **Performance:** Asynchronous execution with caching (LRU, 200-entry cap). Playwright browser singleton shared across requests.
- **Rendering:** Playwright headless Chromium for page rendering. `fetchTextFile()` (native fetch) for plain-text resources only.
- **Security:** Cloudflare Turnstile required on all audit submissions. SSRF protection on URL inputs. Per-IP rate limiting (10 req/min) on the API route.
- **LLM:** Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) exclusively. Free Tier = 10,000 neurons/day — always degrade gracefully.
