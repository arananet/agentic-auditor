# Geo Agentic Auditor 🥤

> **High-fidelity readiness evaluation for the generative search era.**

Geo Agentic Auditor is a production-grade diagnostic tool designed to evaluate if a website is optimized for discovery and citation by Generative AI engines (ChatGPT, Claude, Perplexity, Gemini, and SearchGPT).

## Technical Architecture

- **Frontend**: Next.js 14, Tailwind CSS, Framer Motion.
- **Backend**: Next.js Route Handlers.
- **Security**: Cloudflare Turnstile (Bot Protection).
- **Deployment**: Configured for Railway.

## Security & Bot Protection

This project uses **Cloudflare Turnstile** to protect the auditing engine from automated abuse. 

### Required Environment Variables

To run this project or deploy it to Railway/GitHub, you must set the following secrets:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Your Cloudflare Turnstile Site Key. |
| `TURNSTILE_SECRET_KEY` | Your Cloudflare Turnstile Secret Key (Keep this secret!). |

### Setup Instructions

1.  Obtain your keys from the [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile).
2.  Add them to your `.env.local` file for local development.
3.  Add them as **Environment Variables** in your Railway project or **GitHub Secrets**.

## Intelligence Engine (The 11 GEO Skills)

The system analyzes domains across 11 critical dimensions adapted from the `geo-seo-claude` framework:

1.  **Citability**: Content "quotability" for LLM extraction.
2.  **Technical GEO**: Directives for AI crawlers (robots.txt).
3.  **Semantic Schema**: Identity resolution via JSON-LD.
4.  **LLMS_TXT**: AI-specific context handshake standard.
5.  **Brand Authority**: Entity recognition and external trust signals.
6.  **EEAT**: Experience, Expertise, Authoritativeness, and Trustworthiness.
7.  **Intent Match**: Alignment with conversational query patterns.
8.  **Structural GEO**: Semantic HTML5 and data presentation.
9.  **Semantic Depth**: Context volume for deep mapping.
10. **Media Context**: Vision-language model accessibility (Alt text).
11. **Tone Alignment**: Objective vs. Sensational sentiment.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Developed by **Eduardo Arana & Soda 🥤**.
