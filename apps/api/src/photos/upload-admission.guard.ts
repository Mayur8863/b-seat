import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { photoBusy } from '../common/errors/problem-types.js';
import { UploadAdmission } from './upload-limits.js';

/** Process-wide, so every request shares one counter. */
export const uploadAdmission = new UploadAdmission();

/**
 * Runs after the auth and role guards and before multer reads a byte: past 16 uploads in flight the
 * request gets an immediate 503, so buffered bodies stay bounded (ADR-0011 section 2).
 */
@Injectable()
export class UploadAdmissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const release = uploadAdmission.tryEnter();
    if (!release) throw photoBusy();
    // `close` fires for every response, including an aborted connection.
    context.switchToHttp().getResponse<Response>().once('close', release);
    return true;
  }
}
