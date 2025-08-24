'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

interface MessageMetadata {
  startMs?: number;
  ttftMs?: number;
  totalMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  price?: number;
  model?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'memory';
  content: string;
  createdAt: string;
  metadata: MessageMetadata;
}

interface ChatUser {
  id: string;
  name: string;
  experimentTitle?: string;
}

export default function ChatHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  
  const [user, setUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('ChatHistoryPage mounted with userId:', userId);
    if (userId) {
      fetchChatHistory();
    }
  }, [userId]);

  const fetchChatHistory = async () => {
    try {
      console.log('Fetching chat history for userId:', userId);
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/history/${userId}`);
      console.log('API response status:', response.status);
      const data = await response.json();
      console.log('API response data:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch chat history');
      }
      
      setUser(data.user);
      setMessages(data.messages || []);
      console.log('Set user and messages:', { user: data.user, messageCount: data.messages?.length });
    } catch (err) {
      console.error('Error fetching chat history:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (cost?: number) => {
    if (!cost) return null;
    return `$${cost.toFixed(6)}`;
  };

  const getMessageStyle = (role: string) => {
    switch (role) {
      case 'user':
        return 'bg-blue-50 border-blue-200 ml-0 mr-auto';
      case 'assistant':
        return 'bg-white border-gray-200 ml-auto mr-0';
      case 'system':
      case 'memory':
        return 'bg-gray-50 border-gray-200 ml-auto mr-0 opacity-75';
      default:
        return 'bg-white border-gray-200';
    }
  };

  const getMessageAlignment = (role: string) => {
    return role === 'user' ? 'items-start' : 'items-end';
  };

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/admin/history')}
            className="mt-1 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900">
              Chat History: {user ? (
                user.name && user.experimentTitle ? 
                  `${user.name}, ${user.experimentTitle}` :
                  user.name || user.experimentTitle || 'Unknown User'
              ) : 'Loading...'}
            </h2>
            <p className="text-gray-600 mt-1">User ID: {userId}</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading chat history...</div>
        </div>
      )}

      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-red-600">Error: {error}</p>
        </Card>
      )}

      {!loading && !error && messages.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No messages found for this user</p>
        </Card>
      )}

      {!loading && !error && messages.length > 0 && (
        <div className="space-y-4 max-w-6xl mx-auto">
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`flex ${getMessageAlignment(message.role)}`}
            >
              <Card 
                className={`p-4 max-w-3xl ${getMessageStyle(message.role)}`}
              >
                {/* Role Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`
                    text-xs font-semibold px-2 py-1 rounded
                    ${message.role === 'user' ? 'bg-blue-100 text-blue-700' : ''}
                    ${message.role === 'assistant' ? 'bg-green-100 text-green-700' : ''}
                    ${message.role === 'system' ? 'bg-gray-100 text-gray-600' : ''}
                    ${message.role === 'memory' ? 'bg-purple-100 text-purple-700' : ''}
                  `}>
                    {message.role.toUpperCase()}
                  </span>
                  {message.metadata.model && (
                    <span className="text-xs text-gray-500">
                      {message.metadata.model}
                    </span>
                  )}
                </div>

                {/* Message Content */}
                <div className="prose prose-sm max-w-none mb-3">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Metadata Footer */}
                <div className="border-t pt-2 mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>{formatTime(message.createdAt)}</span>
                  
                  {message.metadata.ttftMs && (
                    <span>TTFT: {formatDuration(message.metadata.ttftMs)}</span>
                  )}
                  
                  {message.metadata.totalMs && (
                    <span>Duration: {formatDuration(message.metadata.totalMs)}</span>
                  )}
                  
                  {message.metadata.tokensIn && (
                    <span>Tokens In: {message.metadata.tokensIn}</span>
                  )}
                  
                  {message.metadata.tokensOut && (
                    <span>Tokens Out: {message.metadata.tokensOut}</span>
                  )}
                  
                  {message.metadata.price && (
                    <span className="font-semibold text-green-600">
                      Cost: {formatCost(message.metadata.price)}
                    </span>
                  )}
                </div>
              </Card>
            </div>
          ))}

          {/* Summary Statistics */}
          <Card className="p-6 mt-16 bg-gray-50">
            <h3 className="text-lg font-semibold mb-4">Conversation Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Messages</p>
                <p className="text-2xl font-bold">{messages.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">User Messages</p>
                <p className="text-2xl font-bold">
                  {messages.filter(m => m.role === 'user').length}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Assistant Messages</p>
                <p className="text-2xl font-bold">
                  {messages.filter(m => m.role === 'assistant').length}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCost(
                    messages.reduce((sum, m) => sum + (m.metadata.price || 0), 0)
                  ) || '$0.00'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Tokens In</p>
                <p className="text-2xl font-bold">
                  {messages.reduce((sum, m) => sum + (m.metadata.tokensIn || 0), 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Tokens Out</p>
                <p className="text-2xl font-bold">
                  {messages.reduce((sum, m) => sum + (m.metadata.tokensOut || 0), 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg TTFT</p>
                <p className="text-2xl font-bold">
                  {(() => {
                    const ttfts = messages
                      .filter(m => m.metadata.ttftMs)
                      .map(m => m.metadata.ttftMs!);
                    if (ttfts.length === 0) return 'N/A';
                    const avg = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;
                    return formatDuration(avg);
                  })()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Response Time</p>
                <p className="text-2xl font-bold">
                  {(() => {
                    const times = messages
                      .filter(m => m.metadata.totalMs)
                      .map(m => m.metadata.totalMs!);
                    if (times.length === 0) return 'N/A';
                    const avg = times.reduce((a, b) => a + b, 0) / times.length;
                    return formatDuration(avg);
                  })()}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}