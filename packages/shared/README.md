# @prototype/shared

Shared types, schemas, and utilities for the AI Chat Task monorepo.

## Overview

This package provides TypeScript types, JSON schemas (Ajv-compatible), and utility functions that are shared between the API and Admin applications. It ensures type safety and contract consistency across the entire system.

## Installation

This package is part of the monorepo and is automatically available to other workspace packages.

```bash
# From the root of the monorepo
pnpm install

# Build the shared package
pnpm --filter @prototype/shared build
```

## Usage

### In API Application

```typescript
import { 
  TelemetryEvent, 
  TelemetryEventType,
  telemetryEventSchema,
  ModelPricing,
  calculateCost,
  DailyUsageRow 
} from '@prototype/shared';

// Validate telemetry event
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(telemetryEventSchema);

if (validate(eventData)) {
  // Event is valid
  await saveTelemetryEvent(eventData as TelemetryEvent);
}

// Calculate costs
const usage = { input_tokens: 150, output_tokens: 450 };
const pricing: ModelPricing = await getPricing('gpt-4o-mini');
const cost = calculateCost(usage, pricing);
```

### In Admin Application

```typescript
import { 
  DailyUsageRow,
  UsageSummary,
  calculateUsageSummary,
  toTimeSeries,
  CHART_COLORS,
  EVENT_TYPE_LABELS 
} from '@prototype/shared';

// Process daily usage data
const rows: DailyUsageRow[] = await fetchDailyUsage();
const summary: UsageSummary = calculateUsageSummary(rows);

// Convert to chart data
const timeSeries = toTimeSeries(rows, 'cost_usd');

// Use constants for UI
const eventLabel = EVENT_TYPE_LABELS['openai_call']; // "OpenAI Call"
const chartColor = CHART_COLORS.primary; // "#3b82f6"
```

## Module Structure

### Telemetry (`/src/telemetry.ts`)

Types and schemas for telemetry event tracking.

- **Types**: `TelemetryEvent`, `TelemetryPayload`, `TelemetryEventType`
- **Schemas**: `telemetryEventSchema`, `telemetryPayloadSchema`
- **Validators**: `isTelemetryEventType()`, `validateEventPayload()`
- **Constants**: `EVENT_TYPE_LABELS`, `EVENT_TYPE_COLORS`

### Pricing (`/src/pricing.ts`)

Types and utilities for model pricing and cost calculation.

- **Types**: `ModelPricing`, `TokenUsage`, `CostBreakdown`
- **Schemas**: `modelPricingSchema`, `tokenUsageSchema`
- **Functions**: `calculateCost()`, `formatCost()`, `formatTokens()`
- **Constants**: `COMMON_MODELS`, `MODEL_PROVIDERS`, `DEFAULT_PRICING`

### Aggregates (`/src/aggregates.ts`)

Types for reporting views and aggregated data.

- **Types**: `DailyUsageRow`, `UsageSummary`, `UserUsageSummary`, `ChartData`
- **Functions**: `calculateUsageSummary()`, `toTimeSeries()`, `toCsv()`
- **Constants**: `QUERY_DEFAULTS`, `METRIC_LABELS`, `CHART_COLORS`

## Type Alignment

All TypeScript types are aligned with the database schema:

| TypeScript Type | Database Table/View | Purpose |
|----------------|-------------------|---------|
| `TelemetryEvent` | `telemetry_events` | Raw event storage |
| `ModelPricing` | `models_pricing` | Token pricing rates |
| `DailyUsageRow` | `daily_usage_view` / `daily_usage_mv` | Aggregated metrics |

## JSON Schema Validation

The package provides Ajv-compatible JSON schemas for runtime validation:

```typescript
import Ajv from 'ajv';
import { telemetryEventSchema } from '@prototype/shared';

const ajv = new Ajv();
const validate = ajv.compile(telemetryEventSchema);

// Validate incoming data
const isValid = validate(data);
if (!isValid) {
  console.error('Validation errors:', validate.errors);
}
```

## Development

```bash
# Build the package
pnpm --filter @prototype/shared build

# Watch mode for development
pnpm --filter @prototype/shared dev

# Type checking
pnpm --filter @prototype/shared type-check

# Clean build artifacts
pnpm --filter @prototype/shared clean
```

## API Reference

### Key Exports

#### Telemetry
- `TelemetryEvent` - Complete event structure
- `TelemetryPayload` - Event payload data
- `TelemetryEventType` - Event type union
- `telemetryEventSchema` - Ajv schema for validation
- `validateEventPayload()` - Type-specific validation

#### Pricing
- `ModelPricing` - Pricing structure
- `calculateCost()` - Cost calculation function
- `formatCost()` - USD formatting
- `formatTokens()` - Token count formatting

#### Aggregates
- `DailyUsageRow` - Daily usage data
- `calculateUsageSummary()` - Summary statistics
- `toTimeSeries()` - Chart data conversion
- `toCsv()` - CSV export formatting

## Notes

- All monetary values are in USD
- All timestamps can be either ISO strings or Date objects
- Token counts are integers, costs are decimals with up to 6 decimal places
- The package is TypeScript-first with strict type checking enabled