'use client';

import { useState, useEffect, useRef } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import { publicConfig } from '../../../../lib/config';
import { createClient } from '@/lib/supabase/client';

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
  experimentTitle: string;
  label: string;
}

export default function PlaygroundPage() {
  const [message, setMessage] = useState('');
  const [useMemory, setUseMemory] = useState(true);
  const [contextMode, setContextMode] = useState<'basic' | 'summarized' | 'node_search' | 'edge_search' | 'node_edge_search' | 'bfs'>('basic');
  const [model, setModel] = useState('gpt-4o-mini');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant. Use any provided context to give accurate and relevant responses.');
  const [testingMode, setTestingMode] = useState(false);
  const [pastMessagesCount, setPastMessagesCount] = useState(4);
  
  // Graph search parameters
  const [nodeSearchLimit, setNodeSearchLimit] = useState(10);
  const [nodeSearchReranker, setNodeSearchReranker] = useState<'cross_encoder' | 'rrf' | 'mmr' | 'episode_mentions' | 'node_distance'>('cross_encoder');
  const [edgeSearchLimit, setEdgeSearchLimit] = useState(10);
  const [edgeSearchReranker, setEdgeSearchReranker] = useState<'cross_encoder' | 'rrf' | 'mmr' | 'episode_mentions' | 'node_distance'>('cross_encoder');
  const [minFactRating, setMinFactRating] = useState(0.0);
  const [episodeSearchLimit, setEpisodeSearchLimit] = useState(10);
  const [mmrLambda, setMmrLambda] = useState(0.5);
  const [centerNodeUuid, setCenterNodeUuid] = useState('');
  
  // Generic context mode parameters
  const [genericMinRating, setGenericMinRating] = useState(0.0);
  
  // Fact ratings state
  const [factRatingInstruction, setFactRatingInstruction] = useState('Rate the facts by poignancy. Highly poignant facts have a significant emotional impact or relevance to the user. Facts with low poignancy are minimally relevant or of little emotional significance.');
  const [factRatingHigh, setFactRatingHigh] = useState("The user received news of a family member's serious illness.");
  const [factRatingMedium, setFactRatingMedium] = useState('The user completed a challenging marathon.');
  const [factRatingLow, setFactRatingLow] = useState('The user bought a new brand of toothpaste.');
  const [isUpdatingFactRatings, setIsUpdatingFactRatings] = useState(false);
  
  // Ontology state
  const [ontologyEntities, setOntologyEntities] = useState('{\n  "Person": {\n    "description": "A human being"\n  },\n  "Organization": {\n    "description": "A company, institution, or group"\n  },\n  "Location": {\n    "description": "A geographical place"\n  }\n}');
  const [ontologyRelations, setOntologyRelations] = useState('{\n  "KNOWS": {\n    "description": "Personal acquaintance",\n    "source_types": ["Person"],\n    "target_types": ["Person"]\n  },\n  "WORKS_AT": {\n    "description": "Employment relationship",\n    "source_types": ["Person"],\n    "target_types": ["Organization"]\n  },\n  "LOCATED_IN": {\n    "description": "Physical presence in a location",\n    "source_types": ["Person", "Organization"],\n    "target_types": ["Location"]\n  }\n}');
  const [isUpdatingOntology, setIsUpdatingOntology] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchNodeLabels, setSearchNodeLabels] = useState('');
  const [searchEdgeTypes, setSearchEdgeTypes] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string | null>(null);
  
  // Add data to graph state
  const [graphData, setGraphData] = useState('');
  const [isAddingToGraph, setIsAddingToGraph] = useState(false);
  
  // Import conversations state
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'zep-only' | 'memory-test' | 'full-test'>('zep-only');
  const [enableDelay, setEnableDelay] = useState(false);
  const [humanSpeed, setHumanSpeed] = useState(5);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const importTextAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Graph check state
  const [isCheckingGraph, setIsCheckingGraph] = useState(false);
  const [graphStatus, setGraphStatus] = useState<'idle' | 'checking' | 'complete' | 'incomplete'>('idle');
  const [graphCheckResult, setGraphCheckResult] = useState<any>(null);
  
  // User management state
  const [users, setUsers] = useState<PlaygroundUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newExperimentTitle, setNewExperimentTitle] = useState('');
  const [editingUserName, setEditingUserName] = useState('');
  const [editingExperimentTitle, setEditingExperimentTitle] = useState('');
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
  
  // Update sessionId when selected user changes and reinitialize chat
  useEffect(() => {
    if (selectedUserId) {
      // Use userId as sessionId/threadId
      setSessionId(selectedUserId);
      
      // Reinitialize chat for the selected user
      const initializeChatForUser = async () => {
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (!session?.access_token) {
            console.warn('No session token for chat initialization');
            return;
          }

          // Call the init endpoint with the selected user's ID
          const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/chat/init`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ sessionId: selectedUserId })
          });

          if (response.ok) {
            const data = await response.json();
            console.log('Chat initialized for user:', selectedUserId, data);
          } else {
            console.warn('Chat initialization failed for user:', selectedUserId, response.status);
          }
        } catch (error) {
          console.error('Error initializing chat for user:', selectedUserId, error);
        }
      };
      
      initializeChatForUser();
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
      // Use selectedUserId if available, otherwise use the generated sessionId
      const initSessionId = selectedUserId || sessionId;
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/chat/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ sessionId: initSessionId })
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
          setEditingExperimentTitle(currentUser.experimentTitle);
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const createUser = async () => {
    if (!newExperimentTitle.trim()) return;
    
    console.log('Creating user with:', { 
      experimentTitle: newExperimentTitle.trim(),
      userName: newUserName.trim() || undefined 
    });
    
    setUserLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.error('No access token available');
        alert('Please sign in again');
        return;
      }
      
      console.log('Got token:', session.access_token ? 'yes' : 'no');
      const url = `${publicConfig.apiBaseUrl}/api/v1/playground/init`;
      console.log('Calling:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          experimentTitle: newExperimentTitle.trim(),
          userName: newUserName.trim() || undefined
        })
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);
        const newUser = data.user;
        setUsers(prev => [...prev, {
          id: newUser.id,
          name: newUser.userName || '',
          experimentTitle: newUser.experimentTitle,
          label: newUser.experimentTitle
        }]);
        setSelectedUserId(newUser.id);
        setEditingUserName(newUser.userName || '');
        setEditingExperimentTitle(newUser.experimentTitle);
        setNewUserName('');
        setNewExperimentTitle('');
        setShowCreateUser(false);
        // Refresh the users list
        fetchUsers();
      } else {
        const error = await response.json();
        console.error('Failed to create user:', response.status, error);
        alert(`Failed to create user: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
    } finally {
      setUserLoading(false);
    }
  };

  const updateUserName = async () => {
    if (!editingExperimentTitle.trim() || !selectedUserId) return;
    
    // Check if trying to remove an existing user name
    const currentUser = users.find(u => u.id === selectedUserId);
    if (currentUser?.name && currentUser.name.trim() && !editingUserName.trim()) {
      alert('User name cannot be removed once it has been set');
      setEditingUserName(currentUser.name); // Reset to original value
      return;
    }
    
    setUserLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.error('No access token available');
        alert('Please sign in again');
        return;
      }
      
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/playground/update`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          userId: selectedUserId,
          experimentTitle: editingExperimentTitle.trim(),
          userName: editingUserName.trim() || undefined
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(prev => prev.map(u => 
          u.id === selectedUserId 
            ? { ...u, name: data.user.userName || '', experimentTitle: data.user.experimentTitle, label: data.user.experimentTitle }
            : u
        ));
        setIsEditingUser(false);
      } else {
        const error = await response.json();
        console.error('Failed to update user:', error);
        
        // Show specific error message if available
        if (error.error) {
          alert(error.error);
          // If it was about removing user name, reset the value
          if (error.error.includes('Cannot remove user name')) {
            const currentUser = users.find(u => u.id === selectedUserId);
            if (currentUser) {
              setEditingUserName(currentUser.name);
            }
          }
        } else {
          alert('Failed to update user');
        }
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
      // Use selectedUserId if a user is selected, otherwise use sessionId
      const requestBody: any = {
        message: message.trim(),
        useMemory,
        contextMode,
        sessionId: selectedUserId || sessionId,
        model,
        returnMemory: true, // Always request memory context in playground for debugging
        systemPrompt: systemPrompt.trim() || undefined,
        testingMode, // Add testing mode parameter
        pastMessagesCount
      };
      
      // Add minRating for generic context modes
      if (['basic', 'summarized'].includes(contextMode)) {
        requestBody.minRating = genericMinRating;
      }
      
      // Add graph search parameters if using query-based context modes
      if (['node_search', 'edge_search', 'node_edge_search', 'bfs'].includes(contextMode)) {
        requestBody.graphSearchParams = {
          nodes: {
            limit: nodeSearchLimit,
            reranker: nodeSearchReranker,
            ...(nodeSearchReranker === 'mmr' && { mmrLambda }),
            ...(nodeSearchReranker === 'node_distance' && centerNodeUuid && { centerNodeUuid })
          },
          edges: {
            limit: edgeSearchLimit,
            reranker: edgeSearchReranker,
            minFactRating,
            ...(edgeSearchReranker === 'mmr' && { mmrLambda }),
            ...(edgeSearchReranker === 'node_distance' && centerNodeUuid && { centerNodeUuid })
          },
          episodes: {
            limit: episodeSearchLimit
          }
        };
      }

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
    // Scroll to bottom and focus textarea
    setTimeout(() => {
      if (importTextAreaRef.current) {
        importTextAreaRef.current.scrollTop = importTextAreaRef.current.scrollHeight;
        importTextAreaRef.current.focus();
      }
    }, 10);
  };

  const handleAddUser = () => {
    setImportText(prev => prev + '\n\n## User ##\n');
    // Scroll to bottom and focus textarea
    setTimeout(() => {
      if (importTextAreaRef.current) {
        importTextAreaRef.current.scrollTop = importTextAreaRef.current.scrollHeight;
        importTextAreaRef.current.focus();
      }
    }, 10);
  };

  const parseConversations = (text: string) => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    // Split by headers and keep them
    const parts = text.split(/(##\s*(User|Assistant)\s*##)/i);
    
    for (let i = 1; i < parts.length; i += 2) {
      const headerMatch = parts[i].match(/##\s*(User|Assistant)\s*##/i);
      if (headerMatch && parts[i + 1]) {
        const role = headerMatch[1].toLowerCase() === 'user' ? 'user' : 'assistant';
        const content = parts[i + 1].trim();
        if (content) {
          messages.push({ role, content });
        }
      }
    }
    
    return messages;
  };

  const calculateDelay = (userChars: number, assistantChars: number) => {
    if (!enableDelay) return 0;
    
    // humanSpeed from 0-10, where 5 is average
    // Average typing speed: 40 chars/sec at speed 5
    // Average reading speed: 60 chars/sec at speed 5
    const typingCharsPerSec = 20 + (humanSpeed * 8); // 20-100 chars/sec
    const readingCharsPerSec = 30 + (humanSpeed * 12); // 30-150 chars/sec
    
    const typingTime = (userChars / typingCharsPerSec) * 1000; // ms
    const readingTime = (assistantChars / readingCharsPerSec) * 1000; // ms
    
    const totalDelay = typingTime + readingTime;
    return Math.max(500, Math.min(totalDelay, 30000)); // Between 0.5s and 30s
  };

  const handleCheckGraph = async () => {
    if (!selectedUserId || isCheckingGraph) return;
    
    setIsCheckingGraph(true);
    setGraphStatus('checking');
    setGraphCheckResult(null);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Please sign in to check graph status');
      }
      
      // Call API to check graph status
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/memory/graph-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: selectedUserId })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setGraphCheckResult(data);
      
      // Check if all episodes are complete
      const isComplete = data.episodeStatus === 'complete' || 
                        (data.episodes && data.episodes.every((ep: any) => ep.status === 'complete'));
      
      setGraphStatus(isComplete ? 'complete' : 'incomplete');
      
    } catch (err: any) {
      console.error('Graph check error:', err);
      setError(err.message || 'Failed to check graph status');
      setGraphStatus('incomplete');
    } finally {
      setIsCheckingGraph(false);
    }
  };

  const handleAddToGraph = async () => {
    if (!graphData.trim() || isAddingToGraph || !selectedUserId) return;
    
    setIsAddingToGraph(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Please sign in to add data to graph');
      }
      
      // Format the message with "User: " prefix
      const formattedMessage = `User: ${graphData.trim()}`;
      
      // Call API to add data to graph
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/memory/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          userId: selectedUserId,
          type: 'message',
          data: formattedMessage
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      await response.json();
      
      // Show success feedback
      alert('Data successfully added to the graph');
      
      // Keep the text in the box after adding (as requested)
      // setGraphData(''); // Don't clear the text
      
    } catch (err: any) {
      console.error('Graph add error:', err);
      setError(err.message || 'Failed to add data to graph');
    } finally {
      setIsAddingToGraph(false);
    }
  };

  const handleSearch = async () => {
    // Validate that a query-based context mode is selected
    if (!['node_search', 'edge_search', 'node_edge_search', 'bfs'].includes(contextMode)) {
      alert('Please select a query-based context mode (Node Search, Edge Search, Node + Edge Search, or BFS) before searching.');
      return;
    }
    
    if (!searchQuery.trim() || isSearching || !selectedUserId) return;
    
    setIsSearching(true);
    setSearchResults(null);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Please sign in to search');
      }
      
      // Build search filters
      const searchFilters: any = {};
      if (searchNodeLabels.trim()) {
        searchFilters.node_labels = searchNodeLabels.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (searchEdgeTypes.trim()) {
        searchFilters.edge_types = searchEdgeTypes.split(',').map(s => s.trim()).filter(Boolean);
      }
      
      // Build graph search params for search
      const searchGraphParams = {
        nodes: {
          limit: nodeSearchLimit,
          reranker: nodeSearchReranker,
          ...(nodeSearchReranker === 'mmr' && { mmrLambda }),
          ...(nodeSearchReranker === 'node_distance' && centerNodeUuid && { centerNodeUuid })
        },
        edges: {
          limit: edgeSearchLimit,
          reranker: edgeSearchReranker,
          minFactRating,
          ...(edgeSearchReranker === 'mmr' && { mmrLambda }),
          ...(edgeSearchReranker === 'node_distance' && centerNodeUuid && { centerNodeUuid })
        },
        episodes: {
          limit: episodeSearchLimit
        }
      };
      
      // Build graph search params with filters
      const graphSearchParamsWithFilters = {
        ...searchGraphParams,
        search_filters: Object.keys(searchFilters).length > 0 ? searchFilters : undefined
      };
      
      // Create request body for search
      const requestBody: any = {
        message: searchQuery.trim(),
        useMemory: true,
        contextMode,
        sessionId: selectedUserId,
        model: model,
        returnMemory: true,
        testingMode: true, // Don't save to Zep
        assistantOutput: '-', // Skip OpenAI
        graphSearchParams: graphSearchParamsWithFilters
      };
      
      // Make the search request
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
      
      // Process SSE stream to get memory context
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;
      let memoryContext: string | undefined;
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() === '') {
              currentEvent = null;
              continue;
            }
            
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                
                if (currentEvent === 'memory') {
                  memoryContext = parsed.results;
                  break;
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
          
          if (memoryContext) break;
        }
        
        reader.cancel();
      }
      
      if (memoryContext) {
        setSearchResults(memoryContext);
      } else {
        setSearchResults('No results found for your search query.');
      }
      
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Search failed');
      setSearchResults(`Error: ${err.message || 'Search failed'}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpdateOntology = async () => {
    if (!selectedUserId || isUpdatingOntology) return;
    
    setIsUpdatingOntology(true);
    setError(null);
    
    try {
      // Parse and validate JSON
      let entities, relations;
      try {
        entities = JSON.parse(ontologyEntities);
        relations = JSON.parse(ontologyRelations);
      } catch (err) {
        throw new Error('Invalid JSON format. Please check your entity and relation definitions.');
      }
      
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Please sign in to update ontology');
      }
      
      // Call API to update ontology
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/memory/ontology`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: selectedUserId,
          entities,
          relations
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      await response.json();
      
      // Show success feedback
      alert('Graph ontology updated successfully');
      
    } catch (err: any) {
      console.error('Ontology update error:', err);
      setError(err.message || 'Failed to update ontology');
      alert(err.message || 'Failed to update ontology');
    } finally {
      setIsUpdatingOntology(false);
    }
  };

  const handleUpdateFactRatings = async () => {
    if (!selectedUserId || isUpdatingFactRatings) return;
    
    setIsUpdatingFactRatings(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Please sign in to update fact ratings');
      }
      
      // Call API to update fact ratings
      const response = await fetch(`${publicConfig.apiBaseUrl}/api/v1/memory/fact-ratings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: selectedUserId,
          instruction: factRatingInstruction.trim(),
          examples: {
            high: factRatingHigh.trim(),
            medium: factRatingMedium.trim(),
            low: factRatingLow.trim()
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      
      await response.json();
      
      // Show success feedback
      alert('Fact ratings updated successfully');
      
    } catch (err: any) {
      console.error('Fact ratings update error:', err);
      setError(err.message || 'Failed to update fact ratings');
    } finally {
      setIsUpdatingFactRatings(false);
    }
  };

  const handleImportConversations = async () => {
    if (!importText.trim() || isImporting || !selectedUserId) return;
    
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0 });
    
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

      setImportProgress({ current: 0, total: messages.length });
      
      // Process messages based on import mode
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        setImportProgress({ current: i + 1, total: messages.length });
        
        // Update the message text field to show current message
        setMessage(msg.content);
        
        // Prepare request body based on import mode
        let requestBody: any = {
          message: msg.content,
          sessionId: selectedUserId,
          model,
          systemPrompt: systemPrompt.trim() || undefined
        };
        
        if (importMode === 'zep-only') {
          // Generate ZEP graph only - no memory, no OpenAI
          requestBody.useMemory = false;
          requestBody.returnMemory = false;
          if (msg.role === 'assistant') {
            requestBody.assistantOutput = msg.content; // Skip OpenAI for assistant messages
          }
        } else if (importMode === 'memory-test') {
          // Test memory context - with memory, skip OpenAI
          requestBody.useMemory = true;
          requestBody.contextMode = contextMode;
          requestBody.returnMemory = true;
          if (msg.role === 'assistant') {
            requestBody.assistantOutput = msg.content; // Skip OpenAI for assistant messages
          }
        } else if (importMode === 'full-test') {
          // Test memory and OpenAI answers - only for user messages
          if (msg.role === 'assistant') {
            // Skip assistant messages in full test mode
            continue;
          }
          requestBody.useMemory = true;
          requestBody.contextMode = contextMode;
          requestBody.returnMemory = true;
        }
        
        // Send the request using the standard chat endpoint
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

        // Process SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent: string | null = null;
        let fullResponse = '';
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') {
                currentEvent = null;
                continue;
              }
              
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6);

                if (data === '[DONE]') {
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  
                  // Update UI based on event type
                  if (currentEvent === 'memory') {
                    setMemoryContext(parsed as MemoryData);
                  } else if (currentEvent === 'token' || (!currentEvent && parsed.text !== undefined)) {
                    fullResponse += parsed.text;
                    setResponse(fullResponse);
                  } else if (currentEvent === 'usage' || (!currentEvent && parsed.tokens_in !== undefined)) {
                    setUsage(parsed as UsageData);
                  }
                } catch (e) {
                  console.error('Failed to parse SSE data:', e);
                }
              }
            }
          }
        }
        
        // Apply delay if enabled
        if (enableDelay && i < messages.length - 1) {
          const userChars = msg.role === 'user' ? msg.content.length : 0;
          const assistantChars = msg.role === 'assistant' ? msg.content.length : (fullResponse?.length || 0);
          const delay = calculateDelay(userChars, assistantChars);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (importMode === 'zep-only') {
          // Small delay for ZEP-only mode to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      setImportText('');
      setError(null);
      setImportProgress({ current: 0, total: 0 });
      
      // Show success message
      alert(`Successfully imported ${messages.length} messages`);
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import conversations');
      setImportProgress({ current: 0, total: 0 });
    } finally {
      setIsImporting(false);
      setMessage(''); // Clear the message field
    }
  };

  return (
    <>
      <AdminHeader
        title="Playground"
        subtitle="Test the AI chat system with different configurations"
      />

      <div className="p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Configuration Panel */}
          <div className="space-y-6">
            {/* User Card */}
            <Card title="User" icon="👤">
              <div className="mt-4 space-y-4 overflow-hidden">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select User
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        setSelectedUserId(e.target.value);
                        const user = users.find(u => u.id === e.target.value);
                        if (user) {
                          setEditingUserName(user.name);
                          setEditingExperimentTitle(user.experimentTitle);
                        }
                      }}
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 whitespace-nowrap"
                      disabled={isStreaming || userLoading}
                    >
                      + New
                    </button>
                    {selectedUserId && !showCreateUser && (
                      <>
                        {!isEditingUser ? (
                          <button
                            type="button"
                            onClick={() => setIsEditingUser(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
                            disabled={userLoading}
                          >
                            Edit
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={updateUserName}
                              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 whitespace-nowrap"
                              disabled={userLoading || !editingExperimentTitle.trim()}
                            >
                              {userLoading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                // Cancel editing - reset values
                                const user = users.find(u => u.id === selectedUserId);
                                if (user) {
                                  setEditingUserName(user.name);
                                  setEditingExperimentTitle(user.experimentTitle);
                                }
                                setIsEditingUser(false);
                              }}
                              className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500 whitespace-nowrap"
                              disabled={userLoading}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Create New User Form */}
                {showCreateUser && (
                  <div className="p-3 bg-gray-50 rounded-md space-y-3">
                    <div>
                      <input
                        type="text"
                        value={newExperimentTitle}
                        onChange={(e) => setNewExperimentTitle(e.target.value)}
                        placeholder="Enter experiment title... (required)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={userLoading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This title will identify the experiment in the dropdown and history.
                      </p>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Enter user name... (optional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={userLoading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Optional: This user's name will be added to messages sent to Zep, which apparently should improve memory context.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={createUser}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                        disabled={userLoading || !newExperimentTitle.trim()}
                      >
                        {userLoading ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateUser(false);
                          setNewUserName('');
                          setNewExperimentTitle('');
                        }}
                        className="flex-1 px-3 py-1.5 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
                        disabled={userLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit User Name and Experiment Title */}
                {selectedUserId && !showCreateUser && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Experiment Title
                      </label>
                      <input
                        type="text"
                        value={editingExperimentTitle}
                        onChange={(e) => setEditingExperimentTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!isEditingUser || userLoading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This title identifies the experiment in the dropdown and history.
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        User Name
                      </label>
                      <input
                        type="text"
                        value={editingUserName}
                        onChange={(e) => setEditingUserName(e.target.value)}
                        placeholder="Enter user name (optional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={!isEditingUser || userLoading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Optional: This user's name will be added to messages sent to Zep, which can improve memory context.
                      </p>
                    </div>
                  </>
                )}

              </div>
            </Card>
            
            {/* Message Card */}
            <Card title="Message" icon="💬">
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
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
            
            {/* Search Card */}
            <Card title="Search" icon="🔍">
              <div className="mt-4 space-y-4">
                <p className="text-xs text-gray-500">
                  Search is based on Context mode selected in Context Mode card (only modes "Based on message query")
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Query
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        if (e.target.value.length <= 400) {
                          setSearchQuery(e.target.value);
                        }
                      }}
                      placeholder="Enter search query..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isSearching}
                      maxLength={400}
                    />
                    <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                      {searchQuery.length}/400
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search Filters
                  </label>
                  <div className="ml-4 space-y-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Node Labels (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={searchNodeLabels}
                        onChange={(e) => setSearchNodeLabels(e.target.value)}
                        placeholder="e.g., Person, Organization"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isSearching}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Edge Types (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={searchEdgeTypes}
                        onChange={(e) => setSearchEdgeTypes(e.target.value)}
                        placeholder="e.g., KNOWS, WORKS_AT"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isSearching}
                      />
                    </div>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim() || !selectedUserId}
                  className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
                
                {/* Search Results */}
                {searchResults && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-md">
                    <div className="text-sm font-medium text-gray-700 mb-2">Search Results:</div>
                    <div className="max-h-60 overflow-y-auto">
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                        {searchResults}
                      </pre>
                    </div>
                  </div>
                )}
                
                {/* User/Mode Warning */}
                {!selectedUserId && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-700">
                      Please select a user from the User card above before searching.
                    </p>
                  </div>
                )}
              </div>
            </Card>
            
            {/* Context Mode Card */}
            <Card title="Context Mode" icon="🧠">
              <div className="mt-4 space-y-3">
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
                    <div className="ml-6 space-y-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Context Mode
                      </label>
                      
                      {/* Generic context modes */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Generic (faster: can be conducted after calling LLM, cached and waiting for user's next message)</p>
                        <div className="flex space-x-4">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="contextMode"
                              value="basic"
                              checked={contextMode === 'basic'}
                              onChange={(e) => setContextMode(e.target.value as any)}
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
                              onChange={(e) => setContextMode(e.target.value as any)}
                              className="text-blue-600 focus:ring-blue-500"
                              disabled={isStreaming}
                            />
                            <span className="text-sm text-gray-700">Summarized</span>
                          </label>
                        </div>
                      </div>
                      
                      {/* Query-based context modes */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Based on message query (slower: have to be conducted before calling LLM)</p>
                        <div className="space-y-2">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="contextMode"
                              value="node_search"
                              checked={contextMode === 'node_search'}
                              onChange={(e) => setContextMode(e.target.value as any)}
                              className="text-blue-600 focus:ring-blue-500"
                              disabled={isStreaming}
                            />
                            <span className="text-sm text-gray-700">Node Search</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="contextMode"
                              value="edge_search"
                              checked={contextMode === 'edge_search'}
                              onChange={(e) => setContextMode(e.target.value as any)}
                              className="text-blue-600 focus:ring-blue-500"
                              disabled={isStreaming}
                            />
                            <span className="text-sm text-gray-700">Edge Search</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="contextMode"
                              value="node_edge_search"
                              checked={contextMode === 'node_edge_search'}
                              onChange={(e) => setContextMode(e.target.value as any)}
                              className="text-blue-600 focus:ring-blue-500"
                              disabled={isStreaming}
                            />
                            <span className="text-sm text-gray-700">Node + Edge Search</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="contextMode"
                              value="bfs"
                              checked={contextMode === 'bfs'}
                              onChange={(e) => setContextMode(e.target.value as any)}
                              className="text-blue-600 focus:ring-blue-500"
                              disabled={isStreaming}
                            />
                            <span className="text-sm text-gray-700">Breadth-First Search (BFS)</span>
                          </label>
                        </div>
                      </div>
                      
                      {/* Min Rating for Generic modes */}
                      {['basic', 'summarized'].includes(contextMode) && (
                        <div className="mt-2">
                          <label className="block text-xs text-gray-600 mb-1">Min Rating (0.0-1.0)</label>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={genericMinRating}
                            onChange={(e) => setGenericMinRating(parseFloat(e.target.value) || 0.0)}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isStreaming}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Filter facts by minimum rating (0 = include all)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Graph Search Parameters - shown for query-based context modes */}
                  {useMemory && ['node_search', 'edge_search', 'node_edge_search', 'bfs'].includes(contextMode) && (
                    <div className="p-3 bg-gray-50 rounded-md space-y-4 mt-3">
                      <div className="text-sm font-medium text-gray-700">Graph Search Parameters</div>
                      
                      {/* Nodes parameters */}
                      {['node_search', 'node_edge_search', 'bfs'].includes(contextMode) && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-600">Nodes:</div>
                          <div className="ml-4 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Limit (1-30)</label>
                              <input
                                type="number"
                                min="1"
                                max="30"
                                value={nodeSearchLimit}
                                onChange={(e) => setNodeSearchLimit(parseInt(e.target.value) || 10)}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isStreaming}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Reranker
                                <a href="https://help.getzep.com/searching-the-graph#rerankers" 
                                   target="_blank" 
                                   rel="noopener noreferrer"
                                   className="ml-1 text-blue-500 hover:text-blue-700">
                                  ℹ️
                                </a>
                              </label>
                              <select
                                value={nodeSearchReranker}
                                onChange={(e) => setNodeSearchReranker(e.target.value as any)}
                                className="w-40 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isStreaming}
                              >
                                <option value="cross_encoder">cross_encoder</option>
                                <option value="rrf">rrf</option>
                                <option value="mmr">mmr</option>
                                <option value="episode_mentions">episode_mentions</option>
                                <option value="node_distance">node_distance</option>
                              </select>
                            </div>
                            {nodeSearchReranker === 'mmr' && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">MMR Lambda (0.0-1.0)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={mmrLambda}
                                  onChange={(e) => setMmrLambda(parseFloat(e.target.value) || 0.5)}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={isStreaming}
                                />
                              </div>
                            )}
                            {nodeSearchReranker === 'node_distance' && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Center Node UUID</label>
                                <input
                                  type="text"
                                  value={centerNodeUuid}
                                  onChange={(e) => setCenterNodeUuid(e.target.value)}
                                  placeholder="Enter node UUID..."
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={isStreaming}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Edges parameters */}
                      {['edge_search', 'node_edge_search'].includes(contextMode) && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-600">Edges:</div>
                          <div className="ml-4 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Limit (1-30)</label>
                              <input
                                type="number"
                                min="1"
                                max="30"
                                value={edgeSearchLimit}
                                onChange={(e) => setEdgeSearchLimit(parseInt(e.target.value) || 10)}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isStreaming}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                Reranker
                                <a href="https://help.getzep.com/searching-the-graph#rerankers" 
                                   target="_blank" 
                                   rel="noopener noreferrer"
                                   className="ml-1 text-blue-500 hover:text-blue-700">
                                  ℹ️
                                </a>
                              </label>
                              <select
                                value={edgeSearchReranker}
                                onChange={(e) => setEdgeSearchReranker(e.target.value as any)}
                                className="w-40 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isStreaming}
                              >
                                <option value="cross_encoder">cross_encoder</option>
                                <option value="rrf">rrf</option>
                                <option value="mmr">mmr</option>
                                <option value="episode_mentions">episode_mentions</option>
                                <option value="node_distance">node_distance</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Min Fact Rating (0.0-1.0)</label>
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.1"
                                value={minFactRating}
                                onChange={(e) => setMinFactRating(parseFloat(e.target.value) || 0.0)}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isStreaming}
                              />
                            </div>
                            {edgeSearchReranker === 'mmr' && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">MMR Lambda (0.0-1.0)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={mmrLambda}
                                  onChange={(e) => setMmrLambda(parseFloat(e.target.value) || 0.5)}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={isStreaming}
                                />
                              </div>
                            )}
                            {edgeSearchReranker === 'node_distance' && (
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Center Node UUID</label>
                                <input
                                  type="text"
                                  value={centerNodeUuid}
                                  onChange={(e) => setCenterNodeUuid(e.target.value)}
                                  placeholder="Enter node UUID..."
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={isStreaming}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Episodes parameters */}
                      {['bfs'].includes(contextMode) && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-gray-600">Episodes:</div>
                          <div className="ml-4 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Limit (1-30)</label>
                              <input
                                type="number"
                                min="1"
                                max="30"
                                value={episodeSearchLimit}
                                onChange={(e) => setEpisodeSearchLimit(parseInt(e.target.value) || 10)}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={isStreaming}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </Card>
            

          </div>

          {/* Response Panel */}
          <div className="space-y-6">
            {/* Memory Context - At the top */}
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

            {/* Response Card - Below Memory Context */}
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

            {/* Configuration Card - Moved below Response */}
            <Card title="Configuration" icon="⚙️">
              <div className="mt-4 space-y-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of past messages added to context
                  </label>
                  <select
                    value={pastMessagesCount}
                    onChange={(e) => setPastMessagesCount(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isStreaming}
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Load this many previous messages from the conversation history
                  </p>
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
                    User ID / Session ID
                  </label>
                  <input
                    type="text"
                    value={sessionId}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                  />
                </div>
              </div>
            </Card>

            {/* System Prompt Card - At the bottom */}
            <Card title="System Prompt" icon="🤖">
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

          </div>
        </div>

        {/* Bottom Section - Two Column Layout */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-8">
            {/* Import Conversations Card */}
            <Card title="Import Conversations" icon="📥">
            {/* Progress indicator */}
            {isImporting && (
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600">
                  {importProgress.current}/{importProgress.total}
                </span>
              </div>
            )}
            
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

            {/* Fact Ratings Card */}
            <Card title="Fact Ratings" icon="⭐">
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instruction
                  </label>
                  <textarea
                    value={factRatingInstruction}
                    onChange={(e) => setFactRatingInstruction(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    rows={3}
                    disabled={isUpdatingFactRatings}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Rate the facts by poignancy. Highly poignant facts have a significant emotional impact or relevance to the user. Facts with low poignancy are minimally relevant or of little emotional significance.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    High
                  </label>
                  <input
                    type="text"
                    value={factRatingHigh}
                    onChange={(e) => setFactRatingHigh(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isUpdatingFactRatings}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The user received news of a family member's serious illness.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Medium
                  </label>
                  <input
                    type="text"
                    value={factRatingMedium}
                    onChange={(e) => setFactRatingMedium(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isUpdatingFactRatings}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The user completed a challenging marathon.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Low
                  </label>
                  <input
                    type="text"
                    value={factRatingLow}
                    onChange={(e) => setFactRatingLow(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isUpdatingFactRatings}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The user bought a new brand of toothpaste.
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={handleUpdateFactRatings}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={isUpdatingFactRatings || !selectedUserId}
                >
                  {isUpdatingFactRatings ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Updating...
                    </>
                  ) : (
                    'Update'
                  )}
                </button>
                
                {/* User selection warning */}
                {!selectedUserId && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-700">
                      Please select a user from the User card above before updating fact ratings.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
          
          {/* Right Column */}
          <div className="space-y-8">
            {/* Check Graph Build Completion Card */}
            <Card title="Check Graph Build Completion" icon="🔍">
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Check if Zep has finished processing and building the knowledge graph for the selected user.
                </p>
              
              {/* Check button */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleCheckGraph}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={isCheckingGraph || !selectedUserId}
                >
                  {isCheckingGraph ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Checking...
                    </>
                  ) : (
                    'Check'
                  )}
                </button>
                
                {/* Status indicator */}
                {graphStatus !== 'idle' && !isCheckingGraph && (
                  <div className="flex items-center gap-2">
                    {graphStatus === 'complete' ? (
                      <>
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-green-600 font-medium">Complete</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-red-600 font-medium">Incomplete</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {/* Result details */}
              {graphCheckResult && (
                <div className="p-4 bg-gray-50 rounded-md space-y-2">
                  <div className="text-sm">
                    <span className="font-medium text-gray-700">Status: </span>
                    <span className={graphStatus === 'complete' ? 'text-green-600' : 'text-orange-600'}>
                      {graphCheckResult.episodeStatus || 'Unknown'}
                    </span>
                  </div>
                  
                  {graphCheckResult.episodeCount !== undefined && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Episodes: </span>
                      <span className="text-gray-600">{graphCheckResult.episodeCount}</span>
                    </div>
                  )}
                  
                  {graphCheckResult.lastEpisodeId && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Last Episode ID: </span>
                      <span className="text-gray-600 font-mono text-xs">{graphCheckResult.lastEpisodeId}</span>
                    </div>
                  )}
                  
                  {graphCheckResult.message && (
                    <div className="text-sm text-gray-600 italic mt-2">
                      {graphCheckResult.message}
                    </div>
                  )}
                </div>
              )}
              
              {/* User selection warning */}
              {!selectedUserId && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-700">
                    Please select a user from the User card above before checking graph status.
                  </p>
                </div>
              )}
              </div>
            </Card>
            
            {/* Adding data to the graph Card */}
            <Card title="Adding data to the graph" icon="📊">
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-600">
                For example it can add to graph preferences of user's partner, provided by her/him during app's introduction.
              </p>
              
              <div>
                <div className="relative">
                  <textarea
                    value={graphData}
                    onChange={(e) => {
                      // Limit to 10000 characters
                      if (e.target.value.length <= 10000) {
                        setGraphData(e.target.value);
                      }
                    }}
                    placeholder="Enter data to add to the graph..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    rows={6}
                    disabled={isAddingToGraph}
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                    {graphData.length}/10000
                  </div>
                </div>
              </div>
              
              <button
                type="button"
                onClick={handleAddToGraph}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={isAddingToGraph || !graphData.trim() || !selectedUserId}
              >
                {isAddingToGraph ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Adding...
                  </>
                ) : (
                  'Add'
                )}
              </button>
              
              {/* User selection warning */}
              {!selectedUserId && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-700">
                    Please select a user from the User card above before adding data to the graph.
                  </p>
                </div>
              )}
              </div>
            </Card>
            
            {/* Ontology Card */}
            <Card title="Ontology" icon="🔗">
              <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-600">
                Define custom entity and relation types for your knowledge graph. This sets the ontology for graph extraction and organization.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entity Types (JSON)
                </label>
                <textarea
                  value={ontologyEntities}
                  onChange={(e) => setOntologyEntities(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  rows={8}
                  disabled={isUpdatingOntology}
                  placeholder='{\n  "EntityType": {\n    "description": "Description of the entity type"\n  }\n}'
                />
                <p className="text-xs text-gray-500 mt-1">
                  Define entity types as JSON. Each key is an entity type name with a description.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relation Types (JSON)
                </label>
                <textarea
                  value={ontologyRelations}
                  onChange={(e) => setOntologyRelations(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  rows={10}
                  disabled={isUpdatingOntology}
                  placeholder='{\n  "RELATION_TYPE": {\n    "description": "Description",\n    "source_types": ["EntityType1"],\n    "target_types": ["EntityType2"]\n  }\n}'
                />
                <p className="text-xs text-gray-500 mt-1">
                  Define relation types as JSON. Each relation can specify allowed source and target entity types.
                </p>
              </div>
              
              <button
                type="button"
                onClick={handleUpdateOntology}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={isUpdatingOntology || !selectedUserId}
              >
                {isUpdatingOntology ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </>
                ) : (
                  'Update'
                )}
              </button>
              
              {/* User selection warning */}
              {!selectedUserId && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-700">
                    Please select a user from the User card above before updating ontology.
                  </p>
                </div>
              )}
              </div>
            </Card>
          </div>
        </div>
        
        {/* API Endpoint Info - Full width at the very bottom */}
        <div className="mt-8">
          <Card title="API Endpoint" icon="🔗">
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
      </div>
    </>
  );
}
