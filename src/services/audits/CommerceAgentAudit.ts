import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';
import { fetchTextFile } from '../fetchWithTimeout';

/**
 * CommerceAgentAudit — Agentic Commerce readiness (2026).
 *
 * GEO/AEO answers "can an AI engine cite this site?". Agentic commerce asks the
 * next question: "can an AI agent transact with this site on a user's behalf?".
 * This audit evaluates readiness for the four emerging interoperability stacks:
 *
 *   • ACP — Agentic Commerce Protocol (OpenAI + Stripe + Meta): product feeds +
 *           a 5-endpoint REST checkout/payment flow. ChatGPT Instant Checkout.
 *   • AP2 — Agent Payments Protocol (Google + 60 payment partners): merchants
 *           publish an A2A AgentCard advertising payment capability and expose a
 *           Cart Mandate endpoint.
 *   • MCP — Model Context Protocol: servers advertise a card at
 *           /.well-known/mcp.json (SEP-1649) so agents can discover catalog /
 *           cart / checkout tools before connecting.
 *   • UCP — Universal Commerce Protocol (Google, NRF 2026): a REST/JSON-RPC
 *           umbrella standard that declares a capability profile and builds on
 *           AP2, A2A and MCP.
 *
 * All four sit on top of machine-readable, *transactable* Product/Offer data
 * (price, currency, availability, identifiers, return/shipping policy), so that
 * substrate is scored directly from the page's JSON-LD.
 */
export class CommerceAgentAudit implements IAuditStrategy {
  name = 'commerceAgent';

  async execute({ baseUrl, $ }: AuditContext): Promise<AuditResult> {
    let score = 0;
    const findings: string[] = [];

    // ── MCP server card — /.well-known/mcp.json (SEP-1649) ──────────────── (20)
    let hasMcp = false;
    let mcpTools = 0;
    const mcpJson = await this.probeJson(`${baseUrl}/.well-known/mcp.json`);
    if (mcpJson) {
      hasMcp = true;
      score += 12;
      // Count advertised tools/capabilities so we can tell a stub card from a real one.
      const tools = mcpJson.tools || mcpJson.capabilities?.tools || mcpJson.primitives?.tools;
      mcpTools = Array.isArray(tools) ? tools.length : (tools && typeof tools === 'object' ? Object.keys(tools).length : 0);
      if (mcpTools > 0) { score += 8; findings.push(`MCP server card exposes ${mcpTools} tool(s) for agent discovery.`); }
      else findings.push('MCP server card found but advertises no tools — agents cannot discover capabilities.');
    } else {
      findings.push('No MCP server card at /.well-known/mcp.json — agents cannot auto-discover your tools.');
    }

    // ── AP2 / A2A AgentCard with payment capability ─────────────────────── (20)
    // AP2 reuses the A2A AgentCard; the newer path is agent-card.json, the
    // original A2A path is agent.json.
    let hasAgentCard = false;
    let hasPaymentCapability = false;
    const agentCardRaw =
      (await this.probeText(`${baseUrl}/.well-known/agent-card.json`)) ||
      (await this.probeText(`${baseUrl}/.well-known/agent.json`));
    if (agentCardRaw) {
      hasAgentCard = true;
      score += 10;
      // AP2 capability shows up as payment / mandate / cart / checkout skills or
      // protocol extensions inside the card.
      hasPaymentCapability = /\b(ap2|payment[_-]?mandate|cart[_-]?mandate|intent[_-]?mandate|x402|checkout|payment)\b/i.test(agentCardRaw);
      if (hasPaymentCapability) { score += 10; findings.push('A2A AgentCard advertises payment/checkout capability (AP2-ready).'); }
      else findings.push('A2A AgentCard found but no AP2 payment capability declared (no mandate/checkout skill).');
    } else {
      findings.push('No A2A AgentCard (/.well-known/agent-card.json) — required for AP2 agent payments.');
    }

    // ── UCP capability profile ──────────────────────────────────────────── (15)
    let hasUcp = false;
    const ucpJson =
      (await this.probeJson(`${baseUrl}/.well-known/ucp.json`)) ||
      (await this.probeJson(`${baseUrl}/.well-known/ucp`));
    if (ucpJson) {
      hasUcp = true;
      score += 8;
      const caps = ucpJson.capabilities || ucpJson.profile?.capabilities || ucpJson.supported;
      const capCount = Array.isArray(caps) ? caps.length : (caps && typeof caps === 'object' ? Object.keys(caps).length : 0);
      if (capCount > 0) { score += 7; findings.push(`UCP profile declares ${capCount} capability/capabilities for autonomous discovery.`); }
      else findings.push('UCP profile found but declares no capabilities.');
    } else {
      findings.push('No UCP capability profile (/.well-known/ucp.json) — not discoverable by UCP platforms.');
    }

    // ── ACP discovery signal ────────────────────────────────────────────── (5)
    // ACP product feeds are pushed to OpenAI rather than hosted, so on-site
    // discovery is still emerging; probe the candidate well-known marker.
    let hasAcpSignal = false;
    const acpJson =
      (await this.probeJson(`${baseUrl}/.well-known/agentic-commerce.json`)) ||
      (await this.probeJson(`${baseUrl}/.well-known/acp.json`));
    if (acpJson) {
      hasAcpSignal = true;
      score += 5;
      findings.push('ACP discovery manifest present (agentic-commerce.json).');
    } else {
      findings.push('No ACP discovery manifest — ChatGPT Instant Checkout relies on a pushed product feed + checkout endpoints.');
    }

    // ── Transactable Product/Offer substrate (JSON-LD) ─────────────────── (40)
    const products = this.collectProducts($);
    const substrate = this.scoreProductSubstrate(products);
    score += substrate.points;
    findings.push(...substrate.findings);

    score = Math.min(100, score);

    // ── Optional LLM narrative (kept heuristic-weighted — discovery is factual) ──
    let finalScore = score;
    let explanation = 'Agentic commerce requires machine-discoverable agent endpoints (ACP, AP2, MCP, UCP) sitting on transactable Product/Offer data so AI agents can purchase on a user\'s behalf.';
    let remediation = 'Publish an A2A AgentCard with payment capability (AP2), an MCP server card at /.well-known/mcp.json, a UCP capability profile, and complete Product/Offer JSON-LD (price, currency, availability, GTIN/SKU, return policy).';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const context = `ACP signal: ${hasAcpSignal}. AP2 A2A AgentCard: ${hasAgentCard} (payment capability: ${hasPaymentCapability}). MCP server card: ${hasMcp} (${mcpTools} tools). UCP profile: ${hasUcp}. Product schemas found: ${products.length}. Substrate findings: ${substrate.findings.join(' ')}. Heuristic score: ${score}.`;
      const systemPrompt = `Evaluate a site's readiness for AGENTIC COMMERCE in 2026 — whether an AI agent can transact on a user's behalf. Four interoperability standards matter: 1) ACP (Agentic Commerce Protocol, OpenAI+Stripe) — product feeds + REST checkout powering ChatGPT Instant Checkout. 2) AP2 (Agent Payments Protocol, Google) — merchants publish an A2A AgentCard advertising payment capability and expose Cart/Payment Mandate endpoints. 3) MCP (Model Context Protocol) — a server card at /.well-known/mcp.json advertising catalog/cart/checkout tools. 4) UCP (Universal Commerce Protocol, Google) — a capability profile built on AP2/A2A/MCP. All depend on transactable Product/Offer structured data: price, priceCurrency (ISO 4217), availability, item identifiers (GTIN/MPN/SKU), and hasMerchantReturnPolicy/shippingDetails. Score 100 only if the site exposes agent endpoints AND complete transactable product data. Score 0 if it is a normal site with no agent commerce signals. Be strict: discovery files that are absent cannot be assumed.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(context, systemPrompt);
      if (llmResult) {
        finalScore = Math.round((score * 0.6) + (llmResult.score * 0.4));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        {
          message: hasMcp ? `MCP server card found (${mcpTools} tool${mcpTools !== 1 ? 's' : ''}).` : 'No MCP server card at /.well-known/mcp.json.',
          explanation: hasLlmMessage ? explanation : 'MCP server cards let an AI client issue a single GET to /.well-known/mcp.json and discover catalog/cart/checkout tools, transports, and auth before connecting.',
          remediation: hasLlmMessage ? remediation : 'Expose an MCP server and publish /.well-known/mcp.json listing your commerce tools (search_products, get_price, create_cart, checkout).',
          source: { label: 'MCP – Server Cards / .well-known discovery (SEP-1649)', url: 'https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649' },
          location: `${baseUrl}/.well-known/mcp.json`,
        },
        {
          message: hasAgentCard ? (hasPaymentCapability ? 'A2A AgentCard advertises AP2 payment capability.' : 'A2A AgentCard present but no AP2 payment capability.') : 'No A2A AgentCard for AP2.',
          explanation: hasLlmMessage ? explanation : 'AP2 (Agent Payments Protocol) lets agents pay on a user\'s behalf via signed Intent/Cart/Payment Mandates. Merchants advertise capability in an A2A AgentCard and expose a Cart Mandate endpoint.',
          remediation: hasLlmMessage ? remediation : 'Publish /.well-known/agent-card.json declaring a payment/checkout skill, and implement a Cart Mandate endpoint that accepts a Payment Mandate.',
          source: { label: 'AP2 – Agent Payments Protocol Specification', url: 'https://ap2-protocol.org/specification/' },
          location: `${baseUrl}/.well-known/agent-card.json`,
        },
        {
          message: hasUcp ? 'UCP capability profile detected.' : 'No UCP capability profile.',
          explanation: hasLlmMessage ? explanation : 'UCP (Universal Commerce Protocol, announced at NRF 2026) is Google\'s umbrella standard over AP2/A2A/MCP. Merchants declare a capability profile so platforms can discover them autonomously.',
          remediation: hasLlmMessage ? remediation : 'Publish a UCP capability profile (REST/JSON-RPC) declaring supported commerce primitives; integrate via Google Merchant Center UCP onboarding.',
          source: { label: 'UCP – Universal Commerce Protocol', url: 'https://ucp.dev/' },
          location: `${baseUrl}/.well-known/ucp.json`,
        },
        {
          message: hasAcpSignal ? 'ACP discovery manifest present.' : 'No on-site ACP signal (feed is pushed to the platform).',
          explanation: hasLlmMessage ? explanation : 'ACP (Agentic Commerce Protocol, OpenAI+Stripe) powers ChatGPT Instant Checkout via a pushed product feed plus a 5-endpoint REST checkout flow (create/update/get/complete/cancel session).',
          remediation: hasLlmMessage ? remediation : 'Submit a compliant product feed (title ≤150 chars, ISO 4217 price, availability, checkout eligibility) and implement the ACP checkout endpoints via Stripe or a direct integration.',
          source: { label: 'ACP – Agentic Commerce Protocol', url: 'https://www.agenticcommerce.dev/' },
          location: `${baseUrl}/.well-known/agentic-commerce.json`,
        },
        {
          message: substrate.summary,
          explanation: hasLlmMessage ? explanation : 'Every agentic-commerce protocol depends on transactable Product/Offer data: a price with an ISO 4217 currency, availability, item identifiers (GTIN/MPN/SKU), and return/shipping policy. Without it an agent cannot confidently buy.',
          remediation: hasLlmMessage ? remediation : 'Add Product JSON-LD with an Offer (price, priceCurrency, availability), gtin/mpn/sku identifiers, hasMerchantReturnPolicy, and shippingDetails.',
          source: { label: 'Schema.org – Offer', url: 'https://schema.org/Offer' },
          location: '<script type="application/ld+json"> Product/Offer',
        },
      ],
    };
  }

  /** SSRF-safe JSON probe — returns parsed object or null on any failure. */
  private async probeJson(url: string): Promise<any | null> {
    const text = await this.probeText(url);
    if (!text || !text.trim().startsWith('{')) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  /** SSRF-safe text probe — returns body or null on any failure. */
  private async probeText(url: string): Promise<string | null> {
    try {
      const text = await fetchTextFile(url, 8000);
      return text && !text.toLowerCase().includes('<!doctype') ? text : null;
    } catch {
      return null;
    }
  }

  /** Walk all JSON-LD blocks and collect nodes whose @type includes Product. */
  private collectProducts($: AuditContext['$']): any[] {
    const out: any[] = [];
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const type = node['@type'];
      const types = Array.isArray(type) ? type : type ? [type] : [];
      if (types.some((t: string) => typeof t === 'string' && t.toLowerCase().includes('product'))) out.push(node);
      if (node['@graph']) walk(node['@graph']);
      for (const k of Object.keys(node)) {
        if (k !== '@graph' && node[k] && typeof node[k] === 'object') walk(node[k]);
      }
    };
    scripts.forEach(s => { try { walk(JSON.parse(s)); } catch { /* ignore malformed JSON-LD */ } });
    return out;
  }

  /** Score the transactable completeness of Product/Offer data (max 40). */
  private scoreProductSubstrate(products: any[]): { points: number; findings: string[]; summary: string } {
    if (products.length === 0) {
      return { points: 0, findings: ['No Product schema found — nothing for an agent to transact on.'], summary: 'No transactable Product/Offer data found.' };
    }

    const firstOffer = (p: any) => {
      const o = p.offers || p.offer;
      return Array.isArray(o) ? o[0] : o;
    };
    const anyWith = (pred: (p: any, o: any) => boolean) => products.some(p => pred(p, firstOffer(p) || {}));

    let points = 5; // has at least one Product
    const findings: string[] = [`Found ${products.length} Product schema node(s).`];
    const present: string[] = [];
    const missing: string[] = [];

    const hasPrice = anyWith((_p, o) => o.price != null || o.lowPrice != null || o.priceSpecification != null);
    const hasCurrency = anyWith((_p, o) => !!o.priceCurrency || !!o.priceSpecification?.priceCurrency);
    if (hasPrice && hasCurrency) { points += 10; present.push('price+currency'); }
    else missing.push('price/priceCurrency (ISO 4217)');

    const hasAvailability = anyWith((_p, o) => !!o.availability);
    if (hasAvailability) { points += 7; present.push('availability'); } else missing.push('availability');

    const hasIdentifier = anyWith((p, _o) => !!(p.gtin || p.gtin13 || p.gtin12 || p.gtin8 || p.mpn || p.sku || p.productID));
    if (hasIdentifier) { points += 7; present.push('GTIN/MPN/SKU'); } else missing.push('item identifier (GTIN/MPN/SKU)');

    const hasReturns = anyWith((p, o) => !!(p.hasMerchantReturnPolicy || o.hasMerchantReturnPolicy));
    const hasShipping = anyWith((_p, o) => !!o.shippingDetails);
    if (hasReturns || hasShipping) { points += 6; present.push('return/shipping policy'); } else missing.push('return/shipping policy');

    const hasRatings = anyWith((p, _o) => !!(p.aggregateRating || p.review));
    if (hasRatings) { points += 5; present.push('ratings/reviews'); } else missing.push('aggregateRating/review');

    if (present.length) findings.push(`Offer completeness present: ${present.join(', ')}.`);
    if (missing.length) findings.push(`Offer gaps: ${missing.join(', ')}.`);

    const summary = missing.length === 0
      ? 'Fully transactable Product/Offer data (price, availability, identifiers, policy, ratings).'
      : `Product/Offer data incomplete — missing: ${missing.join(', ')}.`;

    return { points: Math.min(40, points), findings, summary };
  }
}
