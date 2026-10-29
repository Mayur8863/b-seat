// Point the app at the test database before any module reads the env.
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error('DATABASE_URL_TEST is required for integration tests');

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.OTEL_SDK_DISABLED = 'true';

// Integration tests never touch the dev bucket. The tools container reaches storage on the internal
// host, so signed URLs use it too (ADR-0011, AQ-9).
process.env.S3_BUCKET_PHOTOS = process.env.S3_BUCKET_PHOTOS_TEST ?? 'bseat-photos-test';
if (process.env.S3_ENDPOINT) process.env.S3_PUBLIC_ENDPOINT = process.env.S3_ENDPOINT;
