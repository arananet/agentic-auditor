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

  /** Filler phrases that suppress snippet extraction (Princeton GEO penalty side) */
  private static readonly FILLER_PHRASES = [
    /\bgreat question\b/i, /\bin this article\b/i, /\blet'?s dive in\b/i,
    /\bread more\b/i, /\bwithout further ado\b/i, /\bas you may know\b/i,
    /\bin this (blog|post|guide)\b/i, /\bwe'?ll (explore|discuss|cover|look at)\b/i,
    /\byou'?re in the right place\b/i, /\bkeep reading\b/i,
    /\blet me explain\b/i, /\bbefore we (begin|start|get started)\b/i,
    /\bhave you ever wondered\b/i, /\bare you looking for\b/i,
    /\bstay tuned\b/i, /\bscroll down\b/i, /\bclick here\b/i,
  ];

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

    // AEO: Filler phrase detection (Princeton GEO penalty side)
    let fillerPhraseCount = 0;
    const detectedFillers: string[] = [];
    paragraphs.forEach(p => {
      CitabilityAudit.FILLER_PHRASES.forEach(pattern => {
        const match = p.match(pattern);
        if (match) {
          fillerPhraseCount++;
          if (detectedFillers.length < 5) detectedFillers.push(match[0]);
        }
      });
    });

    // AEO: Answer-first positioning — direct answer in first 40-60 words after H1/H2
    let answerFirstCount = 0;
    let nonAnswerFirstCount = 0;
    $('h1, h2').each((_, el) => {
      let textAfter = '';
      let sibling = $(el).next();
      while (sibling.length > 0 && !sibling.is('h1, h2, h3') && wordCount(textAfter) < 80) {
        textAfter += ' ' + sibling.text().trim();
        sibling = sibling.next();
      }
      const first60Words = textAfter.trim().split(/\s+/).slice(0, 60).join(' ');
      if (first60Words.length < 20) return;
      // Check if the first 40-60 words contain an answer indicator
      const hasAnswer = answerBlockIndicators.some(ind => first60Words.toLowerCase().includes(ind));
      // Also check for filler phrases in the opening
      const hasFiller = CitabilityAudit.FILLER_PHRASES.some(pattern => pattern.test(first60Words));
      if (hasAnswer && !hasFiller) {
        answerFirstCount++;
      } else if (hasFiller || (!hasAnswer && wordCount(first60Words) >= 40)) {
        nonAnswerFirstCount++;
      }
    });

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
    // GEO evidence signals (sourced stats +40%, expert quotes +30% per Princeton GEO study)
    const evidenceScore = Math.min(15, sourcedStatCount * 5) + Math.min(10, expertQuoteCount * 5);
    const definitionBonus = hasDefinitionBlock ? 5 : 0;
    const snippetBonus = Math.min(5, snippetPassageCount * 2);
    // AEO: Filler phrase penalty — suppresses snippet extraction
    const fillerPenalty = Math.min(15, fillerPhraseCount * 3);
    // AEO: Answer-first positioning bonus
    const answerFirstBonus = Math.min(10, answerFirstCount * 3);
    const answerFirstPenalty = Math.min(5, nonAnswerFirstCount * 2);

    let finalScore = Math.min(60, answerBlockScore) + Math.min(40, statScore);
    finalScore = Math.min(100, finalScore + Math.min(10, passageLengthScore / 4) + evidenceScore + definitionBonus + snippetBonus + answerFirstBonus);
    // Penalise if majority of passages are too long (hard for AI to extract)
    if (tooLongCount > optimalPassageCount + tooShortCount) {
      finalScore = Math.max(0, finalScore - 10);
    }
    // AEO: Filler phrase and non-answer-first penalties
    finalScore = Math.max(0, finalScore - fillerPenalty - answerFirstPenalty);

    let explanation = 'AI citation rate improves by +40% with sourced statistics, +30% with expert quotes, and +25% with authoritative tone (Princeton GEO study, KDD 2024). Optimal passage length: 134–167 words for AI extraction, 40–60 words for featured snippets.';
    let remediation = 'Structure each section as a standalone 134–167 word passage. Include "According to [Source]" citations, expert quotes with titles, and specific statistics with named sources.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for "AI Citability" (GEO/AEO 2026 standards).
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
High scores (80-100) require: dense definition patterns ("X is Y"), sourced statistics with named references ("According to [Source]", "[Study] found that..."), expert quotes with attribution ("says [Name], [Title]"), self-contained passages of 134-167 words, and 40-60 word snippet paragraphs for featured snippet extraction.
Princeton GEO research (KDD 2024): sourced citations boost visibility +40%, statistics +37%, expert quotes +30%, authoritative tone +25%. Keyword stuffing reduces visibility by -10%.
Sourced stats found: ${sourcedStatCount}. Expert quotes: ${expertQuoteCount}. Definition block: ${hasDefinitionBlock}. Snippet-ready passages (40-60 words): ${snippetPassageCount}. Filler phrases detected: ${fillerPhraseCount}${detectedFillers.length > 0 ? ` (${detectedFillers.join(', ')})` : ''}. Answer-first headings: ${answerFirstCount}. Non-answer-first headings: ${nonAnswerFirstCount}.
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
          explanation: hasLlmMessage ? explanation : 'Citations increase +40% with sourced statistics and +30% with expert quotes (Princeton GEO study, KDD 2024). Structure content as direct answers to common questions.',
          remediation: hasLlmMessage ? remediation : 'Use "X is Y" definition patterns. Back claims with specific numbers, percentages, and named sources.',
          source: { label: 'Princeton GEO Study (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: `<p> elements (${paragraphs.length} analyzed)`
        },
        {
          message: sourcedStatCount > 0 ? `${sourcedStatCount} sourced statistic(s) with attribution found.` : 'No sourced statistics with attribution detected.',
          explanation: hasLlmMessage ? explanation : 'Statistics with named sources boost AI visibility by +37-40% (Princeton GEO study). "According to [Source], [stat]" patterns are 3x more citable than unsourced claims.',
          remediation: hasLlmMessage ? remediation : 'Add "According to [Source]" framing. Cite original research, include dates on all statistics. e.g. "According to Google\'s 2024 report, 70% of web traffic comes from mobile devices."',
          source: { label: 'Princeton GEO Study — Citation & statistics methods (KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: '<p> — "According to...", "[Source] found/reports..." patterns'
        },
        {
          message: expertQuoteCount > 0 ? `${expertQuoteCount} expert quote(s) with attribution found.` : 'No expert quotes with attribution detected.',
          explanation: hasLlmMessage ? explanation : 'Named expert attribution increases citation likelihood by +30% (Princeton GEO study). AI systems prefer "says [Name], [Title] at [Organization]" patterns for trustworthiness.',
          remediation: hasLlmMessage ? remediation : 'Add expert quotes: \'"[insight]," says [Name], [Title] at [Organization].\' Include author bios with relevant credentials.',
          source: { label: 'Princeton GEO Study — Expert quotation method (KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
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
        },
        {
          message: fillerPhraseCount === 0 ? 'No filler phrases detected — clean for snippet extraction.' : `${fillerPhraseCount} filler phrase(s) detected that suppress snippet extraction: ${detectedFillers.slice(0, 3).map(f => `"${f}"`).join(', ')}.`,
          explanation: hasLlmMessage ? explanation : 'Filler phrases like "Great question", "In this article", "Let\'s dive in" measurably reduce PAA/snippet selection. AI engines skip introductory fluff and may not extract the actual answer.',
          remediation: hasLlmMessage ? remediation : 'Remove filler phrases. Start every section with the direct answer, not preamble. Replace "In this article, we\'ll explore..." with the actual answer.',
          source: { label: 'Princeton GEO Study — Anti-patterns for AI citation (KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: '<p> — filler phrase patterns'
        },
        {
          message: answerFirstCount > 0 ? `${answerFirstCount} heading(s) followed by answer-first content in first 40–60 words.` : 'No answer-first positioning detected after H1/H2 headings.',
          explanation: hasLlmMessage ? explanation : 'Direct answer in the first 40–60 words after H1/H2 is a hard check for AEO. AI engines extract the opening text after a heading — if it\'s filler or context instead of the answer, the page loses the snippet.',
          remediation: hasLlmMessage ? remediation : 'After each H1/H2, immediately provide the direct answer in the first 40–60 words. Lead with the answer, follow with context and evidence.',
          source: { label: 'seoClarity — Answer-first positioning for AEO', url: 'https://www.seoclarity.net/blog/answer-engine-optimization' },
          location: '<h1>/<h2> → first 40–60 words of following content'
        }
      ]
    };
  }
}
