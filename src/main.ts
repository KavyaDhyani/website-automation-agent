/**
 * Website Automation Agent — Main Entry Point
 * 
 * This script:
 *   1. Loads environment configuration (OPENAI_API_KEY)
 *   2. Creates the automation agent with browser tools
 *   3. Runs the agent with a task prompt
 *   4. Logs the full execution trace
 *   5. Cleans up browser resources on exit
 * 
 * Usage:
 *   pnpm run agent
 */

import 'dotenv/config';
import { run, setTracingDisabled } from '@openai/agents';
import { createAutomationAgent } from './agent';
import { closeBrowser } from './tools/browser-manager';
import { logger } from './tools/logger';

// Disable tracing to avoid sending data to OpenAI's tracing service
setTracingDisabled(true);

/**
 * The task prompt sent to the agent.
 * This describes WHAT to do, not HOW — the agent decides the approach autonomously.
 */
const TASK_PROMPT = `
Please complete the following task:

1. Open a browser
2. Navigate to: https://ui.shadcn.com/docs/forms/react-hook-form
3. Find the form on the page — it should have fields like "Username" or "Name" and possibly a "Description" or "Bio" field
4. Fill in the form fields with appropriate sample data
5. Take a screenshot showing the filled form
6. Report what fields you found and what you filled in

Important: Do NOT assume what fields exist. Use get_page_html to discover the actual form structure and field names. The page may have changed since this task was written, so adapt to whatever you find.
`;

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  logger.info('═══════════════════════════════════════════════════');
  logger.info('  Website Automation Agent — Starting Execution');
  logger.info('═══════════════════════════════════════════════════');

  // Validate environment
  if (!process.env.OPENAI_API_KEY) {
    logger.error('OPENAI_API_KEY is not set! Please create a .env file with your API key.');
    logger.info('Copy .env.example to .env and add your key:');
    logger.info('  cp .env.example .env');
    process.exit(1);
  }

  logger.info('OpenAI API key found ✓');

  // Create the agent
  const agent = createAutomationAgent();
  logger.agent(`Agent created: "${agent.name}" using model gpt-4o`);
  logger.agent(`Tools available: ${agent.tools.map((t) => ('name' in t ? t.name : 'unknown')).join(', ')}`);

  logger.info('───────────────────────────────────────────────────');
  logger.info('Task prompt:');
  logger.info(TASK_PROMPT.trim());
  logger.info('───────────────────────────────────────────────────');

  try {
    // Run the agent
    logger.agent('Starting agent execution...');
    const result = await run(agent, TASK_PROMPT, { maxTurns: 25 });

    // Log the result
    logger.info('═══════════════════════════════════════════════════');
    logger.success('Agent execution completed!');
    logger.info('═══════════════════════════════════════════════════');

    // Extract and display output
    logger.info('');
    logger.info('Agent Final Output:');
    logger.info('───────────────────────────────────────────────────');

    if (result.finalOutput) {
      console.log(result.finalOutput);
    }

    logger.info('───────────────────────────────────────────────────');

    // Log execution trace summary
    logger.info('');
    logger.info('Execution Trace:');
    for (const item of result.newItems) {
      if (item.type === 'tool_call_item') {
        logger.tool(`Tool called: ${item.rawItem.type === 'function_call' ? item.rawItem.name : item.rawItem.type}`);
      } else if (item.type === 'tool_call_output_item') {
        const output = typeof item.output === 'string' ? item.output.substring(0, 150) : JSON.stringify(item.output).substring(0, 150);
        logger.info(`  ↳ Output: ${output}...`);
      } else if (item.type === 'message_output_item') {
        logger.agent('Agent message generated');
      }
    }

  } catch (err) {
    logger.error('Agent execution failed!', err instanceof Error ? err.message : err);
    throw err;
  } finally {
    // Always clean up the browser
    logger.info('');
    logger.info('Cleaning up...');
    await closeBrowser();
    logger.info('Done!');
  }
}

// ─── Execute ─────────────────────────────────────────────────────────────────

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
