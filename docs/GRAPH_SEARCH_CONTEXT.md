# Graph Search Context Modes

## Overview

The Playground now supports advanced graph search context modes that allow for more targeted and efficient context retrieval from the Zep knowledge graph.

## Context Modes

### Generic Modes (Cached)
These modes can be computed after calling the LLM and cached for the next message:
- **Basic**: Raw context as stored in Zep
- **Summarized**: AI-processed summary of the context

### Query-Based Modes (Real-time)
These modes perform graph searches based on the user's message query and must be computed before calling the LLM:
- **Node Search**: Search for relevant entities/nodes in the knowledge graph
- **Edge Search**: Search for relevant facts/relationships in the knowledge graph
- **Node + Edge Search**: Combined search for both entities and facts
- **Breadth-First Search (BFS)**: Search starting from recent episode nodes

## Graph Search Parameters

When using query-based context modes, the following parameters become available:

### Nodes Parameters
- **limit** (1-30): Maximum number of node results to return
- **reranker**: Algorithm for ranking results
  - `cross_encoder` (default): Neural cross-encoder for relevance ranking
  - `rrf`: Reciprocal Rank Fusion
  - `mmr`: Maximal Marginal Relevance (requires mmr_lambda)
  - `episode_mentions`: Rank by episode mention frequency
  - `node_distance`: Distance from a center node (requires center_node_uuid)
- **mmr_lambda** (0.0-1.0): Balance between relevance and diversity (for MMR reranker)
- **center_node_uuid**: UUID of the center node (for node_distance reranker)

### Edges Parameters
- **limit** (1-30): Maximum number of edge results to return
- **reranker**: Same options as nodes
- **min_fact_rating** (0.0-1.0): Minimum confidence rating for facts
- **mmr_lambda** (0.0-1.0): For MMR reranker
- **center_node_uuid**: For node_distance reranker

### Episodes Parameters (BFS only)
- **limit** (1-30): Number of recent episodes to use as BFS seeds

## Reranker Details

For detailed information about rerankers, see: https://help.getzep.com/searching-the-graph#rerankers

### Key Reranker Characteristics:
- **cross_encoder**: Best for semantic relevance, slower but more accurate
- **rrf**: Fast fusion of multiple ranking signals
- **mmr**: Balances relevance with diversity to avoid redundant results
- **episode_mentions**: Prioritizes frequently mentioned entities
- **node_distance**: Useful for exploring graph neighborhoods

## API Integration

The chat endpoint (`/api/v1/chat`) now accepts these parameters:

```json
{
  "message": "User's question",
  "useMemory": true,
  "contextMode": "node_search",
  "graphSearchParams": {
    "nodes": {
      "limit": 10,
      "reranker": "mmr",
      "mmrLambda": 0.7
    }
  }
}
```

## Performance Considerations

- **Generic modes** (basic/summarized) are faster as they can be cached
- **Query-based modes** require real-time graph searches, adding 100-500ms latency
- **BFS mode** may be slowest as it requires fetching episodes first
- Use appropriate limits to balance comprehensiveness with speed

## When to Use Each Mode

- **Basic/Summarized**: General conversations, when speed is critical
- **Node Search**: When looking for specific entities or concepts
- **Edge Search**: When looking for facts and relationships
- **Node + Edge Search**: Comprehensive context for complex queries
- **BFS**: When recent conversation context is most relevant

## Customization Based on Zep Documentation

This implementation follows the Zep documentation for:
- [Searching the Graph](https://help.getzep.com/searching-the-graph)
- [Customizing Your Context Block](https://help.getzep.com/cookbook/customize-your-context-block)

The query is limited to 400 characters as recommended by Zep for optimal performance.