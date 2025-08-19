# Ontology Specification

## Overview

This document defines the knowledge graph ontology for entity extraction and relationship management. It provides deterministic rules for entity normalization, predicate validation, and confidence scoring.

## Core Concepts

### Entities

An entity represents a named concept extracted from conversations:

```typescript
interface Entity {
  id: string;           // Normalized identifier
  rawText: string;      // Original text as mentioned
  type: EntityType;     // Classification
  confidence: number;   // 0.0-1.0 extraction confidence
  firstSeen: string;    // ISO 8601 timestamp
  lastSeen: string;     // ISO 8601 timestamp
  mentions: number;     // Occurrence count
}

enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  LOCATION = 'location',
  PRODUCT = 'product',
  CONCEPT = 'concept',
  OTHER = 'other'
}
```

### Predicates

Allowed relationship types between entities:

```typescript
enum AllowedPredicates {
  LIKES = 'likes',               // User preferences
  WORKS_AT = 'works_at',         // Employment relationships
  LOCATED_IN = 'located_in',     // Geographic relationships
  KNOWS = 'knows',               // Personal connections
  OWNS = 'owns',                 // Ownership relationships
  INTERESTED_IN = 'interested_in', // Topics of interest
  VISITED = 'visited',           // Travel/location history
  USES = 'uses'                  // Tool/product usage
}

// Predicate constraints
const PREDICATE_CONSTRAINTS: Record<AllowedPredicates, PredicateConstraint> = {
  likes: {
    subjectTypes: ['person'],
    objectTypes: ['product', 'concept', 'organization', 'other'],
    maxPerMessage: 2
  },
  works_at: {
    subjectTypes: ['person'],
    objectTypes: ['organization'],
    maxPerMessage: 1
  },
  located_in: {
    subjectTypes: ['person', 'organization'],
    objectTypes: ['location'],
    maxPerMessage: 1
  },
  knows: {
    subjectTypes: ['person'],
    objectTypes: ['person'],
    maxPerMessage: 2
  },
  owns: {
    subjectTypes: ['person', 'organization'],
    objectTypes: ['product', 'other'],
    maxPerMessage: 2
  },
  interested_in: {
    subjectTypes: ['person'],
    objectTypes: ['concept', 'other'],
    maxPerMessage: 3
  },
  visited: {
    subjectTypes: ['person'],
    objectTypes: ['location'],
    maxPerMessage: 2
  },
  uses: {
    subjectTypes: ['person', 'organization'],
    objectTypes: ['product', 'other'],
    maxPerMessage: 2
  }
};

interface PredicateConstraint {
  subjectTypes: EntityType[];
  objectTypes: EntityType[];
  maxPerMessage: number;
}
```

### Edges

A graph edge represents a relationship between entities:

```typescript
interface GraphEdge {
  id: string;                  // Unique edge identifier
  subject: string;             // Subject entity ID (normalized)
  predicate: AllowedPredicates; // Relationship type
  object: string;              // Object entity ID (normalized)
  confidence: number;          // 0.0-1.0 relationship confidence
  metadata: EdgeMetadata;
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
}

interface EdgeMetadata {
  sourceMessageId: string;     // Message where extracted
  sourceSessionId: string;     // Session context
  extractionMethod: 'explicit' | 'inferred';
  rawStatement?: string;       // Original text
  negated: boolean;           // Is this a negative statement
}
```

## Normalization Rules

### Entity Normalization

Entities must be normalized before storage or comparison:

```typescript
function normalizeEntity(text: string): string {
  // 1. Trim whitespace
  let normalized = text.trim();
  
  // 2. Convert to lowercase
  normalized = normalized.toLowerCase();
  
  // 3. Apply Unicode NFKC normalization
  normalized = normalized.normalize('NFKC');
  
  // 4. Remove diacritics
  normalized = normalized.replace(/[\u0300-\u036f]/g, '');
  
  // 5. Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ');
  
  // 6. Remove possessive forms
  normalized = normalized.replace(/[''']s$/g, '');
  
  // 7. Remove articles at start
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');
  
  // 8. Remove special characters except hyphens and periods
  normalized = normalized.replace(/[^\w\s.-]/g, '');
  
  // 9. Final trim
  normalized = normalized.trim();
  
  return normalized;
}

// Examples:
// "John's Company" → "john company"
// "The Eiffel Tower" → "eiffel tower"
// "Café Münchën" → "cafe munchen"
// "U.S.A." → "u.s.a"
```

### Predicate Normalization

```typescript
function normalizePredicate(text: string): AllowedPredicates | null {
  const normalized = text.toLowerCase().trim().replace(/[_\s-]+/g, '_');
  
  // Map common variations
  const predicateMap: Record<string, AllowedPredicates> = {
    'likes': AllowedPredicates.LIKES,
    'enjoys': AllowedPredicates.LIKES,
    'loves': AllowedPredicates.LIKES,
    'prefers': AllowedPredicates.LIKES,
    'works_at': AllowedPredicates.WORKS_AT,
    'employed_by': AllowedPredicates.WORKS_AT,
    'works_for': AllowedPredicates.WORKS_AT,
    'located_in': AllowedPredicates.LOCATED_IN,
    'lives_in': AllowedPredicates.LOCATED_IN,
    'based_in': AllowedPredicates.LOCATED_IN,
    'knows': AllowedPredicates.KNOWS,
    'met': AllowedPredicates.KNOWS,
    'owns': AllowedPredicates.OWNS,
    'has': AllowedPredicates.OWNS,
    'interested_in': AllowedPredicates.INTERESTED_IN,
    'curious_about': AllowedPredicates.INTERESTED_IN,
    'visited': AllowedPredicates.VISITED,
    'went_to': AllowedPredicates.VISITED,
    'uses': AllowedPredicates.USES,
    'utilizes': AllowedPredicates.USES
  };
  
  return predicateMap[normalized] || null;
}
```

## Entity Resolution (v0)

Version 0 uses simple string equality after normalization:

```typescript
class EntityResolverV0 {
  private entities: Map<string, Entity> = new Map();
  
  resolve(rawText: string, type: EntityType): Entity {
    const normalized = normalizeEntity(rawText);
    
    // Check if entity exists
    if (this.entities.has(normalized)) {
      const existing = this.entities.get(normalized)!;
      existing.mentions++;
      existing.lastSeen = new Date().toISOString();
      return existing;
    }
    
    // Create new entity
    const entity: Entity = {
      id: normalized,
      rawText,
      type,
      confidence: this.calculateInitialConfidence(rawText, type),
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      mentions: 1
    };
    
    this.entities.set(normalized, entity);
    return entity;
  }
  
  private calculateInitialConfidence(text: string, type: EntityType): number {
    // Base confidence
    let confidence = 0.5;
    
    // Boost for capitalization (likely proper noun)
    if (text[0] === text[0].toUpperCase()) {
      confidence += 0.2;
    }
    
    // Boost for known patterns
    if (type === EntityType.PERSON && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) {
      confidence += 0.2;  // Looks like a name
    }
    
    if (type === EntityType.ORGANIZATION && /(Inc|Corp|LLC|Ltd|Company)/.test(text)) {
      confidence += 0.2;  // Has business suffix
    }
    
    return Math.min(confidence, 1.0);
  }
}
```

## Confidence Scoring

### Edge Confidence Heuristics

```typescript
function calculateEdgeConfidence(
  subject: Entity,
  predicate: AllowedPredicates,
  object: Entity,
  extractionContext: ExtractionContext
): number {
  let confidence = 0.0;
  
  // 1. Base confidence from extraction method
  if (extractionContext.method === 'explicit') {
    confidence = 0.7;  // Direct statement
  } else {
    confidence = 0.4;  // Inferred relationship
  }
  
  // 2. Boost for entity confidence
  const avgEntityConfidence = (subject.confidence + object.confidence) / 2;
  confidence += avgEntityConfidence * 0.2;
  
  // 3. Boost for linguistic markers
  const markers = extractionContext.linguisticMarkers;
  if (markers.includes('definitely') || markers.includes('certainly')) {
    confidence += 0.1;
  }
  if (markers.includes('probably') || markers.includes('maybe')) {
    confidence -= 0.2;
  }
  if (markers.includes('not') || markers.includes('never')) {
    confidence = 0.0;  // Negated relationship
  }
  
  // 4. Decay for temporal distance
  if (extractionContext.tense === 'past') {
    confidence *= 0.9;  // Slightly less certain about past
  }
  if (extractionContext.tense === 'future') {
    confidence *= 0.7;  // Much less certain about future
  }
  
  // 5. Boost for repetition
  if (extractionContext.previouslyStated) {
    confidence = Math.min(confidence + 0.1, 1.0);
  }
  
  return Math.max(0.0, Math.min(1.0, confidence));
}

interface ExtractionContext {
  method: 'explicit' | 'inferred';
  linguisticMarkers: string[];
  tense: 'past' | 'present' | 'future';
  previouslyStated: boolean;
}
```

### Confidence Updates

When an edge already exists, update confidence:

```typescript
function updateEdgeConfidence(
  existing: GraphEdge,
  newConfidence: number
): number {
  // Weighted average with recency bias
  const AGE_DECAY = 0.95;  // Older confidence decays
  const NEW_WEIGHT = 0.4;  // Weight of new observation
  
  const aged = existing.confidence * AGE_DECAY;
  const updated = (aged * (1 - NEW_WEIGHT)) + (newConfidence * NEW_WEIGHT);
  
  return Math.min(1.0, updated);
}
```

## Extraction Limits

### Per-Message Constraints

```typescript
interface ExtractionLimits {
  maxEdgesPerMessage: number;       // Default: 3
  maxEntitiesPerMessage: number;    // Default: 5
  maxTokensForExtraction: number;   // Default: 500
  skipShortMessages: number;        // Min chars: 10
}

const DEFAULT_LIMITS: ExtractionLimits = {
  maxEdgesPerMessage: 3,
  maxEntitiesPerMessage: 5,
  maxTokensForExtraction: 500,
  skipShortMessages: 10
};

function enforceExtractionLimits(
  candidates: CandidateEdge[],
  limits: ExtractionLimits
): GraphEdge[] {
  // Sort by confidence (highest first)
  candidates.sort((a, b) => b.confidence - a.confidence);
  
  // Apply per-predicate limits
  const predicateCounts = new Map<AllowedPredicates, number>();
  const selected: GraphEdge[] = [];
  
  for (const candidate of candidates) {
    // Check global limit
    if (selected.length >= limits.maxEdgesPerMessage) {
      break;
    }
    
    // Check per-predicate limit
    const predicateCount = predicateCounts.get(candidate.predicate) || 0;
    const constraint = PREDICATE_CONSTRAINTS[candidate.predicate];
    
    if (predicateCount < constraint.maxPerMessage) {
      selected.push(toGraphEdge(candidate));
      predicateCounts.set(candidate.predicate, predicateCount + 1);
    }
  }
  
  return selected;
}
```

## Deduplication

### Edge Deduplication

Edges are unique by `(subject, predicate, object)` tuple:

```typescript
class EdgeDeduplicator {
  private edges: Map<string, GraphEdge> = new Map();
  
  private getEdgeKey(subject: string, predicate: string, object: string): string {
    // Normalize and create composite key
    const s = normalizeEntity(subject);
    const p = predicate.toLowerCase();
    const o = normalizeEntity(object);
    return `${s}|${p}|${o}`;
  }
  
  upsertEdge(edge: GraphEdge): GraphEdge {
    const key = this.getEdgeKey(edge.subject, edge.predicate, edge.object);
    
    if (this.edges.has(key)) {
      // Update existing edge
      const existing = this.edges.get(key)!;
      existing.confidence = updateEdgeConfidence(existing, edge.confidence);
      existing.updatedAt = new Date().toISOString();
      existing.metadata.sourceMessageId = edge.metadata.sourceMessageId;
      return existing;
    } else {
      // Add new edge
      edge.id = generateEdgeId();
      edge.createdAt = new Date().toISOString();
      edge.updatedAt = edge.createdAt;
      this.edges.set(key, edge);
      return edge;
    }
  }
  
  getEdges(filter?: EdgeFilter): GraphEdge[] {
    let edges = Array.from(this.edges.values());
    
    if (filter) {
      if (filter.subject) {
        edges = edges.filter(e => e.subject === normalizeEntity(filter.subject!));
      }
      if (filter.predicate) {
        edges = edges.filter(e => e.predicate === filter.predicate);
      }
      if (filter.minConfidence) {
        edges = edges.filter(e => e.confidence >= filter.minConfidence!);
      }
    }
    
    return edges;
  }
}

interface EdgeFilter {
  subject?: string;
  predicate?: AllowedPredicates;
  object?: string;
  minConfidence?: number;
}
```

## Graph Queries

### Common Query Patterns

```typescript
interface GraphQuery {
  // Get all facts about an entity
  getEntityFacts(entityId: string): GraphEdge[];
  
  // Get all entities of a type
  getEntitiesByType(type: EntityType): Entity[];
  
  // Get relationships between two entities
  getRelationships(entity1: string, entity2: string): GraphEdge[];
  
  // Get entities connected by predicate
  getConnectedEntities(
    entityId: string, 
    predicate: AllowedPredicates, 
    direction: 'subject' | 'object'
  ): Entity[];
}

class GraphQueryEngine implements GraphQuery {
  constructor(
    private entities: Map<string, Entity>,
    private edges: EdgeDeduplicator
  ) {}
  
  getEntityFacts(entityId: string): GraphEdge[] {
    const normalized = normalizeEntity(entityId);
    return this.edges.getEdges({ subject: normalized })
      .concat(this.edges.getEdges({ object: normalized }));
  }
  
  getEntitiesByType(type: EntityType): Entity[] {
    return Array.from(this.entities.values())
      .filter(e => e.type === type);
  }
  
  getRelationships(entity1: string, entity2: string): GraphEdge[] {
    const e1 = normalizeEntity(entity1);
    const e2 = normalizeEntity(entity2);
    
    return this.edges.getEdges()
      .filter(edge => 
        (edge.subject === e1 && edge.object === e2) ||
        (edge.subject === e2 && edge.object === e1)
      );
  }
  
  getConnectedEntities(
    entityId: string,
    predicate: AllowedPredicates,
    direction: 'subject' | 'object'
  ): Entity[] {
    const normalized = normalizeEntity(entityId);
    const edges = this.edges.getEdges({ 
      [direction]: normalized,
      predicate 
    });
    
    const connectedIds = edges.map(e => 
      direction === 'subject' ? e.object : e.subject
    );
    
    return connectedIds
      .map(id => this.entities.get(id))
      .filter(e => e !== undefined) as Entity[];
  }
}
```

## Integration with Zep

### Storage Format

```typescript
interface ZepFactStorage {
  fact_id: string;          // Our edge ID
  user_id: string;          // User context
  session_id: string;       // Session context
  subject: string;          // Normalized entity
  predicate: string;        // Normalized predicate
  object: string;           // Normalized entity
  confidence: number;       // 0.0-1.0
  metadata: {
    subject_type: EntityType;
    object_type: EntityType;
    extraction_method: string;
    created_at: string;
    updated_at: string;
  };
}

function toZepFact(edge: GraphEdge, userId: string): ZepFactStorage {
  return {
    fact_id: edge.id,
    user_id: userId,
    session_id: edge.metadata.sourceSessionId,
    subject: edge.subject,
    predicate: edge.predicate,
    object: edge.object,
    confidence: edge.confidence,
    metadata: {
      subject_type: getEntityType(edge.subject),
      object_type: getEntityType(edge.object),
      extraction_method: edge.metadata.extractionMethod,
      created_at: edge.createdAt,
      updated_at: edge.updatedAt
    }
  };
}
```

## Admin Configuration

```typescript
interface OntologySettings {
  enabled: boolean;
  extraction: {
    maxEdgesPerMessage: number;      // 1-10
    maxEntitiesPerMessage: number;   // 1-20
    minConfidenceThreshold: number;  // 0.0-1.0
    allowedPredicates: AllowedPredicates[];
  };
  resolution: {
    strategy: 'string_match' | 'fuzzy' | 'ml';  // v0 uses string_match
    fuzzyThreshold?: number;         // For v1+
  };
  storage: {
    retentionDays: number;           // How long to keep edges
    maxEdgesPerUser: number;         // Storage limit
  };
}

const DEFAULT_ONTOLOGY_SETTINGS: OntologySettings = {
  enabled: true,
  extraction: {
    maxEdgesPerMessage: 3,
    maxEntitiesPerMessage: 5,
    minConfidenceThreshold: 0.3,
    allowedPredicates: Object.values(AllowedPredicates)
  },
  resolution: {
    strategy: 'string_match'
  },
  storage: {
    retentionDays: 90,
    maxEdgesPerUser: 1000
  }
};
```

## Testing Strategy

### Unit Tests

```typescript
describe('Ontology', () => {
  describe('Entity Normalization', () => {
    test('handles possessives', () => {
      expect(normalizeEntity("John's car")).toBe('john car');
    });
    
    test('handles unicode', () => {
      expect(normalizeEntity('Café Münchën')).toBe('cafe munchen');
    });
    
    test('removes articles', () => {
      expect(normalizeEntity('The White House')).toBe('white house');
    });
  });
  
  describe('Edge Deduplication', () => {
    test('merges identical edges', () => {
      const dedup = new EdgeDeduplicator();
      const edge1 = createEdge('john', 'works_at', 'acme', 0.7);
      const edge2 = createEdge('John', 'works_at', 'ACME', 0.8);
      
      dedup.upsertEdge(edge1);
      dedup.upsertEdge(edge2);
      
      const edges = dedup.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0].confidence).toBeGreaterThan(0.7);
    });
  });
  
  describe('Confidence Scoring', () => {
    test('explicit statements score higher', () => {
      const explicit = calculateEdgeConfidence(
        entity1, 'likes', entity2,
        { method: 'explicit', linguisticMarkers: [], tense: 'present', previouslyStated: false }
      );
      const inferred = calculateEdgeConfidence(
        entity1, 'likes', entity2,
        { method: 'inferred', linguisticMarkers: [], tense: 'present', previouslyStated: false }
      );
      
      expect(explicit).toBeGreaterThan(inferred);
    });
    
    test('negation zeros confidence', () => {
      const confidence = calculateEdgeConfidence(
        entity1, 'likes', entity2,
        { method: 'explicit', linguisticMarkers: ['not'], tense: 'present', previouslyStated: false }
      );
      
      expect(confidence).toBe(0.0);
    });
  });
});
```

### Integration Tests

1. Extract edges from real conversation samples
2. Verify Zep storage format compatibility
3. Test confidence decay over time
4. Validate extraction limits under load

## Monitoring Metrics

- `ontology.entities_extracted` - Count of new entities
- `ontology.edges_created` - Count of new edges
- `ontology.edges_updated` - Count of confidence updates
- `ontology.extraction_time_ms` - Processing latency
- `ontology.dedup_ratio` - Percentage of duplicate edges

## Future Enhancements (v1+)

1. **Fuzzy Entity Resolution**: Use Levenshtein distance for near-matches
2. **ML-based Resolution**: Train embeddings for semantic entity matching
3. **Temporal Predicates**: Add time-bound relationships (worked_at_until)
4. **Composite Entities**: Support multi-part entities (e.g., "New York City")
5. **Relation Extraction**: Use NLP models for automatic extraction
6. **Confidence Learning**: Adjust scoring based on user feedback

## Version History

- **v0.1.0** - Initial specification with string-match resolution
- **v1.0.0** - Production release (planned)
- **v2.0.0** - ML-based resolution (future)