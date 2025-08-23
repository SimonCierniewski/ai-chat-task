#!/usr/bin/env node

// Test script for the ontology update endpoint

const testOntology = async () => {
  const apiUrl = 'http://localhost:3000/api/v1/memory/ontology';
  
  // Test token (you'd need a real token in production)
  const testToken = 'placeholder-test-token';
  
  const testRequest = {
    userId: "test-user-123",
    entities: {
      "Person": {
        "description": "A human being with thoughts and relationships"
      },
      "Organization": {
        "description": "A company, institution, or group"
      },
      "Location": {
        "description": "A geographical place or area"
      },
      "Product": {
        "description": "A physical or digital product"
      },
      "Event": {
        "description": "An occurrence or happening at a specific time"
      }
    },
    relations: {
      "KNOWS": {
        "description": "Personal acquaintance between people",
        "source_types": ["Person"],
        "target_types": ["Person"]
      },
      "WORKS_AT": {
        "description": "Employment or professional relationship",
        "source_types": ["Person"],
        "target_types": ["Organization"]
      },
      "LOCATED_IN": {
        "description": "Physical presence or location",
        "source_types": ["Person", "Organization", "Event"],
        "target_types": ["Location"]
      },
      "OWNS": {
        "description": "Ownership or possession",
        "source_types": ["Person", "Organization"],
        "target_types": ["Product"]
      },
      "ATTENDED": {
        "description": "Participation in an event",
        "source_types": ["Person"],
        "target_types": ["Event"]
      },
      "LIKES": {
        "description": "Preference or positive sentiment",
        "source_types": ["Person"],
        "target_types": ["Product", "Organization", "Location"]
      }
    }
  };

  console.log('Testing ontology update endpoint');
  console.log('Entities:', Object.keys(testRequest.entities).length);
  console.log('Relations:', Object.keys(testRequest.relations).length);
  console.log('\nRequest:', JSON.stringify(testRequest, null, 2));
  
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
    
    console.log('\nResponse status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ Ontology update endpoint is working');
      console.log('The knowledge graph will now use these custom entity and relation types for extraction.');
    } else {
      console.log('❌ Ontology update failed');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
};

testOntology();