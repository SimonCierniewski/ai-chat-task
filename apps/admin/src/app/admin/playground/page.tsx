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
  openai_ms?: number;
}

interface MemoryData {
  results: string | undefined;
  memoryMs: number;
}

interface ModelInfo {
  model: string;
  display_name: string;
  input_per_mtok: number;
  output_per_mtok: number;
}

interface PlaygroundUser {
  id: string;
  name: string;
  label: string;
}

export default function PlaygroundPage() {
  const [message, setMessage] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [contextMode, setContextMode] = useState<'basic' | 'summarized'>('basic');
  const [model, setModel] = useState('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant. Use any provided context to give accurate and relevant responses.');
  const [testingMode, setTestingMode] = useState(false);
  
  // Import conversations state
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'zep-only' | 'memory-test' | 'full-test'>('zep-only');
  const [enableDelay, setEnableDelay] = useState(false);
  const [humanSpeed, setHumanSpeed] = useState(5);
  const [isImporting, setIsImporting] = useState(false);
  const importTextAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // User management state
  const [users, setUsers] = useState<PlaygroundUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [editingUserName, setEditingUserName] = useState('');
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [userLoading, setUserLoading] = useState(false);
  
  // Session ID now depends on selected user
  const [sessionId, setSessionId] = useState(() => {
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
  const initializeRef = useRef<boolean>(false);

  // Fetch available models, users, and initialize chat on mount
  useEffect(() => {
    // Prevent double initialization in development mode
    if (initializeRef.current) return;
    initializeRef.current = true;

    fetchModels();
    fetchUsers();
    initializeChat();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []); // Remove sessionId dependency - it's stable from useState initializer
  
  // Update sessionId when selected user changes
  useEffect(() => {
    if (selectedUserId) {
      // Use userId as sessionId/threadId
      setSessionId(selectedUserId);
    }
  }, [selectedUserId]);

  const initializeChat = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.warn('No session token for chat initialization');
        return;
      }

      // Call the init endpoint to ensure user and thread exist
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/chat/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Chat initialized:', data);
      } else {
        console.warn('Chat initialization failed:', response.status);
      }
    } catch (error) {
      console.error('Error initializing chat:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users/list');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
        // Select first user if available
        if (data.users && data.users.length > 0 && !selectedUserId) {
          setSelectedUserId(data.users[0].id);
          const currentUser = data.users[0];
          setEditingUserName(currentUser.name);
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const createUser = async () => {
    if (!newUserName.trim()) return;
    
    setUserLoading(true);
    try {
      const response = await fetch('/api/admin/users/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUserName.trim() })
      });
      
      if (response.ok) {
        const data = await response.json();
        const newUser = data.user;
        setUsers(prev => [...prev, newUser]);
        setSelectedUserId(newUser.id);
        setEditingUserName(newUser.name);
        setNewUserName('');
        setShowCreateUser(false);
      } else {
        const error = await response.json();
        console.error('Failed to create user:', error);
      }
    } catch (error) {
      console.error('Error creating user:', error);
    } finally {
      setUserLoading(false);
    }
  };

  const updateUserName = async () => {
    if (!editingUserName.trim() || !selectedUserId) return;
    
    setUserLoading(true);
    try {
      const response = await fetch('/api/admin/users/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: selectedUserId,
          name: editingUserName.trim() 
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(prev => prev.map(u => 
          u.id === selectedUserId 
            ? { ...u, name: data.user.name, label: data.user.label }
            : u
        ));
        setIsEditingUser(false);
      } else {
        const error = await response.json();
        console.error('Failed to update user:', error);
      }
    } catch (error) {
      console.error('Error updating user:', error);
    } finally {
      setUserLoading(false);
    }
  };

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
        contextMode,
        sessionId,
        model,
        returnMemory: true, // Always request memory context in playground for debugging
        systemPrompt: systemPrompt.trim() || undefined,
        testingMode // Add testing mode parameter
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
      let currentEvent: string | null = null;
      
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') {
            // Empty line resets the event
            currentEvent = null;
            continue;
          }
          
          if (line.startsWith('event: ')) {
            // Store the event type for the next data line
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
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
              
              // Handle based on current event type
              if (currentEvent === 'memory') {
                console.log('Memory event received:', parsed);
                setMemoryContext(parsed as MemoryData);
              } else if (currentEvent === 'token' || (!currentEvent && parsed.text !== undefined)) {
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
              } else if (currentEvent === 'usage' || (!currentEvent && parsed.tokens_in !== undefined)) {
                // Usage event
                setUsage(parsed as UsageData);
              } else if (currentEvent === 'done' || (!currentEvent && parsed.finish_reason)) {
                // Done event - extract OpenAI metrics
                if (startTimeRef.current) {
                  setTiming(prev => ({
                    ...prev,
                    total_ms: Date.now() - startTimeRef.current!,
                    ttft_ms: parsed.ttft_ms || prev?.ttft_ms,
                    openai_ms: parsed.openai_ms
                  }));
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', currentEvent, data, e);
            }
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

  const handleAddAssistant = () => {
    setImportText(prev => prev + '\n\n## Assistant ##\n');
    // Scroll to bottom of textarea
    setTimeout(() => {
      if (importTextAreaRef.current) {
        importTextAreaRef.current.scrollTop = importTextAreaRef.current.scrollHeight;
      }
    }, 10);
  };

  const handleAddUser = () => {
    setImportText(prev => prev + '\n\n## User ##\n');
    // Scroll to bottom of textarea
    setTimeout(() => {
      if (importTextAreaRef.current) {
        importTextAreaRef.current.scrollTop = importTextAreaRef.current.scrollHeight;
      }
    }, 10);
  };

  const parseConversations = (text: string) => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const sections = text.split(/## (User|Assistant) ##/i).filter(s => s.trim());
    
    for (let i = 0; i < sections.length; i += 2) {
      const role = sections[i].toLowerCase().trim() as 'user' | 'assistant';
      const content = sections[i + 1]?.trim();
      if (content) {
        messages.push({ role, content });
      }
    }
    
    return messages;
  };

  const calculateDelay = (text: string) => {
    if (!enableDelay) return 0;
    // Approximate human reading/writing speed
    // humanSpeed from 0-10, where 5 is average
    const wordsPerMinute = 40 + (humanSpeed * 20); // 40-240 WPM
    const words = text.split(/\s+/).length;
    const minutes = words / wordsPerMinute;
    return Math.max(500, Math.min(minutes * 60 * 1000, 30000)); // Between 0.5s and 30s
  };

  const handleImportConversations = async () => {
    if (!importText.trim() || isImporting || !selectedUserId) return;
    
    setIsImporting(true);
    try {
      const messages = parseConversations(importText);
      if (messages.length === 0) {
        setError('No valid messages found. Use "## User ##" and "## Assistant ##" to separate messages.');
        return;
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Please sign in to import conversations');
      }

      // Process messages based on import mode
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        if (importMode === 'zep-only') {
          // Just save to Zep and DB without calling OpenAI
          await fetch(`${publicConfig.apiBaseUrl}/api/v1/memory/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              sessionId: selectedUserId,
              message: msg
            })
          });
        } else if (importMode === 'memory-test') {
          // Save messages and test memory retrieval
          await fetch(`${publicConfig.apiBaseUrl}/api/v1/memory/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              sessionId: selectedUserId,
              message: msg,
              testMemory: true
            })
          });
        } else if (importMode === 'full-test') {
          // Only send user messages, get real AI responses
          if (msg.role === 'user') {
            const requestBody = {
              message: msg.content,
              useMemory,
              contextMode,
              sessionId: selectedUserId,
              model,
              returnMemory: false,
              systemPrompt: systemPrompt.trim() || undefined
            };
            
            await fetch(`${publicConfig.apiBaseUrl}/api/v1/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'Accept': 'text/event-stream'
              },
              body: JSON.stringify(requestBody)
            });
          }
        }
        
        // Apply delay if enabled
        if (enableDelay && i < messages.length - 1) {
          const delay = calculateDelay(msg.content);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      setImportText('');
      setError(null);
      // Show success message
      alert(`Successfully imported ${messages.length} messages`);
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import conversations');
    } finally {
      setIsImporting(false);
    }
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
          <div className="space-y-6">
            {/* User Card */}
            <Card title="User" icon="👤">
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select User
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        setSelectedUserId(e.target.value);
                        const user = users.find(u => u.id === e.target.value);
                        if (user) {
                          setEditingUserName(user.name);
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isStreaming || userLoading}
                    >
                      {users.length === 0 && (
                        <option value="">No users available</option>
                      )}
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCreateUser(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                      disabled={isStreaming || userLoading}
                    >
                      + New
                    </button>
                  </div>
                </div>

                {/* Create New User Form */}
                {showCreateUser && (
                  <div className="p-3 bg-gray-50 rounded-md space-y-3">
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Enter user name..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={userLoading}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={createUser}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                        disabled={userLoading || !newUserName.trim()}
                      >
                        {userLoading ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateUser(false);
                          setNewUserName('');
                        }}
                        className="flex-1 px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
                        disabled={userLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit User Name */}
                {selectedUserId && !showCreateUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingUserName}
                        onChange={(e) => setEditingUserName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!isEditingUser || userLoading}
                      />
                      {!isEditingUser ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingUser(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          disabled={userLoading}
                        >
                          Edit
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={updateUserName}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                            disabled={userLoading || !editingUserName.trim()}
                          >
                            {userLoading ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingUser(false);
                              const user = users.find(u => u.id === selectedUserId);
                              if (user) {
                                setEditingUserName(user.name);
                              }
                            }}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                            disabled={userLoading}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* User ID Display */}
                {selectedUserId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User ID
                    </label>
                    <input
                      type="text"
                      value={selectedUserId}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This ID is used as the thread ID in Zep
                    </p>
                  </div>
                )}
              </div>
            </Card>
            
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

                <div className="space-y-3">
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

                  {useMemory && (
                    <div className="ml-6 space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Context Mode
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="contextMode"
                            value="basic"
                            checked={contextMode === 'basic'}
                            onChange={(e) => setContextMode(e.target.value as 'basic' | 'summarized')}
                            className="text-blue-600 focus:ring-blue-500"
                            disabled={isStreaming}
                          />
                          <span className="text-sm text-gray-700">Basic</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="contextMode"
                            value="summarized"
                            checked={contextMode === 'summarized'}
                            onChange={(e) => setContextMode(e.target.value as 'basic' | 'summarized')}
                            className="text-blue-600 focus:ring-blue-500"
                            disabled={isStreaming}
                          />
                          <span className="text-sm text-gray-700">Summarized</span>
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">
                        Basic: Raw context as stored. Summarized: AI-processed summary.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={testingMode}
                      onChange={(e) => setTestingMode(e.target.checked)}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      disabled={isStreaming}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Testing Mode: Don't save messages
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 ml-6 mt-1">
                    When enabled, messages won't be stored in Zep or the database. Use this to test different responses.
                  </p>
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

            {/* Performance Metrics */}
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

            {/* System Prompt Card */}
            <Card title="System Prompt" icon="🤖" className="mt-4">
              <div className="mt-4">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter a custom system prompt..."
                  disabled={isStreaming}
                />
                <p className="mt-2 text-xs text-gray-500">
                  This prompt sets the behavior and context for the AI assistant.
                </p>
              </div>
            </Card>

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
            {/* Memory Context - Moved to top of right column */}
            <Card title="Memory Context" icon="🧠">
              <div className="mt-4 space-y-3">
                {memoryContext && memoryContext.results ? (
                  <>
                    <div className="text-sm text-gray-600">
                      Retrieved in {memoryContext.memoryMs}ms
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                          {memoryContext.results}
                        </pre>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 italic text-center py-8">
                    {useMemory ? (
                      isStreaming ? 'Retrieving memory context...' : 'No memory context retrieved'
                    ) : (
                      'Memory retrieval is disabled'
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Response Card */}
            <Card title="Response" icon="💬" className="mt-4">
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
              {/* OpenAI Processing Times */}
              {timing && (timing.ttft_ms !== undefined || timing.openai_ms !== undefined) && (
                <div className="mt-2 px-4 py-2 bg-blue-50 rounded-md">
                  <div className="flex items-center gap-4 text-sm text-blue-700">
                    {timing.ttft_ms !== undefined && (
                      <>
                        <span className="font-medium">TTFT:</span>
                        <span>{formatTiming(timing.ttft_ms)}</span>
                      </>
                    )}
                    {timing.openai_ms !== undefined && (
                      <>
                        <span className="font-medium">OpenAI Processing:</span>
                        <span>{formatTiming(timing.openai_ms)}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

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

        {/* Import Conversations Card - Full width at bottom */}
        <div className="mt-8">
          <Card title="Import Conversations" icon="📥">
            <div className="mt-4 space-y-4">
              {/* Import Mode Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Import Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="importMode"
                      value="zep-only"
                      checked={importMode === 'zep-only'}
                      onChange={(e) => setImportMode(e.target.value as any)}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      disabled={isImporting}
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Generate ZEP graph only</span>
                      <p className="text-xs text-gray-500">
                        It only saves messages in ZEP and DB, without calling memory and OpenAI, to focus on testing when graph is completed. 
                        Note: check if ZEP processed all data, before continuing testing.
                      </p>
                    </div>
                  </label>
                  
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="importMode"
                      value="memory-test"
                      checked={importMode === 'memory-test'}
                      onChange={(e) => setImportMode(e.target.value as any)}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      disabled={isImporting}
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Test memory context</span>
                      <p className="text-xs text-gray-500">
                        It adds user and assistant messages, but for each turn it generates memory context from ZEP. 
                        It allows test quality and speed of generated memory context and compare it to the same conversations, 
                        but with different parameters. Note: consider adding delays to give ZEP time to process each message.
                      </p>
                    </div>
                  </label>
                  
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="importMode"
                      value="full-test"
                      checked={importMode === 'full-test'}
                      onChange={(e) => setImportMode(e.target.value as any)}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      disabled={isImporting}
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Test memory and OpenAI answers</span>
                      <p className="text-xs text-gray-500">
                        It ignores assistant messages and only sends user messages. 
                        It allows to test quality and speed of memory context and OpenAI answers.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Delay Parameters */}
              <div className="p-3 bg-gray-50 rounded-md space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enableDelay"
                    checked={enableDelay}
                    onChange={(e) => setEnableDelay(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    disabled={isImporting}
                  />
                  <label htmlFor="enableDelay" className="text-sm font-medium text-gray-700">
                    Enable delay between messages
                  </label>
                </div>
                
                {enableDelay && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Human writing/reading speed (0-10)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={humanSpeed}
                      onChange={(e) => setHumanSpeed(parseFloat(e.target.value))}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isImporting}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      0 = very slow (40 WPM), 5 = average (140 WPM), 10 = very fast (240 WPM)
                    </p>
                  </div>
                )}
              </div>

              {/* Import Text Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Conversation Messages
                </label>
                <textarea
                  ref={importTextAreaRef}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste or type your conversation here. Use ## User ## and ## Assistant ## to separate messages..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  rows={10}
                  disabled={isImporting}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddUser}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400"
                    disabled={isImporting}
                  >
                    + User
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAssistant}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400"
                    disabled={isImporting}
                  >
                    + Assistant
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={handleImportConversations}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={isImporting || !importText.trim() || !selectedUserId}
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
              </div>

              {/* User Selection Warning */}
              {!selectedUserId && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-700">
                    Please select a user from the User card above before importing conversations.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
