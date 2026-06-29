/**
 * Browser automation tools for the OpenAI Agents SDK.
 * 
 * Each tool is defined using the SDK's `tool()` helper with Zod schemas for parameter validation.
 * The agent autonomously decides which tools to call and with what parameters — no hardcoded workflows.
 * 
 * Tools provided:
 *   - open_browser: Launch browser instance
 *   - navigate_to_url: Navigate to a URL
 *   - take_screenshot: Capture and save screenshot
 *   - get_page_html: Get cleaned DOM for element discovery
 *   - click_element: Click by CSS selector
 *   - click_on_screen: Click at x,y coordinates
 *   - send_keys: Type text into an element
 *   - scroll: Scroll page up/down
 *   - double_click: Double-click an element
 *   - wait_for_element: Wait for an element to appear
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { launchBrowser, getPage } from './browser-manager';
import { logger } from './logger';

// ─── MUTEX FOR BROWSER INTERACTIONS ──────────────────────────────────────────
// Ensures parallel tool calls that manipulate focus (like typing) execute sequentially
let interactionLock = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const currentLock = interactionLock;
  let resolveLock!: () => void;
  interactionLock = new Promise((resolve) => {
    resolveLock = resolve;
  });
  
  return currentLock.then(async () => {
    try {
      return await fn();
    } finally {
      resolveLock();
    }
  });
}

// Ensure screenshots directory exists
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ─── open_browser ────────────────────────────────────────────────────────────

export const openBrowserTool = tool({
  name: 'open_browser',
  description: 'Launch a new browser instance. Must be called before any other browser tool.',
  parameters: z.object({}),
  execute: async () => {
    logger.tool('open_browser called');
    try {
      await launchBrowser();
      logger.success('Browser opened successfully');
      return 'Browser launched successfully. You can now navigate to a URL.';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to open browser', message);
      return `Error opening browser: ${message}`;
    }
  },
});

// ─── navigate_to_url ─────────────────────────────────────────────────────────

export const navigateToUrlTool = tool({
  name: 'navigate_to_url',
  description: 'Navigate the browser to a specific URL. The browser must be open first.',
  parameters: z.object({
    url: z.string().describe('The full URL to navigate to (e.g. https://example.com)'),
  }),
  execute: async ({ url }) => {
    logger.tool(`navigate_to_url called with: ${url}`);
    try {
      const page = getPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait a bit for dynamic content to settle
      await page.waitForTimeout(2000);
      const title = await page.title();
      logger.success(`Navigated to: ${url} — Title: "${title}"`);
      return `Successfully navigated to ${url}. Page title: "${title}"`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Navigation failed', message);
      return `Error navigating to ${url}: ${message}`;
    }
  },
});

// ─── take_screenshot ─────────────────────────────────────────────────────────

export const takeScreenshotTool = tool({
  name: 'take_screenshot',
  description:
    'Capture a screenshot of the current browser page. Returns the file path of the saved screenshot. Use this to verify the current visual state of the page.',
  parameters: z.object({}),
  execute: async () => {
    logger.tool('take_screenshot called');
    try {
      const page = getPage();
      const filename = `screenshot_${Date.now()}.png`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: filepath, fullPage: false });
      logger.success(`Screenshot saved to: ${filepath}`);
      return `Screenshot saved to: ${filepath}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Screenshot failed', message);
      return `Error taking screenshot: ${message}`;
    }
  },
});

// ─── get_page_html ───────────────────────────────────────────────────────────

export const getPageHtmlTool = tool({
  name: 'get_page_html',
  description:
    'Get a cleaned, concise representation of the current page DOM. This focuses on interactive elements (inputs, buttons, textareas, selects, links) with their attributes (id, name, type, placeholder, aria-label, class) and labels. Use this to discover elements on the page before interacting with them. NEVER assume what selectors exist — always call this tool first to discover them.',
  parameters: z.object({}),
  execute: async () => {
    logger.tool('get_page_html called');
    try {
      const page = getPage();

      // Extract a structured summary of interactive elements in the current viewport
      const domSummary = await page.evaluate(() => {
        const results: string[] = [];

        // Check if element is currently visible in the browser viewport
        function isPartiallyInViewport(el: Element): boolean {
          const rect = el.getBoundingClientRect();
          const windowHeight = window.innerHeight || document.documentElement.clientHeight;
          const windowWidth = window.innerWidth || document.documentElement.clientWidth;
          return (
            rect.top < windowHeight &&
            rect.bottom > 0 &&
            rect.left < windowWidth &&
            rect.right > 0
          );
        }

        // Helper to get element descriptor
        function describeElement(el: Element): string {
          const tag = el.tagName.toLowerCase();
          const id = el.getAttribute('id') ? `id="${el.getAttribute('id')}"` : '';
          const name = el.getAttribute('name') ? `name="${el.getAttribute('name')}"` : '';
          const type = el.getAttribute('type') ? `type="${el.getAttribute('type')}"` : '';
          const placeholder = el.getAttribute('placeholder')
            ? `placeholder="${el.getAttribute('placeholder')}"`
            : '';
          const ariaLabel = el.getAttribute('aria-label')
            ? `aria-label="${el.getAttribute('aria-label')}"`
            : '';
          const role = el.getAttribute('role') ? `role="${el.getAttribute('role')}"` : '';
          const value = (el as HTMLInputElement).value
            ? `value="${(el as HTMLInputElement).value}"`
            : '';
          
          let text = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent?.trim())
            .filter(Boolean)
            .join(' ')
            .substring(0, 40);

          if (!text && el.textContent) {
            text = el.textContent.trim().substring(0, 40);
          }

          const attrs = [id, name, type, placeholder, ariaLabel, role, value]
            .filter(Boolean)
            .join(' ');

          return `<${tag} ${attrs}>${text ? text : ''}</${tag}>`;
        }

        // Get all headings for page structure understanding
        document.querySelectorAll('h1, h2, h3').forEach((el) => {
          if (isPartiallyInViewport(el)) {
            results.push(`[HEADING] ${describeElement(el)}`);
          }
        });

        // Get all interactive and media elements
        document
          .querySelectorAll(
            'input, textarea, select, button, [role="button"], [contenteditable="true"], video, audio, canvas'
          )
          .forEach((el) => {
            // Skip hidden elements or those outside the viewport
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            if (isPartiallyInViewport(el)) {
              results.push(`[INTERACTIVE] ${describeElement(el)}`);
            }
          });

        // Get labels
        document.querySelectorAll('label').forEach((el) => {
          if (isPartiallyInViewport(el)) {
            const forAttr = el.getAttribute('for') ? `for="${el.getAttribute('for')}"` : '';
            const text = el.textContent?.trim().substring(0, 40) || '';
            results.push(`[LABEL] <label ${forAttr}>${text}</label>`);
          }
        });

        // Get links (limited to viewport)
        document.querySelectorAll('a[href]').forEach((el) => {
          if (isPartiallyInViewport(el)) {
            // Further strict filtering to avoid massive menus
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
               results.push(`[LINK] ${describeElement(el)}`);
            }
          }
        });

        // Limit the total links if there are too many on-screen at once
        const linksOnly = results.filter(r => r.startsWith('[LINK]'));
        const others = results.filter(r => !r.startsWith('[LINK]'));
        return [...others, ...linksOnly.slice(0, 20)].join('\n');
      });

      const currentUrl = page.url();
      const title = await page.title();
      let output = `=== Page: "${title}" (${currentUrl}) ===\n\n${domSummary}`;

      // Strict truncation to prevent 413 Payload Too Large (GitHub Models 8k limit)
      // 12,000 characters is roughly 3,000 - 4,000 tokens, which gives the agent plenty of room to think
      const MAX_CHARS = 12000;
      if (output.length > MAX_CHARS) {
        output = output.substring(0, MAX_CHARS) + '\n...[TRUNCATED DUE TO SIZE LIMIT]...';
      }

      logger.success(`DOM extracted — ${output.length} characters`);
      return output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('get_page_html failed', message);
      return `Error getting page HTML: ${message}`;
    }
  },
});

// ─── click_element ───────────────────────────────────────────────────────────

export const clickElementTool = tool({
  name: 'click_element',
  description:
    'Click on a web element using a CSS selector. Discover the correct selector first using get_page_html.',
  parameters: z.object({
    selector: z
      .string()
      .describe(
        'CSS selector for the element to click (e.g. "#submit-btn", "button[type=submit]", "input[name=username]")'
      ),
  }),
  execute: async ({ selector }) => {
    logger.tool(`click_element called with selector: ${selector}`);
    try {
      const page = getPage();
      await page.click(selector, { timeout: 10000 });
      await page.waitForTimeout(500);
      logger.success(`Clicked element: ${selector}`);
      return `Successfully clicked element: ${selector}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to click: ${selector}`, message);
      return `Error clicking element "${selector}": ${message}. Try using get_page_html to find the correct selector.`;
    }
  },
});

// ─── click_on_screen ─────────────────────────────────────────────────────────

export const clickOnScreenTool = tool({
  name: 'click_on_screen',
  description:
    'Click at specific x,y pixel coordinates on the page. Use this as a fallback when CSS selectors do not work.',
  parameters: z.object({
    x: z.number().describe('X coordinate in pixels from the left edge of the viewport'),
    y: z.number().describe('Y coordinate in pixels from the top edge of the viewport'),
  }),
  execute: async ({ x, y }) => {
    logger.tool(`click_on_screen called at (${x}, ${y})`);
    try {
      const page = getPage();
      await page.mouse.click(x, y);
      await page.waitForTimeout(500);
      logger.success(`Clicked at coordinates (${x}, ${y})`);
      return `Successfully clicked at coordinates (${x}, ${y})`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to click at (${x}, ${y})`, message);
      return `Error clicking at (${x}, ${y}): ${message}`;
    }
  },
});

// ─── mouse_drag ──────────────────────────────────────────────────────────────

export const mouseDragTool = tool({
  name: 'mouse_drag',
  description:
    'Drag the mouse from one point to another on the screen. This is useful for drawing, swiping, or drag-and-drop actions.',
  parameters: z.object({
    startX: z.number().describe('Starting X coordinate in pixels'),
    startY: z.number().describe('Starting Y coordinate in pixels'),
    endX: z.number().describe('Ending X coordinate in pixels'),
    endY: z.number().describe('Ending Y coordinate in pixels'),
  }),
  execute: async ({ startX, startY, endX, endY }) => {
    logger.tool(`mouse_drag called from (${startX}, ${startY}) to (${endX}, ${endY})`);
    try {
      const page = getPage();
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      // Use steps to simulate a smooth drag
      await page.mouse.move(endX, endY, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      logger.success(`Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`);
      return `Successfully dragged mouse from (${startX}, ${startY}) to (${endX}, ${endY})`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to drag mouse`, message);
      return `Error dragging mouse: ${message}`;
    }
  },
});

// ─── send_keys ───────────────────────────────────────────────────────────────

export const sendKeysTool = tool({
  name: 'send_keys',
  description:
    'Type text into a form field or text area identified by a CSS selector. The element will be clicked first to focus it, then the text will be typed. If the field already has content, it will be cleared first.',
  parameters: z.object({
    selector: z
      .string()
      .describe('CSS selector for the input/textarea element to type into'),
    text: z.string().describe('The text to type into the element'),
    clearFirst: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to clear existing content before typing (default: true)'),
  }),
  execute: async ({ selector, text, clearFirst }) => {
    logger.tool(`send_keys called: selector="${selector}", text="${text}"`);
    return withLock(async () => {
      try {
        const page = getPage();

        // Click to focus the element
        await page.click(selector, { timeout: 10000 });
        await page.waitForTimeout(200);

        // Clear existing content if requested
        if (clearFirst) {
          await page.fill(selector, '');
        }

        // Type the text with a delay to simulate human typing
        await page.type(selector, text, { delay: 50 });
        await page.waitForTimeout(300);

        logger.success(`Typed "${text}" into ${selector}`);
        return `Successfully typed "${text}" into element: ${selector}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to type into ${selector}`, message);
        return `Error typing into "${selector}": ${message}. Try using get_page_html to find the correct selector.`;
      }
    });
  },
});

// ─── scroll ──────────────────────────────────────────────────────────────────

export const scrollTool = tool({
  name: 'scroll',
  description:
    'Scroll the page up or down. Use this to reveal elements that may be below the visible viewport.',
  parameters: z.object({
    direction: z.enum(['up', 'down']).describe('Direction to scroll'),
    amount: z
      .number()
      .optional()
      .default(500)
      .describe('Number of pixels to scroll (default: 500)'),
  }),
  execute: async ({ direction, amount }) => {
    logger.tool(`scroll called: direction=${direction}, amount=${amount}`);
    try {
      const page = getPage();
      const scrollAmount = direction === 'down' ? amount : -amount;
      await page.evaluate((scrollY) => window.scrollBy(0, scrollY), scrollAmount);
      await page.waitForTimeout(500);
      logger.success(`Scrolled ${direction} by ${amount}px`);
      return `Successfully scrolled ${direction} by ${amount} pixels`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Scroll failed', message);
      return `Error scrolling: ${message}`;
    }
  },
});

// ─── double_click ────────────────────────────────────────────────────────────

export const doubleClickTool = tool({
  name: 'double_click',
  description: 'Perform a double-click on an element identified by a CSS selector.',
  parameters: z.object({
    selector: z
      .string()
      .describe('CSS selector for the element to double-click'),
  }),
  execute: async ({ selector }) => {
    logger.tool(`double_click called with selector: ${selector}`);
    try {
      const page = getPage();
      await page.dblclick(selector, { timeout: 10000 });
      await page.waitForTimeout(500);
      logger.success(`Double-clicked element: ${selector}`);
      return `Successfully double-clicked element: ${selector}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to double-click: ${selector}`, message);
      return `Error double-clicking "${selector}": ${message}`;
    }
  },
});

// ─── wait_for_element ────────────────────────────────────────────────────────

export const waitForElementTool = tool({
  name: 'wait_for_element',
  description:
    'Wait for an element matching a CSS selector to appear on the page. Useful when elements are loaded dynamically.',
  parameters: z.object({
    selector: z.string().describe('CSS selector to wait for'),
    timeout: z
      .number()
      .optional()
      .default(10000)
      .describe('Maximum time to wait in milliseconds (default: 10000)'),
  }),
  execute: async ({ selector, timeout }) => {
    logger.tool(`wait_for_element called: selector="${selector}", timeout=${timeout}ms`);
    try {
      const page = getPage();
      await page.waitForSelector(selector, { timeout, state: 'visible' });
      logger.success(`Element found: ${selector}`);
      return `Element "${selector}" is now visible on the page`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Element not found: ${selector}`, message);
      return `Element "${selector}" did not appear within ${timeout}ms: ${message}`;
    }
  },
});

/**
 * All browser tools exported as an array for easy registration with the Agent.
 */
export const browserTools = [
  openBrowserTool,
  navigateToUrlTool,
  takeScreenshotTool,
  getPageHtmlTool,
  clickElementTool,
  clickOnScreenTool,
  mouseDragTool,
  sendKeysTool,
  scrollTool,
  doubleClickTool,
  waitForElementTool,
];
