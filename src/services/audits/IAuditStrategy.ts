import { AuditResult } from '../../types';
import * as cheerio from 'cheerio';

export interface AuditContext {
  url: string;
  baseUrl: string;
  html: string;
  $: cheerio.CheerioAPI;
  /** ISO 639-1 language code detected from <html lang> or content heuristics (e.g. 'en', 'pt', 'es'). */
  language: string;
}

export interface IAuditStrategy {
  name: string;
  execute(context: AuditContext): Promise<AuditResult>;
}
