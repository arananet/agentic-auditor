import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class SemanticAudit implements IAuditStrategy {
  name = 'semantic';

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
    const textLength = $('body').text().trim().replace(/\s+/g, ' ').length;
    const hasSufficientLength = textLength > 1500;
    
    const allWords = $('body').text().toLowerCase().split(/\W+/).filter(w => w.length > 0);
    // Use a sample window (first 500 words) to avoid Heaps' law penalizing long content
    const sampleWords = allWords.slice(0, 500);
    const uniqueWords = new Set(sampleWords);
    const lexicalDiversity = sampleWords.length > 0
      ? Math.min(50, Math.floor((uniqueWords.size / sampleWords.length) * 100))
      : 0;

    // Keyword stuffing detection (Princeton GEO: stuffing reduces AI visibility by ~10%)
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','it','as','be','was','are','were','been','has','have','had','do','does','did','will','would','shall','should','can','could','may','might','this','that','these','those','i','you','he','she','we','they','me','him','her','us','them','my','your','his','its','our','their','not','no','all','each','every','both','few','more','most','other','some','such','only','own','same','so','than','too','very','just','about','up','out','if','then','also','how','when','where','what','which','who','whom','why','new','first','last','one','two','de','la','el','en','que','un','una','los','las','del','es','por','con','se','o','e','da','do','no','na','um','uma','dos','das','le','les','des','du','et','est','au','ce','qui','ne','sur','pas','il','di','che','per','non','si','lo','ha','der','die','das','und','den','von','mit','ist','dem','ein','zu','im','für']);
    const contentWords = allWords.filter(w => w.length > 2 && !stopWords.has(w));
    const wordFreq = new Map<string, number>();
    for (const w of contentWords) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
    const totalContentWords = contentWords.length;
    const sortedWords = Array.from(wordFreq.entries()).sort((a, b) => b[1] - a[1]);
    const topOverusedWords = sortedWords
      .filter(([, count]) => totalContentWords > 0 && (count / totalContentWords) > 0.03)
      .slice(0, 5);
    const isKeywordStuffed = topOverusedWords.length >= 2;
    const stuffingPenalty = isKeywordStuffed ? Math.min(10, topOverusedWords.length * 3) : 0;
    
    const lengthScore = hasSufficientLength ? 50 : Math.floor((textLength / 1500) * 50);
    let totalScore = Math.max(0, lengthScore + lexicalDiversity - stuffingPenalty);
    let finalScore = totalScore;
    let explanation = 'High vocabulary diversity signals expert-level content rather than keyword stuffing.';
    let remediation = 'Use synonyms, deep industry terms, and LSI keywords natively.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the semantic depth and lexical diversity of the following text snippet.
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
High scores (80-100) require expert-level vocabulary, deep context, and substantial topic coverage in ${language}.
Low scores (0-40) are given to repetitive, thin, generic, or keyword-stuffed text. Provide feedback on the semantic richness. Lexical Diversity Ratio: ${lexicalDiversity}%.
Keyword stuffing detected: ${isKeywordStuffed}. Overused terms: ${topOverusedWords.map(([w, c]) => `"${w}" ${((c / totalContentWords) * 100).toFixed(1)}%`).join(', ') || 'none'}.
Princeton GEO research (KDD 2024) found keyword stuffing reduces AI engine visibility by ~10%.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback($('body').text().replace(/\s+/g, ' ').slice(0, 3000), systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: lengthScore >= 40 ? 'Adequate semantic length.' : 'Content length too short.', explanation: hasLlmMessage ? explanation : 'LLMs require dense context windows to properly index an entity.', remediation: hasLlmMessage ? remediation : 'Ensure core landing pages exceed 300 words.', source: { label: 'GEO: Generative Engine Optimization (Aggarwal et al., 2023)', url: 'https://arxiv.org/abs/2311.09735' }, location: `document.body (${textLength} chars)` },
        { message: `Lexical Diversity Score: ${lexicalDiversity}/50`, explanation: hasLlmMessage ? explanation : 'High vocabulary diversity signals expert-level content rather than keyword stuffing.', remediation: hasLlmMessage ? remediation : 'Use synonyms and LSI (Latent Semantic Indexing) keywords natively.', source: { label: 'GEO: Generative Engine Optimization (Aggarwal et al., 2023)', url: 'https://arxiv.org/abs/2311.09735' }, location: 'document.body — first 500-word sample' },
        { message: isKeywordStuffed ? `Keyword stuffing detected: ${topOverusedWords.map(([w, c]) => `"${w}" ${((c / totalContentWords) * 100).toFixed(1)}%`).join(', ')} (-${stuffingPenalty}pt penalty).` : 'No keyword stuffing detected.', explanation: hasLlmMessage ? explanation : 'The Princeton GEO study (KDD 2024) found keyword stuffing reduces AI engine visibility by ~10%.', remediation: hasLlmMessage ? remediation : 'Replace overused terms with synonyms and natural phrasing. Non-stopword frequency above 3% signals potential stuffing.', source: { label: 'Princeton GEO Study – Keyword Stuffing Impact (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' }, location: `Content words analyzed: ${totalContentWords}` }
      ]
    };
  }
}
