'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: string;
}

interface Screenshot {
  filename: string;
  path: string;
}

interface FormField {
  id: string;
  key: string;
  value: string;
}

type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

// ─── Color mapping for log levels ────────────────────────────────────────────

const LOG_COLORS: Record<string, string> = {
  TOOL: 'var(--accent-cyan)',
  SUCCESS: 'var(--accent-green)',
  ERROR: 'var(--accent-red)',
  AGENT: 'var(--accent-violet)',
  INFO: 'var(--text-secondary)',
  WARN: 'var(--accent-amber)',
  BROWSER: '#60a5fa',
};

const LOG_ICONS: Record<string, string> = {
  TOOL: '🔧',
  SUCCESS: '✅',
  ERROR: '❌',
  AGENT: '🤖',
  INFO: 'ℹ️',
  WARN: '⚠️',
  BROWSER: '🌐',
};

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function Home() {
  // State
  const [url, setUrl] = useState('https://ui.shadcn.com/docs/forms/react-hook-form');
  const [formFields, setFormFields] = useState<FormField[]>([
    { id: '1', key: 'username', value: 'TestUser123' },
    { id: '2', key: 'bio', value: 'AI automation testing' },
  ]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [finalOutput, setFinalOutput] = useState<string>('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // Refs
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ─── Form Field Management ──────────────────────────────────────────────

  const addField = () => {
    setFormFields((prev) => [
      ...prev,
      { id: Date.now().toString(), key: '', value: '' },
    ]);
  };

  const removeField = (id: string) => {
    setFormFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateField = (id: string, prop: 'key' | 'value', val: string) => {
    setFormFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [prop]: val } : f))
    );
  };

  // ─── Run Agent ──────────────────────────────────────────────────────────

  const runAgent = useCallback(async () => {
    if (status === 'running') return;

    // Reset state
    setLogs([]);
    setScreenshots([]);
    setFinalOutput('');
    setStatus('running');

    // Build form data object
    const formData: Record<string, string> = {};
    for (const field of formFields) {
      if (field.key.trim()) {
        formData[field.key.trim()] = field.value;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formData }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start agent');
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let isFinished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '' && currentEvent && currentData) {
            // Complete event — process it
            try {
              const parsed = JSON.parse(currentData);

              switch (currentEvent) {
                case 'log':
                  setLogs((prev) => [...prev, parsed as LogEntry]);
                  break;
                case 'screenshot':
                  setScreenshots((prev) => [...prev, parsed as Screenshot]);
                  break;
                case 'complete':
                  setFinalOutput(parsed.finalOutput || '');
                  setStatus('complete');
                  isFinished = true;
                  break;
                case 'error':
                  setFinalOutput(`Error: ${parsed.message}`);
                  setStatus('error');
                  isFinished = true;
                  break;
              }
            } catch {
              // Ignore parse errors
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }

      // If we exited the loop without a complete/error event
      if (!isFinished) {
        setStatus('complete');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        setLogs((prev) => [
          ...prev,
          { timestamp: new Date().toISOString(), level: 'WARN', message: 'Agent run cancelled by user' },
        ]);
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setStatus('error');
        setFinalOutput(`Error: ${message}`);
        setLogs((prev) => [
          ...prev,
          { timestamp: new Date().toISOString(), level: 'ERROR', message },
        ]);
      }
    }
  }, [url, formFields, status]);

  const cancelAgent = () => {
    abortRef.current?.abort();
  };

  // ─── Status Label ───────────────────────────────────────────────────────

  const statusLabel: Record<AgentStatus, string> = {
    idle: 'Ready',
    running: 'Running...',
    complete: 'Completed',
    error: 'Error',
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        padding: '20px',
        gap: '16px',
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* ─── Header ──────────────────────────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            className="gradient-text"
            style={{ fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}
          >
            Website Automation Agent
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>
            AI-powered browser automation — paste a URL, configure fields, and watch it work
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`status-dot status-${status}`} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            {statusLabel[status]}
          </span>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* ─── Left: Config Panel ──────────────────────────────── */}
        <div
          className="glass-panel"
          style={{
            width: '380px',
            flexShrink: 0,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Configuration
          </h2>

          {/* URL Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Target URL
            </label>
            <input
              className="glow-input"
              type="url"
              placeholder="https://example.com/form"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status === 'running'}
            />
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Form Data
              </label>
              <button
                className="btn-ghost"
                onClick={addField}
                disabled={status === 'running'}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                + Add Field
              </button>
            </div>

            {formFields.map((field) => (
              <div key={field.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  className="glow-input"
                  placeholder="field name"
                  value={field.key}
                  onChange={(e) => updateField(field.id, 'key', e.target.value)}
                  disabled={status === 'running'}
                  style={{ flex: '0 0 120px', fontSize: '13px', padding: '8px 10px' }}
                />
                <input
                  className="glow-input"
                  placeholder="value"
                  value={field.value}
                  onChange={(e) => updateField(field.id, 'value', e.target.value)}
                  disabled={status === 'running'}
                  style={{ flex: 1, fontSize: '13px', padding: '8px 10px' }}
                />
                <button
                  className="btn-danger"
                  onClick={() => removeField(field.id)}
                  disabled={status === 'running'}
                  title="Remove field"
                >
                  ✕
                </button>
              </div>
            ))}

            {formFields.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                No fields configured — agent will use sample data
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            {status === 'running' ? (
              <button className="btn-primary" onClick={cancelAgent} style={{ flex: 1, background: 'var(--accent-red)' }}>
                Cancel
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={runAgent}
                disabled={!url.trim()}
                style={{ flex: 1 }}
              >
                ▶ Run Agent
              </button>
            )}
          </div>

          {/* Final Output */}
          {finalOutput && (
            <div
              style={{
                background: status === 'error' ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)',
                border: `1px solid ${status === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)'}`,
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                lineHeight: 1.6,
                color: status === 'error' ? 'var(--accent-red)' : 'var(--accent-green)',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflowY: 'auto',
              }}
            >
              {finalOutput}
            </div>
          )}
        </div>

        {/* ─── Right: Logs Panel ───────────────────────────────── */}
        <div
          className="glass-panel"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Logs Header */}
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
              Agent Logs
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {logs.length} entries
            </span>
          </div>

          {/* Logs Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '12.5px',
              lineHeight: 1.7,
            }}
          >
            {logs.length === 0 && status === 'idle' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                }}
              >
                Logs will appear here when the agent starts running...
              </div>
            )}

            {logs.map((log, i) => (
              <div
                key={i}
                className="log-entry"
                style={{
                  padding: '3px 0',
                  borderBottom: '1px solid rgba(99,110,135,0.08)',
                }}
              >
                <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ marginRight: '6px' }}>{LOG_ICONS[log.level] || ''}</span>
                <span
                  style={{
                    color: LOG_COLORS[log.level] || 'var(--text-secondary)',
                    fontWeight: 600,
                    marginRight: '8px',
                    fontSize: '11px',
                  }}
                >
                  [{log.level}]
                </span>
                <span style={{ color: 'var(--text-primary)' }}>{log.message}</span>
                {log.data && (
                  <div
                    style={{
                      color: 'var(--text-muted)',
                      marginLeft: '24px',
                      marginTop: '2px',
                      whiteSpace: 'pre-wrap',
                      fontSize: '11.5px',
                    }}
                  >
                    {log.data}
                  </div>
                )}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* ─── Bottom: Screenshots Panel ─────────────────────────── */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 20px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Screenshots
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {screenshots.length} captured
          </span>
        </div>

        {screenshots.length === 0 ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '13px',
              padding: '20px 0',
              textAlign: 'center',
            }}
          >
            Screenshots will appear here as the agent captures them...
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              overflowX: 'auto',
              paddingBottom: '8px',
            }}
          >
            {screenshots.map((ss, i) => (
              <div
                key={i}
                className="screenshot-thumb"
                onClick={() => setExpandedImage(ss.path)}
                style={{ position: 'relative' }}
              >
                <img
                  src={ss.path}
                  alt={ss.filename}
                  style={{
                    height: '120px',
                    width: 'auto',
                    display: 'block',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                    padding: '4px 8px',
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {ss.filename}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Image Modal ─────────────────────────────────────── */}
      {expandedImage && (
        <div className="modal-overlay" onClick={() => setExpandedImage(null)}>
          <img
            src={expandedImage}
            alt="Expanded screenshot"
            className="modal-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
