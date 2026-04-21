import { chromium, Browser } from 'playwright';

// Callback type for progress messages during WAF solving
type WafProgressFn = (msg: string) => void;

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
  // If the title or body contains bot-block signals AND the page has very little real content
  const hasSignal = signals.some(s => lower.includes(s));
  // Bot-block pages typically have no <main>, <article>, or real content structure
  const hasNoContent = !lower.includes('<main') && !lower.includes('<article');
  return hasSignal && hasNoContent;
}

/**
 * Identify which WAF vendor is blocking the page.
 * Returns 'none' if no WAF challenge is detected.
 */
export function detectWafVendor(html: string): 'cloudflare-turnstile' | 'cloudflare' | 'imperva' | 'datadome' | 'akamai' | 'generic' | 'none' {
  const lower = html.toLowerCase();
  if (lower.includes('challenges.cloudflare.com') || lower.includes('turnstile')) return 'cloudflare-turnstile';
  if (lower.includes('cf-browser-verification') || lower.includes('cf-challenge-running') || (lower.includes('just a moment') && lower.includes('cloudflare'))) return 'cloudflare';
  if (lower.includes('incapsula') || lower.includes('_incap_') || lower.includes('this site is temporarily unavailable')) return 'imperva';
  if (lower.includes('datadome')) return 'datadome';
  if (lower.includes('akamai') && lower.includes('access denied')) return 'akamai';
  if (isBotBlockPage(html)) return 'generic';
  return 'none';
}

/**
 * Common stealth init script shared by normal fetch and WAF solver.
 * Patches navigator.webdriver, plugins, chrome.runtime, permissions, etc.
 */
const STEALTH_INIT_SCRIPT = () => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const p = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ];
      Object.defineProperty(p, 'length', { value: 3 });
      return p;
    }
  });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  // @ts-ignore — emulate a real Chrome runtime object
  window.chrome = {
    runtime: { PlatformOs: { MAC: 'mac' }, connect: () => {}, sendMessage: () => {} },
    loadTimes: () => ({ requestTime: Date.now() / 1000 - 0.3, startLoadTime: Date.now() / 1000 - 0.2, commitLoadTime: Date.now() / 1000 }),
    csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: 312.4 }),
  };
  const origQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (params: any) =>
    params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
      : origQuery(params);
  delete (window as any).__playwright;
  delete (window as any).__pw_manual;
};

export interface WafSolverResult {
  html: string;
  screenshot: string;  // base64 PNG
}

/**
 * Attempt to solve a WAF/bot challenge using a dedicated headless="new" browser.
 *
 * headless:"new" uses Chrome's new headless mode which has full parity with headed mode,
 * passing requestAnimationFrame timing checks (Imperva) and Turnstile fingerprinting (Cloudflare).
 *
 * Returns { html, screenshot } if successful, or null if the challenge could not be bypassed.
 */
export async function solveWafChallenge(
  url: string,
  vendor: string,
  emit: WafProgressFn = () => {},
): Promise<WafSolverResult | null> {
  // Solver uses its own browser instance — headless:"new" mode, separate from the singleton
  let solverBrowser: Browser | null = null;

  try {
    emit(`[WAF-SOLVER] Launching stealth browser (headless=new) for ${vendor} challenge...`);

    solverBrowser = await chromium.launch({
      headless: true,
      channel: 'chromium',
      args: [
        '--headless=new',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const context = await solverBrowser.newContext({
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

    const page = await context.newPage();
    await page.addInitScript(STEALTH_INIT_SCRIPT);

    // ── Cloudflare-specific: intercept Turnstile requests and fake Origin/Referer ──
    if (vendor.startsWith('cloudflare')) {
      const targetOrigin = new URL(url).origin;
      await page.route('**challenges.cloudflare.com**', (route) => {
        const headers = {
          ...route.request().headers(),
          'origin': targetOrigin,
          'referer': url,
        };
        route.continue({ headers });
      });
    }

    emit(`[WAF-SOLVER] Navigating to ${url}...`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    const status = response?.status() ?? 0;
    emit(`[WAF-SOLVER] Initial response: HTTP ${status}`);

    // Wait for networkidle first
    await page.waitForLoadState('networkidle').catch(() => {});

    // ── Challenge resolution loop ──────────────────────────────────────
    const maxWaitMs = 45000;
    const pollInterval = 3000;
    const startTime = Date.now();
    let html = await page.content();
    let attempt = 0;

    while (isBotBlockPage(html) && (Date.now() - startTime) < maxWaitMs) {
      attempt++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // ── Cloudflare Turnstile: try clicking the checkbox if visible ──
      if (vendor === 'cloudflare-turnstile') {
        try {
          const frames = page.frames();
          for (const frame of frames) {
            if (frame.url().includes('challenges.cloudflare.com')) {
              const checkbox = await frame.$('input[type="checkbox"], .cf-turnstile-wrapper, #challenge-stage');
              if (checkbox) {
                emit(`[WAF-SOLVER] Found Turnstile checkbox — clicking (attempt ${attempt}, ${elapsed}s)...`);
                await checkbox.click().catch(() => {});
                await page.waitForTimeout(2000);
              }
            }
          }
        } catch { /* Turnstile iframe may not be accessible — continue polling */ }
      }

      // ── Imperva: check for the validation cookie ──
      if (vendor === 'imperva') {
        const cookies = await context.cookies();
        const impCookie = cookies.find(c => c.name.startsWith('_imp_apg_r_') || c.name.startsWith('incap_ses_') || c.name === 'visid_incap');
        if (impCookie) {
          emit(`[WAF-SOLVER] Imperva session cookie acquired (${impCookie.name}) — waiting for redirect...`);
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(2000);
        }
      }

      emit(`[WAF-SOLVER] Challenge still active — waiting (attempt ${attempt}, ${elapsed}s)...`);
      await page.waitForTimeout(pollInterval);
      await page.waitForLoadState('networkidle').catch(() => {});
      html = await page.content();

      const title = await page.title().catch(() => '');
      if (title && !title.toLowerCase().includes('just a moment') && !title.toLowerCase().includes('temporarily unavailable')) {
        if (!isBotBlockPage(html)) {
          break;
        }
      }
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (isBotBlockPage(html)) {
      const failScreenshot = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null);
      if (failScreenshot) {
        emit(`[WAF-SOLVER] Screenshot captured of blocked page for diagnostics.`);
      }
      emit(`[WAF-SOLVER] Challenge NOT resolved after ${totalElapsed}s — ${vendor} requires manual intervention or proxy.`);
      await context.close();
      return null;
    }

    // ── Challenge resolved! Extract real content ──
    emit(`[WAF-SOLVER] ✓ Challenge resolved in ${totalElapsed}s! Extracting page content...`);

    await page.evaluate(async () => {
      const step = Math.max(window.innerHeight, 800);
      const max = document.body.scrollHeight;
      for (let y = 0; y < max; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    }).catch(() => {});
    await page.waitForTimeout(1500);
    html = await page.content();

    const screenshotBuf = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null);
    const screenshot = screenshotBuf ? screenshotBuf.toString('base64') : '';
    emit(`[WAF-SOLVER] ✓ Real content extracted (${(html.length / 1024).toFixed(1)} KB) + screenshot captured.`);
    await context.close();
    return { html, screenshot };

  } catch (err: any) {
    emit(`[WAF-SOLVER] Solver error: ${err.message}`);
    return null;
  } finally {
    if (solverBrowser) {
      await solverBrowser.close().catch(() => {});
    }
  }
}

// Singleton browser: reused across all calls to avoid spawning 5+ Chromium processes per audit.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    }).then(browser => {
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
export async function fetchWithTimeout(url: string, timeoutMs: number = 45000): Promise<{ html: string; screenshot: string; initialScreenshot: string }> {
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
    await page.addInitScript(STEALTH_INIT_SCRIPT);

    page.setDefaultTimeout(timeoutMs);

    // Navigate — try domcontentloaded first (faster), then wait for network
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null);

    // If Imperva/Incapsula serves a JS challenge, it executes after DOMContentLoaded.
    // Wait for network to settle so challenge-redirect can complete.
    await page.waitForLoadState('networkidle').catch(() => {});

    // ── Capture INITIAL screenshot — this is what the browser first sees ──
    const initialBuf = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null);
    const initialScreenshot = initialBuf ? initialBuf.toString('base64') : '';

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

    // ── Capture FINAL screenshot of the page as the auditor sees it ──
    const screenshotBuf = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null);
    const screenshot = screenshotBuf ? screenshotBuf.toString('base64') : '';

    return { html, screenshot, initialScreenshot };
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
