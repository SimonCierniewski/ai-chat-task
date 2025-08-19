/**
 * Knowledge Graph Types and Schemas
 * Types for knowledge graph edges and facts in Zep memory
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Predicate types for knowledge graph relationships
 */
export type GraphPredicate = 
  | 'likes'
  | 'dislikes'
  | 'prefers'
  | 'works_at'
  | 'worked_at'
  | 'located_in'
  | 'lives_in'
  | 'knows'
  | 'uses'
  | 'owns'
  | 'interested_in'
  | 'expert_in'
  | 'learning'
  | 'speaks_language'
  | 'has_role'
  | 'manages'
  | 'reports_to'
  | 'collaborates_with';

/**
 * Knowledge graph edge representing a fact/relationship
 */
export interface GraphEdge {
  subject: string;                   // Entity (usually "user" or person name)
  predicate: GraphPredicate;         // Relationship type
  object: string;                    // Related entity or value
  confidence: number;                // Confidence score (0-1)
  source_message_id?: string | null; // Message this was extracted from
  created_at: string | Date;         // When fact was created
  metadata?: GraphEdgeMetadata;      // Optional additional context
}

/**
 * Optional metadata for graph edges
 */
export interface GraphEdgeMetadata {
  session_id?: string;               // Session where extracted
  extraction_method?: 'explicit' | 'inferred' | 'manual';
  verified?: boolean;                // Human verified
  expires_at?: string;               // Fact expiration (for temporal facts)
  context?: string;                  // Additional context
  tags?: string[];                   // Classification tags
  [key: string]: unknown;            // Extensible
}

/**
 * Input for creating a new graph edge
 */
export interface CreateGraphEdge {
  subject: string;
  predicate: GraphPredicate;
  object: string;
  confidence?: number;                // Default: 0.5
  source_message_id?: string | null;
  metadata?: GraphEdgeMetadata;
}

/**
 * Batch edge creation request
 */
export interface BatchGraphEdges {
  collection_name: string;           // User collection (user:uuid)
  edges: CreateGraphEdge[];
}

/**
 * Graph query parameters
 */
export interface GraphQuery {
  collection_name: string;           // User collection
  subject?: string;                  // Filter by subject
  predicate?: GraphPredicate | GraphPredicate[]; // Filter by predicate(s)
  object?: string;                   // Filter by object
  min_confidence?: number;           // Minimum confidence threshold
  limit?: number;                    // Max results
  include_expired?: boolean;         // Include expired facts
}

/**
 * Graph statistics for a collection
 */
export interface GraphStats {
  total_edges: number;
  unique_subjects: number;
  unique_predicates: number;
  unique_objects: number;
  avg_confidence: number;
  edges_by_predicate: Record<GraphPredicate, number>;
  last_updated: string | Date;
}

// ============================================================================
// JSON Schemas (Ajv-compatible)
// ============================================================================

/**
 * JSON Schema for GraphEdge validation
 * Note: Using 'any' type due to AJV's complex type requirements for nullable properties
 */
export const graphEdgeSchema: any = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'Subject entity'
    },
    predicate: {
      type: 'string',
      enum: [
        'likes', 'dislikes', 'prefers',
        'works_at', 'worked_at',
        'located_in', 'lives_in',
        'knows', 'uses', 'owns',
        'interested_in', 'expert_in', 'learning',
        'speaks_language', 'has_role',
        'manages', 'reports_to', 'collaborates_with'
      ],
      description: 'Relationship type'
    },
    object: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Object entity or value'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score'
    },
    source_message_id: {
      type: ['string', 'null'],
      minLength: 1,
      description: 'Source message ID'
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      description: 'Creation timestamp'
    },
    metadata: {
      type: ['object', 'null'],
      properties: {
        session_id: { type: ['string', 'null'] },
        extraction_method: {
          type: ['string', 'null'],
          enum: ['explicit', 'inferred', 'manual']
        },
        verified: { type: ['boolean', 'null'] },
        expires_at: { type: ['string', 'null'], format: 'date-time' },
        context: { type: ['string', 'null'], maxLength: 1000 },
        tags: {
          type: ['array', 'null'],
          items: { type: 'string' },
          maxItems: 10
        }
      },
      additionalProperties: true
    }
  },
  required: ['subject', 'predicate', 'object', 'confidence', 'created_at'],
  additionalProperties: false
};

/**
 * JSON Schema for CreateGraphEdge validation
 */
export const createGraphEdgeSchema: any = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    predicate: {
      type: 'string',
      enum: [
        'likes', 'dislikes', 'prefers',
        'works_at', 'worked_at',
        'located_in', 'lives_in',
        'knows', 'uses', 'owns',
        'interested_in', 'expert_in', 'learning',
        'speaks_language', 'has_role',
        'manages', 'reports_to', 'collaborates_with'
      ]
    },
    object: {
      type: 'string',
      minLength: 1,
      maxLength: 500
    },
    confidence: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: 1
    },
    source_message_id: {
      type: ['string', 'null'],
      minLength: 1
    },
    metadata: {
      type: ['object', 'null'],
      additionalProperties: true
    }
  },
  required: ['subject', 'predicate', 'object'],
  additionalProperties: false
};

/**
 * JSON Schema for GraphQuery validation
 */
export const graphQuerySchema: any = {
  type: 'object',
  properties: {
    collection_name: {
      type: 'string',
      pattern: '^user:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    },
    subject: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 200
    },
    predicate: {
      oneOf: [
        { type: 'null' },
        {
          type: 'string',
          enum: [
            'likes', 'dislikes', 'prefers',
            'works_at', 'worked_at',
            'located_in', 'lives_in',
            'knows', 'uses', 'owns',
            'interested_in', 'expert_in', 'learning',
            'speaks_language', 'has_role',
            'manages', 'reports_to', 'collaborates_with'
          ]
        },
        {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'likes', 'dislikes', 'prefers',
              'works_at', 'worked_at',
              'located_in', 'lives_in',
              'knows', 'uses', 'owns',
              'interested_in', 'expert_in', 'learning',
              'speaks_language', 'has_role',
              'manages', 'reports_to', 'collaborates_with'
            ]
          },
          minItems: 1,
          uniqueItems: true
        }
      ]
    },
    object: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 500
    },
    min_confidence: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: 1
    },
    limit: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: 1000
    },
    include_expired: {
      type: ['boolean', 'null']
    }
  },
  required: ['collection_name'],
  additionalProperties: false
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a fact has expired
 */
export function isExpired(edge: GraphEdge): boolean {
  if (!edge.metadata?.expires_at) return false;
  return new Date(edge.metadata.expires_at) < new Date();
}

/**
 * Filter edges by confidence threshold
 */
export function filterByConfidence(
  edges: GraphEdge[], 
  minConfidence: number
): GraphEdge[] {
  return edges.filter(e => e.confidence >= minConfidence);
}

/**
 * Group edges by predicate
 */
export function groupByPredicate(
  edges: GraphEdge[]
): Map<GraphPredicate, GraphEdge[]> {
  const grouped = new Map<GraphPredicate, GraphEdge[]>();
  
  for (const edge of edges) {
    const existing = grouped.get(edge.predicate) || [];
    existing.push(edge);
    grouped.set(edge.predicate, existing);
  }
  
  return grouped;
}

/**
 * Sort edges by confidence (descending)
 */
export function sortByConfidence(edges: GraphEdge[]): GraphEdge[] {
  return edges.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Deduplicate edges (keep highest confidence)
 */
export function deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Map<string, GraphEdge>();
  
  for (const edge of edges) {
    const key = `${edge.subject}:${edge.predicate}:${edge.object}`;
    const existing = seen.get(key);
    
    if (!existing || edge.confidence > existing.confidence) {
      seen.set(key, edge);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Format edge as natural language
 */
export function edgeToText(edge: GraphEdge): string {
  const predicateText = PREDICATE_LABELS[edge.predicate] || edge.predicate;
  return `${edge.subject} ${predicateText} ${edge.object}`;
}

/**
 * Extract user facts from edges
 */
export function extractUserFacts(edges: GraphEdge[]): string[] {
  return edges
    .filter(e => e.subject.toLowerCase() === 'user')
    .map(edgeToText);
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Predicate categories
 */
export const PREDICATE_CATEGORIES = {
  PREFERENCES: ['likes', 'dislikes', 'prefers'] as GraphPredicate[],
  LOCATION: ['located_in', 'lives_in'] as GraphPredicate[],
  WORK: ['works_at', 'worked_at', 'has_role', 'manages', 'reports_to'] as GraphPredicate[],
  SOCIAL: ['knows', 'collaborates_with'] as GraphPredicate[],
  SKILLS: ['expert_in', 'learning', 'speaks_language'] as GraphPredicate[],
  INTERESTS: ['interested_in', 'uses', 'owns'] as GraphPredicate[]
} as const;

/**
 * Human-readable predicate labels
 */
export const PREDICATE_LABELS: Record<GraphPredicate, string> = {
  likes: 'likes',
  dislikes: 'dislikes',
  prefers: 'prefers',
  works_at: 'works at',
  worked_at: 'worked at',
  located_in: 'is located in',
  lives_in: 'lives in',
  knows: 'knows',
  uses: 'uses',
  owns: 'owns',
  interested_in: 'is interested in',
  expert_in: 'is expert in',
  learning: 'is learning',
  speaks_language: 'speaks',
  has_role: 'has role',
  manages: 'manages',
  reports_to: 'reports to',
  collaborates_with: 'collaborates with'
};

/**
 * Default confidence levels
 */
export const CONFIDENCE_LEVELS = {
  EXPLICIT: 1.0,      // User explicitly stated
  HIGH: 0.9,          // Strong inference
  MEDIUM: 0.7,        // Moderate confidence
  LOW: 0.5,           // Weak inference
  UNCERTAIN: 0.3      // Very uncertain
} as const;

/**
 * Graph configuration defaults
 */
export const GRAPH_DEFAULTS = {
  DEFAULT_CONFIDENCE: 0.5,
  MIN_CONFIDENCE_THRESHOLD: 0.3,
  MAX_EDGES_PER_QUERY: 100,
  FACT_EXPIRY_DAYS: 180,
  MAX_FACTS_PER_USER: 500
} as const;