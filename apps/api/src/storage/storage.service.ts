import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { signingWindow } from './url-signing.js';

/** ADR-0011 section 1: bounds how long an upload holds its buffer when storage hangs. */
const CONNECTION_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/** The only code that imports the AWS SDK. Keys are derived from ids by callers. */
@Injectable()
export class StorageService {
  private readonly bucket: string;
  private readonly ttlSeconds: number;
  /** Put and delete use the internal endpoint. */
  private readonly client: S3Client;
  /** Signing uses the host the browser reaches, because SigV4 signs the host. */
  private readonly signer: S3Client;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET_PHOTOS', { infer: true });
    this.ttlSeconds = config.get('PHOTO_URL_TTL_SECONDS', { infer: true });

    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const publicEndpoint = config.get('S3_PUBLIC_ENDPOINT', { infer: true }) ?? endpoint;
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    const base = {
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      ...(accessKeyId !== undefined && secretAccessKey !== undefined
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    };

    this.client = new S3Client({
      ...base,
      ...(endpoint !== undefined ? { endpoint } : {}),
      maxAttempts: MAX_ATTEMPTS,
      requestHandler: {
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        requestTimeout: REQUEST_TIMEOUT_MS,
      },
    });
    this.signer = new S3Client({
      ...base,
      ...(publicEndpoint !== undefined ? { endpoint: publicEndpoint } : {}),
    });
  }

  async putObject(key: string, body: Buffer, contentType: 'image/webp'): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** One DeleteObject per key; a missing key is success, so the purge is idempotent. */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Callers pass one `now` per response so every URL in it shares one window. */
  async signGetUrls(
    keys: readonly string[],
    now: Date,
  ): Promise<{ urls: string[]; expiresAt: Date }> {
    const { signingDate, expiresAt } = signingWindow(now, this.ttlSeconds);
    const urls = await Promise.all(
      keys.map((key) =>
        getSignedUrl(
          this.signer,
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
            // Expires (not max-age) ends browser freshness exactly when the URL dies (ADR-0011 section 5).
            ResponseCacheControl: 'private',
            ResponseExpires: expiresAt,
          }),
          { expiresIn: this.ttlSeconds, signingDate },
        ),
      ),
    );
    return { urls, expiresAt };
  }
}
