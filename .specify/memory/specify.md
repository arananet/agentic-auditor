# 🎯 Geo Agentic Auditor - Specification

## Core Requirements
Develop a fast, edge-native, continuous heuristic and LLM-accelerated auditing tool designed specifically to evaluate website readiness for Generative Engine Optimization (GEO).

## Features
- **Deterministic Heuristics:** The system must use Cheerio to parse DOM elements (Lists, Tables, Schema, Meta tags) to generate continuous density scores rather than binary outcomes.
- **LLM Acceleration:** If Cloudflare Workers AI is configured, the system must seamlessly upgrade from heuristics to deep semantic analysis using Llama-3.1-8b-instruct for intent and sentiment evaluation.
- **Client-Side Export:** Provide a high-fidelity Print-to-PDF technical report directly from the browser.
- **Bot Protection:** Implement strict Turnstile verification on the backend to prevent abuse.

## Technical Stack
- Next.js (Route Handlers, Server Components)
- Cloudflare Workers AI (Llama-3.1-8b)
- TailwindCSS
- Cheerio (DOM Parsing)
