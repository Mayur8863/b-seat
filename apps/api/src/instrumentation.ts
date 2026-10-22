/**
 * OpenTelemetry tracing. Loaded by main.ts BEFORE the app so auto-instrumentation
 * can hook http/express/pg/ioredis. Configured with standard OTEL_* env vars;
 * disabled when OTEL_SDK_DISABLED=true (the local default).
 */
import { register } from 'node:module';

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

if (process.env.OTEL_SDK_DISABLED !== 'true') {
  // ESM modules need the import-in-the-middle loader hook to be instrumented.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'bseat-api',
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }),
    ],
  });
  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
}
