#!/usr/bin/env node

// Test script for the fact ratings update endpoint

const testFactRatings = async () => {
  const apiUrl = 'http://localhost:3000/api/v1/memory/fact-ratings';
  
  // Test token (you'd need a real token in production)
  const testToken = 'placeholder-test-token';
  
  const testRequest = {
    userId: "test-user-123",
    instruction: "Rate the facts by poignancy. Highly poignant facts have a significant emotional impact or relevance to the user. Facts with low poignancy are minimally relevant or of little emotional significance.",
    examples: {
      high: "The user received news of a family member's serious illness.",
      medium: "The user completed a challenging marathon.",
      low: "The user bought a new brand of toothpaste."
    }
  };

  console.log('Testing fact ratings update endpoint');
  console.log('Request:', JSON.stringify(testRequest, null, 2));
  
  try {
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`
      },
      body: JSON.stringify(testRequest)
    });

    const result = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ Fact ratings update endpoint is working');
    } else {
      console.log('❌ Fact ratings update failed');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Test minRating parameter in context retrieval
const testMinRating = async () => {
  const apiUrl = 'http://localhost:3000/api/v1/chat';
  const testToken = 'placeholder-test-token';
  
  const testRequest = {
    message: "Tell me about my preferences",
    useMemory: true,
    contextMode: "basic",
    sessionId: "test-user-123",
    model: "gpt-4o-mini",
    returnMemory: true,
    minRating: 0.5  // Only include facts with rating >= 0.5
  };

  console.log('\nTesting minRating parameter');
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
    console.log('✅ MinRating parameter accepted');
    
    // Cancel the stream
    response.body?.cancel();
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Run tests
(async () => {
  await testFactRatings();
  await testMinRating();
})();