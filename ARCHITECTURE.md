# Architecture Document — Website Automation Agent

## Overview

This project implements an **AI-driven browser automation agent** that can autonomously navigate websites, discover page elements, and perform form-filling operations. It serves as a mini-version of tools like [Browser Use](https://github.com/browser-use/browser-use).

## Design Philosophy

### No Hardcoding — Full Autonomy

The most critical design decision: **the agent never uses hardcoded selectors**. Instead:

1. The agent calls `get_page_html` to receive a cleaned DOM representation
2. GPT-4o analyzes the DOM to identify relevant elements
3. The agent constructs selectors dynamically based on what it discovers
4. If selectors fail, the agent adapts by trying alternatives

This makes the agent resilient to page changes and capable of working on pages it's never seen before.

### DOM-Aware vs. Vision-Based

We chose a **DOM-aware** approach over a purely vision-based one:

| Approach | Pros | Cons |
|----------|------|------|
| **DOM-Aware** (our choice) | Precise selectors, works with standard models, lower latency | Can't handle canvas/WebGL content |
| **Vision-Based** (computer-use) | Works with any visual content | Requires special models, higher latency, coordinate imprecision |

The DOM-aware approach provides the best balance of accuracy, speed, and compatibility with standard GPT-4o.

## Architecture Diagram

```
                    ┌─────────────────────┐
                    │    User / CLI       │
                    │    (pnpm run agent) │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     main.ts         │
                    │  ─ Load .env        │
                    │  ─ Validate config  │
                    │  ─ Create agent     │
                    │  ─ Execute run()    │
                    │  ─ Cleanup          │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     agent.ts        │
                    │  ─ System prompt    │
                    │  ─ GPT-4o config    │
                    │  ─ Tools array      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │ browser-     │ │ browser-     │ │ logger.ts    │
     │ tools.ts     │ │ manager.ts   │ │              │
     │              │ │              │ │ Timestamped  │
     │ 10 tools     │ │ Singleton    │ │ emoji-coded  │
     │ registered   │ │ lifecycle    │ │ log output   │
     │ with SDK     │ │ management   │ │              │
     └──────┬───────┘ └──────┬───────┘ └──────────────┘
            │                │
            └────────┬───────┘
                     │
                     ▼
            ┌──────────────────┐
            │   Playwright     │
            │   Chromium       │
            │   Browser        │
            └──────────────────┘
```

## Agent Workflow

```
START
  │
  ▼
[1. Open Browser]
  │
  ▼
[2. Navigate to URL]
  │
  ▼
[3. Get Page HTML]  ◄──── Agent reads DOM to discover elements
  │
  ▼
[4. Analyze & Decide] ◄── GPT-4o reasons about what elements exist
  │                        and what to interact with
  ▼
[5. Interact]  ◄────────── click_element, send_keys, scroll, etc.
  │
  ▼
[6. Verify]  ◄──────────── take_screenshot, get_page_html again
  │
  ▼
[7. Report]  ◄──────────── Agent summarizes what it accomplished
  │
  ▼
END
```

## Tool Design

### Why `get_page_html` Returns Cleaned DOM

Raw HTML is too noisy for an LLM (scripts, styles, SVGs, etc.). Our `get_page_html` extracts only:
- **Interactive elements**: inputs, textareas, buttons, selects
- **Labels**: Associated label text for form fields
- **Headings**: Page structure context (h1, h2, h3)
- **Element attributes**: id, name, type, placeholder, aria-label, class, value

This gives the agent a concise, actionable view of the page (~2-5KB instead of ~200KB raw HTML).

### Tool Categories

1. **Browser Lifecycle**: `open_browser` — starts Playwright
2. **Navigation**: `navigate_to_url` — goes to URLs
3. **Observation**: `get_page_html`, `take_screenshot` — understands the page
4. **Interaction**: `click_element`, `send_keys`, `double_click` — manipulates elements
5. **Utility**: `scroll`, `wait_for_element`, `click_on_screen` — helpers

## Error Handling Strategy

| Error Type | Handling Approach |
|-----------|-------------------|
| Element not found | Agent tries alternative selectors or scrolls |
| Navigation timeout | Returns error message; agent can retry |
| Browser crash | `closeBrowser()` cleans up gracefully |
| API key missing | Immediate exit with clear error message |
| Tool execution error | Error message returned to agent for reasoning |

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| AI Engine | OpenAI Agents SDK + GPT-4o | Agent orchestration and reasoning |
| Browser | Playwright + Chromium | Browser automation |
| Runtime | Node.js + TypeScript | Application runtime |
| Schema Validation | Zod | Tool parameter validation |
| Config | dotenv | Environment variable management |
| Execution | tsx | TypeScript execution without build step |

## Extending the Agent

### Adding a New Tool

```typescript
// In browser-tools.ts
export const myNewTool = tool({
  name: 'my_new_tool',
  description: 'What this tool does — be descriptive for the LLM',
  parameters: z.object({
    param1: z.string().describe('Description for the LLM'),
  }),
  execute: async ({ param1 }) => {
    // Implementation
    return 'Result string for the agent';
  },
});

// Add to browserTools array
export const browserTools = [
  // ... existing tools
  myNewTool,
];
```

### Changing the Task

Edit the `TASK_PROMPT` in `src/main.ts`. The agent will adapt to any website and task as long as it has the right tools available.
