'use client';

import { useState, useEffect, useRef } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import { publicConfig } from '../../../../lib/config';
import { createClient } from '@/lib/supabase/client';

interface StreamToken {
  text: string;
}

interface UsageData {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model: string;
}

interface TimingData {
  ttft_ms?: number;
  total_ms?: number;
}

interface MemoryResult {
  text: string;
  score: number;
  source_type: string;
  session_id?: string | null;
}

interface MemoryData {
  results: MemoryResult[];
  total_tokens: number;
  results_count: number;
}

interface ModelInfo {
  model: string;
  display_name: string;
  input_per_mtok: number;
  output_per_mtok: number;
}

export default function PlaygroundPage() {
  const [message, setMessage] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [model, setModel] = useState('gpt-4o-mini');
  const [sessionId] = useState(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const y = now.getFullYear().toString();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `session-${y}${m}${d}-${hh}${mm}${ss}-${suffix}`;
  });
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [timing, setTiming] = useState<TimingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [memoryContext, setMemoryContext] = useState<MemoryData | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const firstTokenTimeRef = useRef<number | null>(null);

  // Fetch available models on mount
  useEffect(() => {
    fetchModels();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const fetchModels = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.warn('No session token available for fetching models');
        // Fallback to default models
        setModels([
          { model: 'gpt-4o-mini', display_name: 'GPT-4 Mini', input_per_mtok: 0.15, output_per_mtok: 0.6 },
          { model: 'gpt-4o', display_name: 'GPT-4', input_per_mtok: 5, output_per_mtok: 15 },
          { model: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', input_per_mtok: 0.5, output_per_mtok: 1.5 }
        ]);
        return;
      }

      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/admin/models`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
        // Set default model if current selection not in list
        if (data.models.length > 0 && !data.models.find((m: ModelInfo) => m.model === model)) {
          setModel(data.models[0].model);
        }
      } else {
        console.error('Failed to fetch models:', response.status);
        // Use fallback models
        setModels([
          { model: 'gpt-4o-mini', display_name: 'GPT-4 Mini', input_per_mtok: 0.15, output_per_mtok: 0.6 },
          { model: 'gpt-4o', display_name: 'GPT-4', input_per_mtok: 5, output_per_mtok: 15 },
          { model: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', input_per_mtok: 0.5, output_per_mtok: 1.5 }
        ]);
      }
    } catch (err) {
      console.error('Error fetching models:', err);
      // Use fallback models
      setModels([
        { model: 'gpt-4o-mini', display_name: 'GPT-4 Mini', input_per_mtok: 0.15, output_per_mtok: 0.6 },
        { model: 'gpt-4o', display_name: 'GPT-4', input_per_mtok: 5, output_per_mtok: 15 },
        { model: 'gpt-3.5-turbo', display_name: 'GPT-3.5 Turbo', input_per_mtok: 0.5, output_per_mtok: 1.5 }
      ]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isStreaming) return;

    // Reset state
    setIsStreaming(true);
    setResponse('');
    setUsage(null);
    setTiming(null);
    setError(null);
    setMemoryContext(null);
    startTimeRef.current = Date.now();
    firstTokenTimeRef.current = null;

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Please sign in to use the playground');
      }

      // Create request body
      const requestBody = {
        message: message.trim(),
        useMemory,
        sessionId,
        model
      };

      // Make POST request to initiate SSE stream
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      // Set up SSE connection
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // Process SSE stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              // Stream complete
              if (startTimeRef.current) {
                setTiming(prev => ({
                  ...prev,
                  total_ms: Date.now() - startTimeRef.current!
                }));
              }
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle different event types based on the event field in SSE
              if (parsed.text !== undefined) {
                // Token event
                if (!firstTokenTimeRef.current && parsed.text) {
                  firstTokenTimeRef.current = Date.now();
                  if (startTimeRef.current) {
                    setTiming(prev => ({
                      ...prev,
                      ttft_ms: firstTokenTimeRef.current! - startTimeRef.current!
                    }));
                  }
                }
                setResponse(prev => prev + parsed.text);
              } else if (parsed.tokens_in !== undefined) {
                // Usage event
                setUsage(parsed as UsageData);
              } else if (parsed.results !== undefined && parsed.results_count !== undefined) {
                // Memory context event
                setMemoryContext(parsed as MemoryData);
              } else if (parsed.finish_reason) {
                // Done event
                if (startTimeRef.current) {
                  setTiming(prev => ({
                    ...prev,
                    total_ms: Date.now() - startTimeRef.current!
                  }));
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', data, e);
            }
          } else if (line.startsWith('event: ')) {
            // Handle named events
            const eventType = line.slice(7);
            // Event type will be processed with next data line
          }
        }
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsStreaming(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  const formatCost = (cost: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 10,
      maximumFractionDigits: 10
    }).format(cost);
  };

  const formatTiming = (ms: number) => {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <>
      <AdminHeader
        title="Playground"
        subtitle="Test the AI chat system with different configurations"
      />

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div>
            <Card title="Configuration" icon="⚙️">
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isStreaming}
                  >
                    {models.map((m) => (
                      <option key={m.model} value={m.model}>
                        {m.display_name || m.model}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useMemory}
                      onChange={(e) => setUseMemory(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={isStreaming}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Use Memory Context
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Session ID
                  </label>
                  <input
                    type="text"
                    value={sessionId}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    disabled={isStreaming}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isStreaming || !message.trim()}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isStreaming ? 'Streaming...' : 'Send Message'}
                </button>
              </form>
            </Card>

            {/* Memory Context */}
            {memoryContext && memoryContext.results_count > 0 && (
              <Card title="Memory Context Retrieved" icon="🧠" className="mt-4">
                <div className="mt-4 space-y-3">
                  <div className="text-sm text-gray-600">
                    Retrieved {memoryContext.results_count} memory items ({memoryContext.total_tokens} tokens)
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {memoryContext.results.map((result, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-medium text-gray-500">
                            #{index + 1} • {result.source_type}
                          </span>
                          <span className="text-xs text-blue-600">
                            Score: {(result.score * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 line-clamp-3">
                          {result.text}
                        </div>
                        {result.session_id && (
                          <div className="text-xs text-gray-400 mt-1">
                            Session: {result.session_id}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Timing Info */}
            {timing && (
              <Card title="Performance" icon="⚡" className="mt-4">
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {timing.ttft_ms !== undefined && (
                    <div className="p-3 bg-purple-50 rounded-md">
                      <p className="text-xs text-purple-600 font-medium">Time to First Token</p>
                      <p className="text-lg font-bold text-purple-900">{formatTiming(timing.ttft_ms)}</p>
                    </div>
                  )}
                  {timing.total_ms !== undefined && (
                    <div className="p-3 bg-indigo-50 rounded-md">
                      <p className="text-xs text-indigo-600 font-medium">Total Duration</p>
                      <p className="text-lg font-bold text-indigo-900">{formatTiming(timing.total_ms)}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* API Endpoint Info */}
            <Card title="API Endpoint" icon="🔗" className="mt-4">
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <code className="text-sm text-gray-700">
                  POST {publicConfig.apiBaseUrl}/api/v1/chat
                </code>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                SSE Content-Type: text/event-stream
              </div>
            </Card>
          </div>

          {/* Response Panel */}
          <div>
            <Card title="Response" icon="💬">
              <div className="mt-4 min-h-[400px] p-4 bg-gray-50 rounded-md">
                {error ? (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-700">{error}</p>
                  </div>
                ) : response ? (
                  <div className="text-gray-700 whitespace-pre-wrap">{response}</div>
                ) : (
                  <div className="text-gray-400 italic">
                    {isStreaming ? 'Waiting for response...' : 'Response will appear here...'}
                  </div>
                )}
              </div>

              {/* Usage Stats */}
              {usage && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div className="p-3 bg-blue-50 rounded-md">
                    <p className="text-xs text-blue-600 font-medium">Input Tokens</p>
                    <p className="text-lg font-bold text-blue-900">{usage.tokens_in.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-md">
                    <p className="text-xs text-green-600 font-medium">Output Tokens</p>
                    <p className="text-lg font-bold text-green-900">{usage.tokens_out.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-md">
                    <p className="text-xs text-yellow-600 font-medium">Cost</p>
                    <p className="text-lg font-bold text-yellow-900">{formatCost(usage.cost_usd)}</p>
                  </div>
                </div>
              )}

              {/* Model Info */}
              {usage && (
                <div className="mt-2 text-xs text-gray-500 text-center">
                  Model: {usage.model}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
