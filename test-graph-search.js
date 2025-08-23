#!/usr/bin/env node

// Test script for the new graph search context modes

const testContextModes = async () => {
  const apiUrl = 'http://localhost:3000/api/v1/chat';
  
  // Test token (you'd need a real token in production)
  const testToken = 'placeholder-test-token';
  
  const testRequest = {
    message: "What do you know about my preferences?",
    useMemory: true,
    contextMode: "node_search",
    sessionId: "test-user-123",
    model: "gpt-4o-mini",
    returnMemory: true,
    graphSearchParams: {
      nodes: {
        limit: 5,
        reranker: "cross_encoder"
      }
    }
  };

  console.log('Testing graph search context mode:', testRequest.contextMode);
  console.log('Request:', JSON.stringify(testRequest, null, 2));
  
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

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    // Read a few bytes of the stream to verify it's working
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    const { value, done } = await reader.read();
    if (value) {
      const text = decoder.decode(value);
      console.log('First chunk of SSE stream:', text.substring(0, 200));
    }
    
    reader.cancel();
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

testContextModes();