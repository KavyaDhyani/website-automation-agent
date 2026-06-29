/**
 * API Route: POST /api/agent/run
 * 
 * Runs the automation agent with user-provided URL and form data.
 * Streams real-time log events back to the client via Server-Sent Events (SSE).
 * 
 * Request body:
 *   { url: string, formData: Record<string, string> }
 * 
 * Response: SSE stream with events:
 *   - event: log     → { timestamp, level, message, data? }
 *   - event: screenshot → { filename, path }
 *   - event: complete → { finalOutput }
 *   - event: error   → { message }
 */

import { run, setTracingDisabled } from '@openai/agents';
import { createAutomationAgent } from '@/src/agent';
import { launchBrowser, closeBrowser } from '@/src/tools/browser-manager';
import { logger, logEmitter, type LogEntry } from '@/src/tools/logger';
import * as fs from 'fs';
import * as path from 'path';

// Disable tracing
setTracingDisabled(true);

// Force dynamic — no caching for this route
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { url: string; formData: Record<string, string>; instruction?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, formData, instruction } = body;

  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'URL is required' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY is not configured on the server' }, { status: 500 });
  }

  // Build a dynamic task prompt from user input
  const formFieldsDescription = Object.entries(formData || {})
    .filter(([, v]) => v.trim())
    .map(([key, value]) => `  - ${key}: "${value}"`)
    .join('\n');

  const taskPrompt = `
Please complete the following task:

1. Open a browser
2. Navigate to: ${url}
${instruction ? `3. Follow these instructions: ${instruction}` : `3. Explore and interact with the elements on the page as appropriate.`}
${formFieldsDescription ? `4. Fill in the form fields with the following data:
${formFieldsDescription}` : ''}
5. Take a screenshot to verify your actions.
6. Report what you accomplished.

Important: Use get_page_html to discover the actual page structure. The page may have changed, so adapt to whatever you find. Match any provided data to the most appropriate elements based on names, labels, and placeholders.
`;

  // Set up SSE stream
  const encoder = new TextEncoder();
  const screenshotsDir = path.join(process.cwd(), 'screenshots');

  // Track screenshots that existed before this run
  const existingScreenshots = new Set<string>();
  try {
    if (fs.existsSync(screenshotsDir)) {
      fs.readdirSync(screenshotsDir).forEach((f) => existingScreenshots.add(f));
    }
  } catch { /* ignore */ }

  const stream = new ReadableStream({
    start(controller) {
      // Helper to send an SSE event
      function sendEvent(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream may have been closed
        }
      }

      // Subscribe to log events
      function onLog(entry: LogEntry) {
        sendEvent('log', entry);

        // Check if a new screenshot was created
        if (entry.message.includes('Screenshot saved')) {
          try {
            if (fs.existsSync(screenshotsDir)) {
              const currentFiles = fs.readdirSync(screenshotsDir);
              for (const file of currentFiles) {
                if (!existingScreenshots.has(file) && file.endsWith('.png')) {
                  existingScreenshots.add(file);
                  sendEvent('screenshot', { filename: file, path: `/api/screenshots/${file}` });
                }
              }
            }
          } catch { /* ignore */ }
        }
      }

      logEmitter.on('log', onLog);

      // Run the agent
      (async () => {
        try {
          logger.info('Agent run initiated from frontend');
          logger.info(`Target URL: ${url}`);
          if (formFieldsDescription) {
            logger.info(`Form data provided:\n${formFieldsDescription}`);
          }

          const agent = createAutomationAgent();
          logger.agent(`Agent created: "${agent.name}"`);

          const result = await run(agent, taskPrompt, { maxTurns: 25 });

          logger.success('Agent execution completed!');

          // Send completion event with final output
          sendEvent('complete', {
            finalOutput: result.finalOutput || 'Agent completed without text output.',
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('Agent execution failed!', message);
          sendEvent('error', { message });
        } finally {
          // Clean up
          await closeBrowser();
          logEmitter.removeListener('log', onLog);

          try {
            controller.close();
          } catch { /* already closed */ }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
