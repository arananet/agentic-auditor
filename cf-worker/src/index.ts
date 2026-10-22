import { Container, getContainer } from "@cloudflare/containers";

/**
 * Cloudflare Containers wrapper for Geo Agentic Auditor.
 * The application is the existing Next.js standalone server with
 * Playwright/Chromium baked into the image (root Dockerfile); this
 * Worker only routes traffic to it.
 *
 * Runtime secrets the app needs (CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_API_TOKEN, TURNSTILE_SECRET_KEY) are provided as
 * Cloudflare secrets at deploy time, never from this repo.
 */
export class GeoAuditorContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  envVars = {
    NODE_ENV: "production",
    PORT: "3000",
    HOSTNAME: "0.0.0.0",
  };
}

interface Env {
  GEO_AUDITOR: DurableObjectNamespace<GeoAuditorContainer>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.GEO_AUDITOR);
    return container.fetch(request);
  },
};
