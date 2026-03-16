import { chromium, Browser } from 'playwright';

// Singleton browser: reused across all calls to avoid spawning 5+ Chromium processes per audit.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).then(browser => {
      browser.on('disconnected', () => { browserPromise = null; });
      return browser;
    });
  }
  return browserPromise;
}

/**
 * Fetch a page with a full headless browser (JS rendering, stealth patches).
 * Uses a singleton browser with isolated contexts per call.
 */
export async function fetchWithTimeout(url: string, timeoutMs: number = 45000): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  try {
    const page = await context.newPage();

    // Patch common bot-detection signals
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });

    page.setDefaultTimeout(timeoutMs);

    // Navigate and wait for network to settle — catches JS-rendered challenge pages
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {
      // networkidle can time out on heavy pages; fall through and check content
    });

    const html = await page.content();

    // A meaningful page has at least 500 chars of content
    if (html.length < 500) {
      throw new Error('Page returned empty or near-empty content (possible bot block)');
    }

    return html;
  } finally {
    await context.close();
  }
}

/**
 * Simple fetch for plain text files (llms.txt, robots.txt, agent.json).
 * No JS rendering needed — avoids wasting browser resources.
 */
export async function fetchTextFile(url: string, timeoutMs: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GEO-Auditor/1.0)',
        'Accept': 'text/plain, application/json, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
