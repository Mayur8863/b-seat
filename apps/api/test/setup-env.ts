// Point the app at the test database before any module reads the env.
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error('DATABASE_URL_TEST is required for integration tests');

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.OTEL_SDK_DISABLED = 'true';
