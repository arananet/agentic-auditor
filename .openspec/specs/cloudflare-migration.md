# Geo Agentic Auditor: migración de Railway a Cloudflare Containers

Estado: auditoría completada el 2026-10-22. Ruta decidida por Edu el 2026-10-22:
Containers con el Dockerfile actual (Playwright/Chromium se conserva, Edu:
"no podemos perder playwright"), sin reescribir la app. Edu borró el proyecto
de Railway, así que la migración es también la recuperación del servicio.

## Destino

- Cloudflare Containers (instancia standard-2 por el peso de Chromium) con un
  Worker fino en `cf-worker/` cuya clase Container reenvía todo el tráfico al
  servidor Next.js standalone del contenedor (puerto 3000).
- Dominio: geo-agentic-auditor.arananet.net.

## Cambios de código que acompañan a la migración

- `src/services/LlmAnalyzer.ts`: las llamadas a Workers AI entran por el AI
  Gateway compartido `arananet-ai-gateway` con el header `cf-aig-metadata`
  {"app": "geo-agentic-auditor", "env": "prod"}. El contrato de respuesta no
  cambia.
- `tsconfig.json`: `cf-worker` queda fuera del proyecto de la app (es un
  proyecto aparte con sus propias dependencias); sin esto, `next build`
  chequea los tipos del envoltorio y falla.
- El estado en disco del MemoryService es efímero en un contenedor; la app ya
  degrada a memoria cuando no puede persistir.

## Despliegue (Workers Builds, configurado el 2026-10-22)

- Proyecto Workers Builds sobre este repo, rama de producción `main`, Worker
  `agentic-auditor`.
- Root directory: `cf-worker`.
- Build command: vacío. La app se compila dentro de la imagen Docker durante
  el deploy.
- Deploy command: `npx wrangler deploy`.
- La imagen se construye desde el `Dockerfile` de la raíz con la raíz del repo
  como contexto.

## Variables de entorno (nunca en el repo)

- El envoltorio reenvía al contenedor, solo si el binding existe:
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (alcance Workers AI, para entrar
  por el gateway) y TURNSTILE_SECRET_KEY.
- NEXT_PUBLIC_TURNSTILE_SITE_KEY es pública por diseño y va como variable de
  build del proyecto, para que Next la incruste al compilar.

## Verificación tras el despliegue

1. `https://agentic-auditor.info-693.workers.dev` responde 200 (arranque en
   frío del contenedor, puede tardar unos segundos la primera vez).
2. Con el dominio enganchado, `https://geo-agentic-auditor.arananet.net`
   responde 200 y sin cabeceras `x-railway-*`.
3. Una auditoría de prueba completa el flujo y genera su informe PDF
   (Playwright operativo dentro del contenedor).
4. Los logs del AI Gateway muestran la llamada con metadata
   app=geo-agentic-auditor.
