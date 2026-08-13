/**
 * Is this actually an image?
 *
 * ⚠ `file.type` IS CLIENT-SUPPLIED and was once the only check on the menu photo
 * upload. Anyone with an Admin account could send arbitrary bytes labelled
 * `image/webp` and have them written into the website's public folder, published
 * to stackd.com.sa by the next auto-publish. These functions verify the actual
 * container instead of the claim.
 *
 * Deliberately narrow. Not a virus scanner — it closes the gap between "the
 * browser said image/webp" and "the bytes are an image", which is the difference
 * between an upload form and an arbitrary-file-write.
 *
 * Shared by the menu photo upload and the promotion image, so the two cannot
 * drift apart — the second one was about to be a copy of the first.
 */

/** Browser MIME type to the extension we store. Anything else is refused. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export function looksLikeImage(b: Buffer, ext: string): boolean {
  if (b.length < 12) return false;
  // PNG: \x89PNG\r\n\x1a\n
  if (ext === 'png') {
    return b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  // JPEG: FF D8 FF
  if (ext === 'jpg' || ext === 'jpeg') {
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
  // WebP is a RIFF container: 'RIFF' <size> 'WEBP'
  if (ext === 'webp') {
    return (
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

/**
 * The MIME type to declare for an extension we have already verified.
 *
 * Derived from the bytes we checked, never echoed back from the upload — the
 * whole point of the check above is that the browser's claim is not trusted.
 */
export function imageMimeFor(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}
