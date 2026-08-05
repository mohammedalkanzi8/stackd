/**
 * Serves an item photo out of the WEBSITE's public folder so the portal can show
 * what is currently live.
 *
 * The two apps do not share a static directory — apps/web owns the images
 * because it is the one that exports them — so the portal reads them off disk
 * rather than duplicating the files.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { requireStaff } from '@/lib/auth.ts';
import { queryOne } from '@stackd/server';

const PHOTO_DIR = path.resolve(process.cwd(), '../web/public/menu');

const CONTENT_TYPE: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireStaff();
  const { slug } = await params;

  // The path is built from the DATABASE's record of the file, never from the
  // request. A slug that is not in menu_items reads nothing at all, which is
  // what stops `../../` from ever becoming a filename.
  const item = await queryOne<{ image_url: string | null }>(
    'select image_url from menu_items where slug = $1',
    [slug],
  );
  const filename = item?.image_url?.split('/').pop();
  if (!filename || !/^[a-z0-9-]+\.(webp|jpe?g|png)$/i.test(filename)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const bytes = await readFile(path.join(PHOTO_DIR, filename));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': CONTENT_TYPE[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
        // The portal shows the file that is on disk right now; a cached copy
        // would hide the upload that just replaced it.
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
