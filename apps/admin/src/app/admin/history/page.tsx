'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { AdminHeader } from '@/components/admin/header';
import { ChevronRight } from 'lucide-react';

interface MemoryMetrics {
  totalMs: number;
  startMs: number;
  cost: number;
}

interface OpenAIMetrics {
  ttftMs: number;
  totalMs: number;
  startMs: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

interface UserMetrics {
  ttftMs: number;
  totalMs: number;
}

interface UserHistory {
  userId: string;
  name: string;
  messageCount?: number;
  memory: MemoryMetrics;
  openai: OpenAIMetrics;
  user?: UserMetrics;
  total: {
    cost: number;
    userTtftMs?: number;
    userTotalMs?: number;
  };
}

export default function HistoryPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/history');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch history');
      }
      
      setUsers(data.users || []);
    } catch (err) {
      console.error('Error fetching history:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '-';
    return `$${cost.toFixed(4)}`;
  };

  const formatTime = (ms: number) => {
    if (ms === 0) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens === 0) return '-';
    return tokens.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <AdminHeader 
        title="User History" 
        subtitle="View aggregated metrics for users in your memory context"
      />

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading history...</div>
        </div>
      )}

      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-red-600">Error: {error}</p>
        </Card>
      )}

      {!loading && !error && users.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No users found in your memory context</p>
        </Card>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="space-y-4">
          {users.map((user) => (
            <Card 
              key={user.userId} 
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer relative"
              onClick={() => {
                // Always navigate to the history page, even if no messages
                console.log('Navigating to user history:', { userId: user.userId, name: user.name });
                if (!user.userId) {
                  console.error('User ID is missing!', user);
                  alert('Error: User ID is missing');
                  return;
                }
                const url = `/admin/history/${user.userId}`;
                console.log('Navigating to:', url);
                router.push(url);
              }}
            >
              <div className="absolute top-6 right-6">
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="space-y-4">
                {/* User Header */}
                <div className="border-b pb-3">
                  <h3 className="text-lg font-semibold">{user.name}</h3>
                  <p className="text-sm text-gray-500">ID: {user.userId}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-blue-600">Click to view chat history</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      user.messageCount === 0 
                        ? 'bg-yellow-100 text-yellow-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {user.messageCount ?? 0} {user.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Memory Block */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-gray-700">Memory</h4>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total MS (avg):</span>
                        <span className="font-mono">{formatTime(user.memory.totalMs)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Start MS (avg):</span>
                        <span className="font-mono">{formatTime(user.memory.startMs)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cost:</span>
                        <span className="font-mono text-green-600">{formatCost(user.memory.cost)}</span>
                      </div>
                    </div>
                  </div>

                  {/* OpenAI Block */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-gray-700">OpenAI</h4>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">TTFT (avg):</span>
                        <span className="font-mono">{formatTime(user.openai.ttftMs)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total MS (avg):</span>
                        <span className="font-mono">{formatTime(user.openai.totalMs)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Start MS (avg):</span>
                        <span className="font-mono">{formatTime(user.openai.startMs)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Cost:</span>
                        <span className="font-mono text-green-600">{formatCost(user.openai.cost)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tokens In:</span>
                        <span className="font-mono">{formatTokens(user.openai.tokensIn)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tokens Out:</span>
                        <span className="font-mono">{formatTokens(user.openai.tokensOut)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Block */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-gray-700">Total</h4>
                    <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total Cost:</span>
                        <span className="font-mono text-blue-600 font-semibold">
                          {formatCost(user.total.cost)}
                        </span>
                      </div>
                      {user.total.userTtftMs !== undefined && user.total.userTtftMs > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">User TTFT (avg):</span>
                          <span className="font-mono">{formatTime(user.total.userTtftMs)}</span>
                        </div>
                      )}
                      {user.total.userTotalMs !== undefined && user.total.userTotalMs > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">User Total (avg):</span>
                          <span className="font-mono">{formatTime(user.total.userTotalMs)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {/* Summary Card */}
          <Card className="p-6 bg-gray-50">
            <h3 className="text-lg font-semibold mb-3">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Users</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Memory Cost</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCost(users.reduce((sum, u) => sum + u.memory.cost, 0))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total OpenAI Cost</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCost(users.reduce((sum, u) => sum + u.openai.cost, 0))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Grand Total</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCost(users.reduce((sum, u) => sum + u.total.cost, 0))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Tokens In</p>
                <p className="text-2xl font-bold">
                  {formatTokens(users.reduce((sum, u) => sum + u.openai.tokensIn, 0))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Tokens Out</p>
                <p className="text-2xl font-bold">
                  {formatTokens(users.reduce((sum, u) => sum + u.openai.tokensOut, 0))}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}