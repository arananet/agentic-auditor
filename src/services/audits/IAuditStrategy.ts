import { AuditResult } from '../../types';
import * as cheerio from 'cheerio';

export interface AuditContext {
  url: string;
  baseUrl: string;
  html: string;
  $: cheerio.CheerioAPI;
}

export interface IAuditStrategy {
  name: string;
  execute(context: AuditContext): Promise<AuditResult>;
}
