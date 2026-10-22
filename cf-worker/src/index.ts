import { Container, getContainer } from "@cloudflare/containers";

/**
 * Cloudflare Containers wrapper for Geo Agentic Auditor.
 * The application is the existing Next.js standalone server with
 * Playwright/Chromium baked into the image (root Dockerfile); this
 * Worker only routes traffic to it.
 *
 * Runtime secrets reach the container from this Worker's own secret
 * bindings (set with `wrangler secret put` or the dashboard, never
 * from this repo): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and
 * TURNSTILE_SECRET_KEY. If a binding is absent, the variable is
 * simply not passed and the app degrades as it does today when the
 * variable is unset.
 */

interface GeoEnv {
  GEO_AUDITOR: DurableObjectNamespace<GeoAuditorContainer>;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export class GeoAuditorContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "15m";

  constructor(ctx: DurableObjectState, env: GeoEnv) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      PORT: "3000",
      HOSTNAME: "0.0.0.0",
      ...(env.CLOUDFLARE_ACCOUNT_ID
        ? { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID }
        : {}),
      ...(env.CLOUDFLARE_API_TOKEN
        ? { CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN }
        : {}),
      ...(env.TURNSTILE_SECRET_KEY
        ? { TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY }
        : {}),
    };
  }
}

export default {
  async fetch(request: Request, env: GeoEnv): Promise<Response> {
    const container = getContainer(env.GEO_AUDITOR);
    return container.fetch(request);
  },
};
