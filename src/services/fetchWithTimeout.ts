export async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeoAgenticAuditor/1.0 (compatible; LLM-Analyzer)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(id);
  }
}
