import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

/** Count approximate word count of a string */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export class CitabilityAudit implements IAuditStrategy {
  name = 'citability';

  /** Language-keyed answer-block indicator phrases. */
  private static readonly ANSWER_INDICATORS: Record<string, string[]> = {
    en: ['is defined as', 'refers to', 'means', 'is a', 'are a', 'represents', 'consists of', 'is known as'],
    pt: ['é definido como', 'refere-se a', 'significa', 'é um', 'é uma', 'são', 'representa', 'consiste em', 'conhecido como'],
    es: ['se define como', 'se refiere a', 'significa', 'es un', 'es una', 'son', 'representa', 'consiste en', 'conocido como'],
    fr: ['est défini comme', 'fait référence à', 'signifie', 'est un', 'est une', 'sont', 'représente', 'consiste en', 'connu comme'],
    de: ['wird definiert als', 'bezieht sich auf', 'bedeutet', 'ist ein', 'ist eine', 'sind', 'stellt', 'besteht aus', 'bekannt als'],
    it: ['è definito come', 'si riferisce a', 'significa', 'è un', 'è una', 'sono', 'rappresenta', 'consiste in', 'noto come'],
  };

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get().filter(p => p.length > 30);
    
    let answerBlockScore = 0;
    let statScore = 0;
    // Passage-length scoring: 134-167 words is the optimal extraction window
    // (Bortolato 2025 analysis of AI Overview passages; geo-seo-claude research)
    let optimalPassageCount = 0;
    let tooShortCount = 0;
    let tooLongCount = 0;
    // AEO: 40-60 word passages are optimal for featured snippet extraction
    let snippetPassageCount = 0;
    // GEO: Sourced statistics — "According to [Source]", "[Source] found/reports"
    let sourcedStatCount = 0;
    // GEO: Expert quote attribution — '"...," says [Name]', 'according to [Expert]'
    let expertQuoteCount = 0;

    const answerBlockIndicators = [
      ...(CitabilityAudit.ANSWER_INDICATORS[language] || []),
      ...(language !== 'en' ? CitabilityAudit.ANSWER_INDICATORS['en'] : [])
    ];
    const statIndicators = [/\b\d+(\.\d+)?\s*(%|percent)\b/i, /\b(increased|decreased)\b.*\b\d+\b/i, /\b\d+(k|m|b)\b/i];
    // Sourced attribution patterns (language-agnostic)
    const sourcedPatterns = [
      /according to\s+[A-Z]/i, /\b(study|research|report|survey|analysis)\s+(by|from)\s+/i,
      /\b(found|reports?|shows?|reveals?|indicates?)\s+that\b/i,
      /\([^)]*\d{4}[^)]*\)/,  // parenthetical year citations e.g. (Smith 2024)
    ];
    // Expert quote patterns
    const quotePatterns = [
      /[""][^""]{20,}[""],?\s*(says?|said|explains?|notes?|adds?|argues?|states?)\s+/i,
      /[""][^""]{20,}[""],?\s*according to\s+/i,
      /\bsays?\s+[A-Z][a-z]+\s+[A-Z]/,  // says Jane Smith
    ];

    // Check first content paragraph for definition block ("X is Y" opening)
    let hasDefinitionBlock = false;
    const firstContentP = paragraphs[0] || '';
    if (firstContentP.length > 40 && answerBlockIndicators.some(ind => firstContentP.toLowerCase().includes(ind))) {
      hasDefinitionBlock = true;
    }

    paragraphs.forEach(p => {
      const wc = wordCount(p);
      // Answer-block quality
      if (p.length > 50 && p.length < 350) {
        if (answerBlockIndicators.some(indicator => p.toLowerCase().includes(indicator))) {
          answerBlockScore += 20; 
        }
      }
      // Statistical density
      if (statIndicators.some(regex => regex.test(p))) {
        statScore += 15;
      }
      // Sourced statistics (stat + attribution in same paragraph)
      if (sourcedPatterns.some(r => r.test(p)) && statIndicators.some(r => r.test(p))) {
        sourcedStatCount++;
      }
      // Expert quotes
      if (quotePatterns.some(r => r.test(p))) {
        expertQuoteCount++;
      }
      // Passage-length analysis (50-200 words is usable; 134-167 is optimal)
      if (wc >= 134 && wc <= 167) {
        optimalPassageCount++;
      } else if (wc >= 50 && wc < 134) {
        tooShortCount++;
      } else if (wc > 167 && wc <= 200) {
        optimalPassageCount++; // still within acceptable extraction window
      } else if (wc > 200) {
        tooLongCount++;
      }
      // AEO snippet window (40-60 words)
      if (wc >= 40 && wc <= 60) {
        snippetPassageCount++;
      }
    });

    const passageLengthScore = Math.min(40, optimalPassageCount * 10);
    let finalScore = Math.min(60, answerBlockScore) + Math.min(40, statScore);
    // GEO evidence signals (sourced stats +40%, expert quotes +30% per Princeton GEO study)
    const evidenceScore = Math.min(15, sourcedStatCount * 5) + Math.min(10, expertQuoteCount * 5);
    const definitionBonus = hasDefinitionBlock ? 5 : 0;
    const snippetBonus = Math.min(5, snippetPassageCount * 2);

    finalScore = Math.min(100, finalScore + Math.min(10, passageLengthScore / 4) + evidenceScore + definitionBonus + snippetBonus);
    // Penalise if majority of passages are too long (hard for AI to extract)
    if (tooLongCount > optimalPassageCount + tooShortCount) {
      finalScore = Math.max(0, finalScore - 10);
    }

    let explanation = 'AI citation rate improves by +40% with sourced statistics, +30% with expert quotes, and +25% with authoritative tone (Princeton GEO study, KDD 2024). Optimal passage length: 134–167 words for AI extraction, 40–60 words for featured snippets.';
    let remediation = 'Structure each section as a standalone 134–167 word passage. Include "According to [Source]" citations, expert quotes with titles, and specific statistics with named sources.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for "AI Citability" (GEO/AEO 2026 standards).
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
High scores (80-100) require: dense definition patterns ("X is Y"), sourced statistics with named references ("According to [Source]", "[Study] found that..."), expert quotes with attribution ("says [Name], [Title]"), self-contained passages of 134-167 words, and 40-60 word snippet paragraphs for featured snippet extraction.
Princeton GEO research (KDD 2024): sourced citations boost visibility +40%, statistics +37%, expert quotes +30%, authoritative tone +25%. Keyword stuffing reduces visibility by -10%.
Sourced stats found: ${sourcedStatCount}. Expert quotes: ${expertQuoteCount}. Definition block: ${hasDefinitionBlock}. Snippet-ready passages (40-60 words): ${snippetPassageCount}.
Low scores (0-40) are for fluffy, vague marketing copy lacking facts or unsourced claims.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(paragraphs.join('\n').slice(0, 3000), systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    const passageLengthMsg = optimalPassageCount > 0
      ? `${optimalPassageCount} passage(s) in optimal 134–167 word extraction window.`
      : tooLongCount > 0
        ? `${tooLongCount} passage(s) exceed 200 words — too long for AI extraction.`
        : 'No passages found in the optimal 134–167 word AI extraction window.';

    return {
      score: Math.round(finalScore),
      status: finalScore >= 80 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        {
          message: finalScore >= 60 ? 'High density of answer blocks detected.' : 'Insufficient definition blocks.',
          explanation: hasLlmMessage ? explanation : 'Citations increase +40% with statistics and +115% with authority quotes (GEO paper, KDD 2024). Structure content as direct answers to common questions.',
          remediation: hasLlmMessage ? remediation : 'Use "X is Y" definition patterns. Back claims with specific numbers, percentages, and named sources.',
          source: { label: 'GEO: Generative Engine Optimization (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: `<p> elements (${paragraphs.length} analyzed)`
        },
        {
          message: sourcedStatCount > 0 ? `${sourcedStatCount} sourced statistic(s) with attribution found.` : 'No sourced statistics with attribution detected.',
          explanation: hasLlmMessage ? explanation : 'Statistics with named sources boost AI visibility by +37-40% (Princeton GEO study). "According to [Source], [stat]" patterns are 3x more citable than unsourced claims.',
          remediation: hasLlmMessage ? remediation : 'Add "According to [Source]" framing. Cite original research, include dates on all statistics. e.g. "According to Google\'s 2024 report, 70% of web traffic comes from mobile devices."',
          source: { label: 'GEO: Generative Engine Optimization — Citation & statistics methods (KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: '<p> — "According to...", "[Source] found/reports..." patterns'
        },
        {
          message: expertQuoteCount > 0 ? `${expertQuoteCount} expert quote(s) with attribution found.` : 'No expert quotes with attribution detected.',
          explanation: hasLlmMessage ? explanation : 'Named expert attribution increases citation likelihood by +30% (Princeton GEO study). AI systems prefer "says [Name], [Title] at [Organization]" patterns for trustworthiness.',
          remediation: hasLlmMessage ? remediation : 'Add expert quotes: \'"[insight]," says [Name], [Title] at [Organization].\' Include author bios with relevant credentials.',
          source: { label: 'GEO: Generative Engine Optimization — Expert quotation method (KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: '<p> — \'"...", says [Name]\' attribution patterns'
        },
        {
          message: passageLengthMsg,
          explanation: 'AI systems preferentially extract passages of 134–167 words that are self-contained and answer-first. Passages outside this window are cited ~30–40% less frequently.',
          remediation: 'Restructure key sections into 134–167 word standalone passages. Each should name its subject, open with a direct answer, and include at least one specific statistic.',
          source: { label: 'Bortolato (2025) – AI Overview passage length analysis; GEO paper (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: `<p> — ${optimalPassageCount} optimal (134–167w), ${snippetPassageCount} snippet-ready (40–60w), ${tooLongCount} oversized (>200w)`
        },
        {
          message: hasDefinitionBlock ? 'Definition block found in first paragraph — strong "What is X?" signal.' : 'No definition block in first paragraph.',
          explanation: hasLlmMessage ? explanation : 'AEO: Pages that open with a concise definition ("[Term] is [definition]") are significantly more likely to be extracted for "What is X?" queries and featured snippets.',
          remediation: hasLlmMessage ? remediation : 'Start your first paragraph with a clear definition: "[Topic] is [concise 1-sentence definition]. [Expanded explanation with key characteristics]."',
          source: { label: 'AEO Content Patterns — Definition block for "What is X?" queries', url: 'https://arxiv.org/abs/2311.09735' },
          location: 'First <p> element in content'
        }
      ]
    };
  }
}
