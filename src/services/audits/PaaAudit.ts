import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

/** Count approximate word count of a string */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export class PaaAudit implements IAuditStrategy {
  name = 'paa';

  /** Question-start patterns for multiple languages */
  private static readonly QUESTION_PATTERNS: Record<string, RegExp> = {
    en: /^(what|how|why|when|where|who|which|can|does|is|are|should|will|do)\b/i,
    es: /^(qué|cómo|por qué|cuándo|dónde|quién|cuál|puede|es|son|debe)\b/i,
    pt: /^(o que|como|por que|quando|onde|quem|qual|pode|é|são|deve)\b/i,
    fr: /^(que|comment|pourquoi|quand|où|qui|quel|peut|est|sont|doit)\b/i,
    de: /^(was|wie|warum|wann|wo|wer|welch|kann|ist|sind|soll)\b/i,
    it: /^(che|come|perché|quando|dove|chi|quale|può|è|sono|deve)\b/i,
  };

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
    const questionPattern = PaaAudit.QUESTION_PATTERNS[language] || PaaAudit.QUESTION_PATTERNS['en'];
    const enPattern = PaaAudit.QUESTION_PATTERNS['en'];

    // Collect H2/H3 headings that look like questions
    interface QAPair { question: string; answerWordCount: number; headingLevel: string; }
    const qaPairs: QAPair[] = [];

    $('h2, h3').each((_, el) => {
      const heading = $(el).text().trim();
      const tagName = (el as any).tagName?.toLowerCase() || $(el).prop('tagName')?.toLowerCase() || 'h2';
      const isQuestion = questionPattern.test(heading) || enPattern.test(heading) || /\?$/.test(heading);

      if (!isQuestion) return;

      // Get text content between this heading and the next heading
      let answerText = '';
      let sibling = $(el).next();
      while (sibling.length > 0 && !sibling.is('h1, h2, h3, h4, h5, h6')) {
        answerText += ' ' + sibling.text().trim();
        sibling = sibling.next();
      }

      const wc = wordCount(answerText);
      qaPairs.push({ question: heading, answerWordCount: wc, headingLevel: tagName });
    });

    // PAA shape: clusters of question-headings each followed by 30-50 word self-contained answer
    const paaShapedPairs = qaPairs.filter(qa => qa.answerWordCount >= 30 && qa.answerWordCount <= 50);
    const nearPaaPairs = qaPairs.filter(qa => qa.answerWordCount >= 20 && qa.answerWordCount <= 70);
    const totalQuestionHeadings = qaPairs.length;

    // Optimal cluster: 5-8 consecutive question headings
    let longestCluster = 0;
    let currentCluster = 0;
    $('h2, h3').each((_, el) => {
      const heading = $(el).text().trim();
      const isQuestion = questionPattern.test(heading) || enPattern.test(heading) || /\?$/.test(heading);
      if (isQuestion) {
        currentCluster++;
        longestCluster = Math.max(longestCluster, currentCluster);
      } else {
        currentCluster = 0;
      }
    });
    const hasOptimalCluster = longestCluster >= 5 && longestCluster <= 8;
    const hasGoodCluster = longestCluster >= 3;

    // Score calculation
    let score = 0;
    score += Math.min(25, totalQuestionHeadings * 4);
    score += Math.min(35, paaShapedPairs.length * 7);
    if (hasOptimalCluster) score += 25;
    else if (hasGoodCluster) score += 15;
    else if (longestCluster >= 2) score += 8;
    score += Math.min(15, nearPaaPairs.length * 3);

    let finalScore = Math.min(100, score);
    let explanation = 'People Also Ask (PAA) optimization requires clusters of 5–8 H2/H3 questions each followed by a self-contained 30–50 word answer.';
    let remediation = 'Create a Q&A section with 5–8 question headings. Each answer should be 30–50 words and self-contained.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const paaContext = `Question headings found: ${totalQuestionHeadings}. PAA-shaped (30-50w answer): ${paaShapedPairs.length}. Near-PAA (20-70w): ${nearPaaPairs.length}. Longest consecutive question cluster: ${longestCluster}. Optimal cluster (5-8): ${hasOptimalCluster}.\nQ&A pairs: ${qaPairs.slice(0, 10).map(qa => `"${qa.question}" → ${qa.answerWordCount}w`).join('; ')}`;
      const systemPrompt = `Evaluate the People Also Ask (PAA) optimization of this page for AEO 2026.
The page is in "${language}".
PAA-optimal content has:
1. Clusters of 5–8 consecutive H2/H3 question headings (matching Google's PAA box format)
2. Each question followed by a self-contained 30–50 word answer (the PAA snippet extraction window)
3. Answers that are direct and complete without needing surrounding context
4. Question phrasing that matches natural search queries ("How do I...", "What is...", "Why does...")
Score 100 for excellent PAA optimization. Score 0 for no question-heading structure.
Note: This differs from general FAQ detection — PAA specifically requires the 30–50 word answer format and clustered question structure.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(paaContext, systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    const tooLong = qaPairs.filter(qa => qa.answerWordCount > 50);
    const tooShort = qaPairs.filter(qa => qa.answerWordCount > 0 && qa.answerWordCount < 30);

    return {
      score: finalScore,
      status: finalScore >= 70 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        {
          message: paaShapedPairs.length > 0 ? `${paaShapedPairs.length} PAA-shaped Q&A pair(s) with 30–50 word answers.` : 'No PAA-shaped Q&A pairs found (need 30–50 word answers after question headings).',
          explanation: hasLlmMessage ? explanation : 'Google\'s PAA box extracts answers of 30–50 words. Each answer must be self-contained and directly answer the heading question.',
          remediation: hasLlmMessage ? remediation : 'After each question heading, write a 30–50 word direct answer. Start with the answer, not context.',
          source: { label: 'AEO – People Also Ask optimization', url: 'https://www.seoclarity.net/blog/answer-engine-optimization' },
          location: `<h2>/<h3> question headings (${totalQuestionHeadings} found)`
        },
        {
          message: hasOptimalCluster ? `Optimal PAA cluster found (${longestCluster} consecutive questions).` : hasGoodCluster ? `Good question cluster (${longestCluster} consecutive) — aim for 5–8.` : `Weak clustering: longest consecutive question run is ${longestCluster}.`,
          explanation: hasLlmMessage ? explanation : 'PAA boxes typically show 5–8 related questions. Grouping question-headings consecutively signals topical depth to AI engines.',
          remediation: hasLlmMessage ? remediation : 'Group 5–8 related question headings together in a dedicated Q&A section.',
          source: { label: 'Google PAA – Question clustering patterns', url: 'https://moz.com/blog/people-also-ask' },
          location: 'Consecutive H2/H3 question clusters'
        },
        ...(tooLong.length > 0 ? [{
          message: `${tooLong.length} question(s) with answers exceeding 50 words — may be truncated in PAA extraction.`,
          explanation: hasLlmMessage ? explanation : 'Answers over 50 words risk being cut off in PAA snippets. The first 30–50 words should deliver the complete answer.',
          remediation: hasLlmMessage ? remediation : `Shorten these answers to 30–50 words: ${tooLong.slice(0, 3).map(qa => `"${qa.question}" (${qa.answerWordCount}w)`).join('; ')}.`,
          source: { label: 'AEO Snippet Extraction Windows', url: 'https://www.seoclarity.net/blog/answer-engine-optimization' },
          location: '<h2>/<h3> → following paragraphs'
        }] : []),
        ...(tooShort.length > 0 ? [{
          message: `${tooShort.length} question(s) with answers under 30 words — too brief for PAA extraction.`,
          explanation: hasLlmMessage ? explanation : 'Answers under 30 words lack sufficient context for PAA snippet selection. Expand to 30–50 words with a complete, self-contained answer.',
          remediation: hasLlmMessage ? remediation : `Expand these answers to 30–50 words: ${tooShort.slice(0, 3).map(qa => `"${qa.question}" (${qa.answerWordCount}w)`).join('; ')}.`,
          source: { label: 'AEO Snippet Extraction Windows', url: 'https://www.seoclarity.net/blog/answer-engine-optimization' },
          location: '<h2>/<h3> → following paragraphs'
        }] : [])
      ]
    };
  }
}
