import { chromium, Browser } from 'playwright';

/**
 * Detect if the page HTML is a WAF/bot-protection challenge page rather than real content.
 * Matches Imperva/Incapsula, Cloudflare, Datadome, Akamai, and generic "unavailable" pages.
 */
export function isBotBlockPage(html: string): boolean {
  const lower = html.toLowerCase();
  const signals = [
    'incapsula',                                     // Imperva Incapsula
    'this site is temporarily unavailable',           // Imperva block page
    '_incap_',                                        // Incapsula cookie/token
    'cf-browser-verification',                        // Cloudflare challenge
    'checking your browser before accessing',         // Cloudflare
    'just a moment',                                  // Cloudflare "Just a moment..."
    'cf-challenge-running',                           // Cloudflare challenge
    'datadome',                                       // Datadome bot protection
    'access denied',                                  // Generic WAF block
    'bot protection',                                 // Generic
    'please verify you are a human',                  // CAPTCHA
    'are you a robot',                                // CAPTCHA
  ];
  const hasSignal = signals.some(s => lower.includes(s));
  // Bot-block pages typically have no <main>, <article>, or real content structure
  const hasNoContent = !lower.includes('<main') && !lower.includes('<article');
  return hasSignal && hasNoContent;
}

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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  });

  try {
    const page = await context.newPage();

    // Patch common bot-detection signals (Imperva, Cloudflare, Akamai)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      // @ts-ignore
      window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
      // Remove automation-related properties
      delete (window as any).__playwright;
      delete (window as any).__pw_manual;
    });

    page.setDefaultTimeout(timeoutMs);

    // Navigate — try domcontentloaded first (faster), then wait for network
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);

    // If Imperva/Incapsula serves a JS challenge, it executes after DOMContentLoaded.
    // Wait for network to settle so challenge-redirect can complete.
    await page.waitForLoadState('networkidle').catch(() => {});

    // Some WAFs (Imperva, Datadome) inject a JS challenge that redirects after a delay.
    // Check if the page content looks like a block page and wait longer if so.
    let html = await page.content();
    if (isBotBlockPage(html)) {
      // Wait up to 8 seconds for JS challenge to resolve and redirect
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle').catch(() => {});
        html = await page.content();
        if (!isBotBlockPage(html)) break;
      }
    }

    // Auto-scroll to trigger lazy-rendered content (IntersectionObserver images, virtual grids).
    if (!isBotBlockPage(html)) {
      await page.evaluate(async () => {
        const step = Math.max(window.innerHeight, 800);
        const max = document.body.scrollHeight;
        for (let y = 0; y < max; y += step) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
      }).catch(() => { /* ignore scroll errors on restricted pages */ });
      // Brief pause for any final lazy images to mount after scroll
      await page.waitForTimeout(1500);
      html = await page.content();
    }

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
