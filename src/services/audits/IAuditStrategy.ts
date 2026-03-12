import { AuditResult } from '../../types';
import * as cheerio from 'cheerio';

export interface AuditContext {
  url: string;
  baseUrl: string;
  html: string;
  $: cheerio.CheerioAPI;
  headers: Headers;
}

export interface IAuditStrategy {
  name: string;
  execute(context: AuditContext): Promise<AuditResult>;
}
