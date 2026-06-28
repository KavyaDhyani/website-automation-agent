/**
 * Browser lifecycle manager — singleton pattern for managing a Playwright browser instance.
 * Provides centralized control over browser, context, and page objects shared across all tools.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from './logger';

/** Singleton state for the browser instance */
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * Launches a new Chromium browser instance with a fresh context and page.
 * If a browser is already running, it will be closed first.
 * 
 * @returns The newly created Page object
 * @throws Error if browser launch fails
 */
export async function launchBrowser(): Promise<Page> {
  // Close existing browser if one is already running
  if (browser) {
    logger.warn('Browser already running — closing existing instance before relaunching');
    await closeBrowser();
  }

  logger.browser('Launching Chromium browser...');

  browser = await chromium.launch({
    headless: false, // Visible browser for demonstration purposes
    channel: 'chrome', // Use the system's Google Chrome installation
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900',
    ],
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  page = await context.newPage();

  logger.success('Browser launched successfully');
  return page;
}

/**
 * Returns the current active Page object.
 * 
 * @throws Error if no browser has been launched yet
 */
export function getPage(): Page {
  if (!page) {
    throw new Error('Browser not initialized. Call open_browser first.');
  }
  return page;
}

/**
 * Gracefully closes the browser, context, and page — cleaning up all resources.
 */
export async function closeBrowser(): Promise<void> {
  logger.browser('Closing browser...');
  try {
    if (page) {
      await page.close().catch(() => { /* ignore close errors */ });
      page = null;
    }
    if (context) {
      await context.close().catch(() => { /* ignore close errors */ });
      context = null;
    }
    if (browser) {
      await browser.close().catch(() => { /* ignore close errors */ });
      browser = null;
    }
    logger.success('Browser closed successfully');
  } catch (err) {
    logger.error('Error closing browser', err);
  }
}
