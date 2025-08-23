#!/usr/bin/env node

// Test script for the search functionality

const testSearch = async () => {
  const apiUrl = 'http://localhost:3000/api/v1/chat';
  
  // Test token (you'd need a real token in production)
  const testToken = 'placeholder-test-token';
  
  const testRequest = {
    message: "What products does the user own?", // This is used as the search query
    useMemory: true,
    contextMode: "node_search", // Using node search mode
    sessionId: "test-user-123",
    model: "gpt-4o-mini",
    returnMemory: true,
    testingMode: true, // Don't save to Zep
    assistantOutput: "-", // Skip OpenAI
    graphSearchParams: {
      nodes: {
        limit: 10,
        reranker: "cross_encoder"
      },
      search_filters: {
        node_labels: ["Product", "Person"],
        edge_types: ["OWNS"]
      }
    }
  };

  console.log('Testing search with filters');
  console.log('Query:', testRequest.message);
  console.log('Context Mode:', testRequest.contextMode);
  console.log('Filters:', JSON.stringify(testRequest.graphSearchParams.search_filters, null, 2));
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(testRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Error response:', error);
      return;
    }

    console.log('\nResponse status:', response.status);
    
    // Read the SSE stream to get memory context
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = null;
    let memoryContext = null;
    
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
              console.log('\n✅ Memory Context Retrieved:');
              console.log(memoryContext || 'No results found');
              break;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      
      if (memoryContext !== null) break;
    }
    
    reader.cancel();
    
    if (memoryContext === null) {
      console.log('\n⚠️ No memory context received in response');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

testSearch();