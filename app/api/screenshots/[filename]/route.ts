/**
 * API Route: GET /api/screenshots/[filename]
 * 
 * Serves a specific screenshot image file from the screenshots/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize filename to prevent path traversal
  const sanitized = path.basename(filename);
  if (!sanitized.endsWith('.png')) {
    return new Response('Not found', { status: 404 });
  }

  const filepath = path.join(process.cwd(), 'screenshots', sanitized);

  try {
    if (!fs.existsSync(filepath)) {
      return new Response('Not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filepath);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Error reading file', { status: 500 });
  }
}
