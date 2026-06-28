/**
 * API Route: GET /api/screenshots
 * 
 * Returns a JSON array of screenshot filenames from the screenshots/ directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const screenshotsDir = path.join(process.cwd(), 'screenshots');

  try {
    if (!fs.existsSync(screenshotsDir)) {
      return Response.json({ screenshots: [] });
    }

    const files = fs.readdirSync(screenshotsDir)
      .filter((f) => f.endsWith('.png'))
      .sort((a, b) => {
        // Sort by creation time (newest first) — extract timestamp from filename
        const timeA = parseInt(a.replace('screenshot_', '').replace('.png', '')) || 0;
        const timeB = parseInt(b.replace('screenshot_', '').replace('.png', '')) || 0;
        return timeB - timeA;
      })
      .map((filename) => ({
        filename,
        path: `/api/screenshots/${filename}`,
      }));

    return Response.json({ screenshots: files });
  } catch {
    return Response.json({ screenshots: [] });
  }
}
