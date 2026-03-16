import path from 'path';
import { AuditResponse } from '../../src/types';
import { renderHtml } from './html';

export async function renderPdf(
  url: string,
  report: AuditResponse,
  outputPath: string,
): Promise<void> {
  // Playwright is already a project dependency — reuse it.
  // Import dynamically so the CLI doesn't force a Playwright load when only --format=md.
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const html = renderHtml(url, report);

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
