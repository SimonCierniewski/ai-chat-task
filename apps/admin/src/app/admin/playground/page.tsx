'use client';

import { useState } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import { publicConfig } from '../../../../lib/config';

export default function PlaygroundPage() {
  const [message, setMessage] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [model, setModel] = useState('gpt-4o-mini');
  const [sessionId] = useState(`session-${Date.now()}`);
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isStreaming) return;

    setIsStreaming(true);
    setResponse('');

    // This would connect to the actual SSE endpoint
    console.log('Sending message:', { message, useMemory, model, sessionId });
    
    // Simulate response for now
    setTimeout(() => {
      setResponse('This is where the SSE stream response would appear...');
      setIsStreaming(false);
    }, 2000);
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
                  >
                    <option value="gpt-4o-mini">GPT-4 Mini</option>
                    <option value="gpt-4o">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useMemory}
                      onChange={(e) => setUseMemory(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
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

            {/* API Endpoint Info */}
            <Card title="API Endpoint" icon="🔗" className="mt-4">
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <code className="text-sm text-gray-700">
                  POST {publicConfig.apiBaseUrl}/api/v1/chat
                </code>
              </div>
            </Card>
          </div>

          {/* Response Panel */}
          <div>
            <Card title="Response" icon="💬">
              <div className="mt-4 min-h-[400px] p-4 bg-gray-50 rounded-md">
                {response ? (
                  <div className="text-gray-700 whitespace-pre-wrap">{response}</div>
                ) : (
                  <div className="text-gray-400 italic">
                    Response will appear here...
                  </div>
                )}
              </div>
              
              {/* Usage Stats */}
              {response && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 rounded-md">
                    <p className="text-xs text-blue-600 font-medium">Tokens</p>
                    <p className="text-lg font-bold text-blue-900">1,234</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-md">
                    <p className="text-xs text-green-600 font-medium">Cost</p>
                    <p className="text-lg font-bold text-green-900">$0.0123</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}