import type { Readable } from 'node:stream';

interface IncomingFile {
  stream: Readable;
}

/**
 * Multer storage that keeps the file in memory (the same as multer's default), written out so the
 * "nothing reads the body before the guards pass" test has a single place to observe.
 */
export const uploadStorage = {
  _handleFile(
    _req: unknown,
    file: IncomingFile,
    cb: (err: Error | null, info?: { buffer: Buffer; size: number }) => void,
  ): void {
    const chunks: Buffer[] = [];
    file.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    file.stream.once('error', (err: Error) => {
      cb(err);
    });
    file.stream.once('end', () => {
      const buffer = Buffer.concat(chunks);
      cb(null, { buffer, size: buffer.length });
    });
  },
  _removeFile(_req: unknown, _file: unknown, cb: (err: Error | null) => void): void {
    cb(null);
  },
};
