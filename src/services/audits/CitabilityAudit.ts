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

    const answerBlockIndicators = [
      ...(CitabilityAudit.ANSWER_INDICATORS[language] || []),
      ...(language !== 'en' ? CitabilityAudit.ANSWER_INDICATORS['en'] : [])
    ];
    const statIndicators = [/\b\d+(\.\d+)?\s*(%|percent)\b/i, /\b(increased|decreased)\b.*\b\d+\b/i, /\b\d+(k|m|b)\b/i];

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
    });

    const passageLengthScore = Math.min(40, optimalPassageCount * 10);
    let finalScore = Math.min(60, answerBlockScore) + Math.min(40, statScore);
    // Blend in passage-length signal (up to ±10 points)
    finalScore = Math.min(100, finalScore + Math.min(10, passageLengthScore / 4));
    // Penalise if majority of passages are too long (hard for AI to extract)
    if (tooLongCount > optimalPassageCount + tooShortCount) {
      finalScore = Math.max(0, finalScore - 10);
    }

    let explanation = 'AI citation rate improves by up to 40% with statistics and 115% with authority quotes. Optimal passage length is 134–167 words (self-contained, fact-rich, answer-first).';
    let remediation = 'Structure each section as a standalone 134–167 word passage that answers one question directly in the first sentence, followed by supporting data.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for "AI Citability" (GEO 2026 standards).
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
High scores (80-100) require: dense definition patterns ("X is Y" or the ${language} equivalent), hard statistical metrics, passages of 134-167 words that are self-contained and answer-first, and original data.
Low scores (0-40) are for fluffy, vague marketing copy lacking facts or oversized wall-of-text paragraphs AI cannot extract.
Research: adding statistics boosts citation by +40%, adding authority quotes by +115% (Princeton/Georgia Tech/IIT Delhi, GEO paper KDD 2024). Provide specific feedback.`;
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
          message: passageLengthMsg,
          explanation: 'AI systems preferentially extract passages of 134–167 words that are self-contained and answer-first. Passages outside this window are cited ~30–40% less frequently.',
          remediation: 'Restructure key sections into 134–167 word standalone passages. Each should name its subject, open with a direct answer, and include at least one specific statistic.',
          source: { label: 'Bortolato (2025) – AI Overview passage length analysis; GEO paper (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: `<p> — ${optimalPassageCount} optimal (134–167w), ${tooLongCount} oversized (>200w)`
        }
      ]
    };
  }
}
