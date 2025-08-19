import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
  allErrors: true,
  strict: false,
});

addFormats(ajv);

export const validator = ajv;

export const schemas = {
  chatRequest: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 4000 },
      useMemory: { type: 'boolean', default: false },
      sessionId: { type: 'string', pattern: '^session-[0-9]{8}-[0-9]{6}-[A-Za-z0-9]{4}$' },
      model: { 
        type: 'string', 
        enum: ['gpt-4-mini', 'gpt-4', 'gpt-3.5-turbo'],
        default: 'gpt-4-mini',
      },
    },
    additionalProperties: false,
  },
  
  memoryUpsert: {
    type: 'object',
    required: ['facts'],
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', minLength: 1, maxLength: 500 },
            type: { type: 'string', enum: ['fact', 'preference', 'context'] },
            metadata: { type: 'object' },
          },
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 100,
      },
    },
    additionalProperties: false,
  },
  
  pricingUpdate: {
    type: 'object',
    required: ['model', 'input_per_mtok', 'output_per_mtok'],
    properties: {
      model: { 
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 1,
        maxLength: 50,
      },
      input_per_mtok: { type: 'number', minimum: 0, maximum: 1000 },
      output_per_mtok: { type: 'number', minimum: 0, maximum: 1000 },
      cached_input_per_mtok: { type: 'number', minimum: 0, maximum: 1000 },
    },
    additionalProperties: false,
  },
};

export function compileSchema(schema: object) {
  return ajv.compile(schema);
}

export function validateSchema(schema: object, data: any): { valid: boolean; errors?: any } {
  const validate = compileSchema(schema);
  const valid = validate(data);
  
  if (!valid) {
    return {
      valid: false,
      errors: validate.errors,
    };
  }
  
  return { valid: true };
}