// Tracing must be registered before any instrumented module is loaded, so the
// app is imported dynamically after it.
await import('./instrumentation.js');
const { bootstrap } = await import('./bootstrap.js');
await bootstrap();
