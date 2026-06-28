# 🤖 Website Automation Agent

An intelligent website automation agent built with **OpenAI Agents SDK (TypeScript)** and **Playwright**, capable of navigating web pages and interacting with elements autonomously — without hardcoded selectors or workflows.

## 🎯 What It Does

The agent autonomously:

1. **Opens a browser** and navigates to a target URL
2. **Reads the page DOM** to discover available elements (forms, buttons, inputs)
3. **Makes intelligent decisions** about which elements to interact with
4. **Fills in forms** by identifying fields through their labels, names, and attributes
5. **Takes screenshots** to verify its actions
6. **Reports results** of what it accomplished

> **Key Feature:** The agent never relies on hardcoded CSS selectors. It discovers page structure dynamically using `get_page_html`, making it resilient to page changes.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           main.ts (Entry Point)             │
│  - Loads .env config                        │
│  - Validates API key                        │
│  - Creates agent and runs task              │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│         agent.ts (Agent Definition)         │
│  - System prompt (autonomous reasoning)     │
│  - GPT-4o model                             │
│  - Browser tools attached                   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│      tools/browser-tools.ts (10 Tools)      │
│  open_browser │ navigate_to_url             │
│  take_screenshot │ get_page_html            │
│  click_element │ click_on_screen            │
│  send_keys │ scroll                         │
│  double_click │ wait_for_element            │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│    tools/browser-manager.ts (Singleton)     │
│  - Launches Chromium via Playwright         │
│  - Manages browser/context/page lifecycle   │
│  - Shared across all tools                  │
└─────────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Node.js** ≥ 18
- **pnpm** (package manager)
- **OpenAI API key** with access to GPT-4o

## 🚀 Setup & Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd website-automation-agent
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Install Playwright browsers

```bash
npx playwright install chromium
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-api-key-here
```

## ▶️ Running the Agent

```bash
pnpm run agent
```

This will:
1. Launch a visible Chromium browser
2. Navigate to `https://ui.shadcn.com/docs/forms/react-hook-form`
3. Autonomously discover and fill in form fields
4. Save screenshots to the `screenshots/` directory
5. Output a detailed execution log to the console

## 📁 Project Structure

```
website-automation-agent/
├── src/
│   ├── main.ts                 # Entry point — runs the agent
│   ├── agent.ts                # Agent definition + system prompt
│   └── tools/
│       ├── browser-manager.ts  # Playwright browser lifecycle
│       ├── browser-tools.ts    # 10 automation tool definitions
│       └── logger.ts           # Structured logging utility
├── screenshots/                # Auto-created, stores screenshots
├── .env.example                # Environment variable template
├── .env                        # Your API key (git-ignored)
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md             # Detailed architecture document
└── README.md                   # This file
```

## 🔧 Available Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `open_browser` | none | Launch a Chromium browser instance |
| `navigate_to_url` | `url` | Navigate to a specific URL |
| `take_screenshot` | none | Capture viewport screenshot to disk |
| `get_page_html` | none | Get cleaned DOM summary of interactive elements |
| `click_element` | `selector` | Click an element by CSS selector |
| `click_on_screen` | `x, y` | Click at pixel coordinates |
| `send_keys` | `selector, text` | Type text into a form field |
| `scroll` | `direction, amount?` | Scroll the page up or down |
| `double_click` | `selector` | Double-click an element |
| `wait_for_element` | `selector, timeout?` | Wait for an element to appear |

## 🧠 How the Agent Works

1. **No hardcoded workflows** — The agent receives a high-level task description and decides what to do
2. **DOM-aware** — Uses `get_page_html` to extract a clean representation of interactive elements
3. **Adaptive** — If a selector fails, it scrolls, tries alternatives, and takes screenshots
4. **Verifiable** — Takes screenshots after key actions so you can verify the results

### Intelligence Loop

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Get Page   │────▶│  LLM Decides │────▶│  Execute    │
│  HTML/DOM   │     │  Next Action │     │  Tool       │
└─────────────┘     └──────────────┘     └──────┬──────┘
       ▲                                         │
       │                                         │
       └─────────────── Result ──────────────────┘
```

## 📊 Example Output

```
[2026-06-24T18:30:00.000Z] ℹ️  INFO: ═══════════════════════════════════════
[2026-06-24T18:30:00.000Z] ℹ️  INFO:   Website Automation Agent — Starting
[2026-06-24T18:30:00.001Z] 🤖 AGENT: Agent created: "WebAutomationAgent"
[2026-06-24T18:30:00.100Z] 🔧 TOOL: open_browser called
[2026-06-24T18:30:01.200Z] 🌐 BROWSER: Launching Chromium browser...
[2026-06-24T18:30:02.500Z] ✅ SUCCESS: Browser launched successfully
[2026-06-24T18:30:02.600Z] 🔧 TOOL: navigate_to_url called with: https://...
[2026-06-24T18:30:05.000Z] ✅ SUCCESS: Navigated to URL
[2026-06-24T18:30:05.100Z] 🔧 TOOL: get_page_html called
[2026-06-24T18:30:05.300Z] ✅ SUCCESS: DOM extracted — 2340 characters
[2026-06-24T18:30:06.000Z] 🔧 TOOL: send_keys called: "John Doe"
[2026-06-24T18:30:07.000Z] ✅ SUCCESS: Typed "John Doe" into input
[2026-06-24T18:30:07.100Z] 🔧 TOOL: take_screenshot called
[2026-06-24T18:30:07.500Z] ✅ SUCCESS: Screenshot saved
```

## 🔧 Customization

### Changing the Target URL

Edit the `TASK_PROMPT` in `src/main.ts` to target a different website or perform different actions.

### Adding New Tools

1. Define a new tool in `src/tools/browser-tools.ts` using the `tool()` helper
2. Add it to the `browserTools` array at the bottom of the file
3. The agent will automatically have access to it

### Running Headless

To run without a visible browser, change `headless: false` to `headless: true` in `src/tools/browser-manager.ts`.

## 📄 License

MIT
