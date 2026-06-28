/**
 * Structured logging utility for the Website Automation Agent.
 * 
 * Provides timestamped, categorized log output for easy debugging and tracing.
 * Includes an EventEmitter so the API route can intercept logs and stream them
 * to the frontend via Server-Sent Events (SSE).
 */

import { EventEmitter } from 'events';

/** Log level categories */
export type LogLevelName = 'TOOL' | 'SUCCESS' | 'ERROR' | 'AGENT' | 'INFO' | 'WARN' | 'BROWSER';

/** Structure of a log entry emitted via the EventEmitter */
export interface LogEntry {
  timestamp: string;
  level: LogLevelName;
  message: string;
  data?: string;
}

/**
 * Global event emitter for log events.
 * The API route subscribes to 'log' events on this emitter to stream them via SSE.
 */
export const logEmitter = new EventEmitter();
// Allow many listeners (one per concurrent SSE connection)
logEmitter.setMaxListeners(50);

/**
 * Generates an ISO timestamp string for log entries.
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Core log function that formats and outputs a structured log entry.
 * Also emits the log entry on the logEmitter for SSE streaming.
 * 
 * @param level - The log category/level
 * @param message - The log message
 * @param data - Optional additional data to include
 */
function log(level: LogLevelName, message: string, data?: unknown): void {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] ${level}`;

  // Format data for display
  const dataStr = data !== undefined
    ? (typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    : undefined;

  // Console output (preserved for CLI usage)
  if (dataStr) {
    console.log(`${prefix}: ${message}`, dataStr);
  } else {
    console.log(`${prefix}: ${message}`);
  }

  // Emit structured log entry for SSE streaming
  const entry: LogEntry = { timestamp, level, message };
  if (dataStr) {
    entry.data = dataStr;
  }
  logEmitter.emit('log', entry);
}

/** Logger interface exposed to the rest of the application */
export const logger = {
  /** Log a tool invocation */
  tool: (message: string, data?: unknown) => log('TOOL', message, data),

  /** Log a successful operation */
  success: (message: string, data?: unknown) => log('SUCCESS', message, data),

  /** Log an error */
  error: (message: string, data?: unknown) => log('ERROR', message, data),

  /** Log an agent decision or reasoning step */
  agent: (message: string, data?: unknown) => log('AGENT', message, data),

  /** Log general informational messages */
  info: (message: string, data?: unknown) => log('INFO', message, data),

  /** Log warnings */
  warn: (message: string, data?: unknown) => log('WARN', message, data),

  /** Log browser-specific events */
  browser: (message: string, data?: unknown) => log('BROWSER', message, data),
};
