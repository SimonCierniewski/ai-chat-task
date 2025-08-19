# Pricing System Documentation

## Overview

The pricing system manages token-based costs for AI model usage across the platform. It provides dynamic pricing configuration, real-time cost calculation, and integration with telemetry for usage tracking and billing.

## Database Schema

### models_pricing Table

The `models_pricing` table stores per-model token rates with support for cached token pricing.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `model` | text | Model identifier | PRIMARY KEY, UNIQUE |
| `input_per_mtok` | numeric(12,6) | Cost per million input tokens (USD) | NOT NULL, > 0 |
| `output_per_mtok` | numeric(12,6) | Cost per million output tokens (USD) | NOT NULL, > 0 |
| `cached_input_per_mtok` | numeric(12,6) | Cost per million cached tokens (USD) | Optional, > 0, < input rate |
| `updated_at` | timestamptz | Last modification timestamp | Auto-updated via trigger |

### Constraints

1. **Positive Rates**: All pricing values must be positive
2. **Cached Discount**: Cached input rate must be less than regular input rate
3. **Unique Model**: Each model identifier must be unique (enforced by PRIMARY KEY)

## Cost Calculation

### Formula

Cost is calculated per million tokens (mtok):

```
Total Cost = Input Cost + Cached Cost + Output Cost

Where:
- Input Cost = (input_tokens - cached_tokens) / 1,000,000 × input_per_mtok
- Cached Cost = cached_tokens / 1,000,000 × cached_input_per_mtok
- Output Cost = output_tokens / 1,000,000 × output_per_mtok
```

### Database Function

```sql
calculate_token_cost(
    p_model text,
    p_input_tokens bigint,
    p_output_tokens bigint,
    p_cached_input_tokens bigint DEFAULT 0
) RETURNS TABLE
```

Returns:
- `total_cost_usd`: Total calculated cost
- `input_cost_usd`: Cost for regular input tokens
- `output_cost_usd`: Cost for output tokens
- `cached_cost_usd`: Cost for cached input tokens
- `model_found`: Whether the model exists in pricing table

### Implementation Example

```typescript
// API Backend Cost Calculation
async function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): Promise<CostBreakdown> {
  const { data, error } = await supabase
    .rpc('calculate_token_cost', {
      p_model: model,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_cached_input_tokens: cachedTokens
    });
  
  if (error || !data?.[0]?.model_found) {
    // Fallback to default pricing or handle error
    console.warn(`Pricing not found for model: ${model}`);
    return calculateFallbackCost(inputTokens, outputTokens);
  }
  
  return {
    total: data[0].total_cost_usd,
    breakdown: {
      input: data[0].input_cost_usd,
      output: data[0].output_cost_usd,
      cached: data[0].cached_cost_usd
    }
  };
}
```

## Access Control

### Who Can Edit Pricing?

Only **admin users** via **server-side routes** can modify pricing:

1. **Service Role Key Required**: All write operations require Supabase service role
2. **Admin Dashboard**: Server-side API routes verify admin role before allowing updates
3. **No Client-Side Writes**: RLS policies block all client-side modifications

### Row Level Security Policies

| Operation | Allowed Roles | Purpose |
|-----------|---------------|---------|
| SELECT | service_role | Server-side reads only (can be extended to public) |
| INSERT | service_role | Admin server routes only |
| UPDATE | service_role | Admin server routes only |
| DELETE | service_role | Admin server routes only |

### Making Pricing Public (Optional)

To allow public read access to pricing:

```sql
-- Add public read policy
CREATE POLICY "Models pricing select public"
    ON public.models_pricing
    FOR SELECT
    TO anon, authenticated
    USING (true);
```

## Admin Panel Integration

### Pricing Management UI

The admin panel provides a pricing management interface at `/admin/pricing`:

#### Features

1. **View Current Rates**: Table showing all models and their rates
2. **Edit Rates**: Inline editing with validation
3. **Bulk Update**: CSV import for multiple model updates
4. **Audit Log**: View history of pricing changes via `updated_at`
5. **Cost Preview**: Calculate sample costs with test token counts

#### API Endpoints

```typescript
// Admin API Routes (server-side with service role)

// GET /api/admin/pricing
// Returns all model pricing
async function getPricing() {
  return await supabase
    .from('models_pricing')
    .select('*')
    .order('model');
}

// PUT /api/admin/pricing/:model
// Update specific model pricing
async function updatePricing(model: string, rates: PricingUpdate) {
  // Verify admin role
  if (!isAdmin(request.user)) {
    throw new UnauthorizedError();
  }
  
  return await supabase
    .from('models_pricing')
    .upsert({
      model,
      input_per_mtok: rates.input,
      output_per_mtok: rates.output,
      cached_input_per_mtok: rates.cached
    });
}

// POST /api/admin/pricing/bulk
// Bulk update multiple models
async function bulkUpdatePricing(updates: PricingUpdate[]) {
  // Verify admin role
  if (!isAdmin(request.user)) {
    throw new UnauthorizedError();
  }
  
  return await supabase
    .from('models_pricing')
    .upsert(updates);
}
```

### Admin UI Components

```tsx
// Admin Dashboard Pricing Page
const PricingManager = () => {
  return (
    <div className="pricing-manager">
      <h2>Model Pricing Configuration</h2>
      
      {/* Current Rates Table */}
      <PricingTable 
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      
      {/* Add New Model */}
      <AddModelForm onSubmit={handleAdd} />
      
      {/* Bulk Import */}
      <BulkImport onImport={handleBulkImport} />
      
      {/* Cost Calculator */}
      <CostCalculator models={models} />
    </div>
  );
};
```

## Manual Entry Paths

### Via SQL (Direct Database)

```sql
-- Add new model
INSERT INTO public.models_pricing (
    model, 
    input_per_mtok, 
    output_per_mtok, 
    cached_input_per_mtok
) VALUES (
    'new-model-name',
    1.50,    -- $1.50 per million input tokens
    4.50,    -- $4.50 per million output tokens
    0.75     -- $0.75 per million cached tokens (optional)
);

-- Update existing model
UPDATE public.models_pricing 
SET 
    input_per_mtok = 2.00,
    output_per_mtok = 5.00,
    cached_input_per_mtok = 1.00
WHERE model = 'existing-model';
```

### Via Admin API

```bash
# Update single model pricing
curl -X PUT https://api.example.com/api/admin/pricing/gpt-4o-mini \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": 0.15,
    "output": 0.60,
    "cached": 0.075
  }'

# Bulk update via CSV
curl -X POST https://api.example.com/api/admin/pricing/bulk \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@pricing_update.csv"
```

### Via Supabase Dashboard

1. Navigate to Table Editor
2. Select `models_pricing` table
3. Click "Insert Row" or edit existing rows
4. Enter model name and rates
5. Save changes

## Integration with Telemetry

### Cost Recording

When an OpenAI API call completes:

1. Calculate cost using `calculate_token_cost()` function
2. Store in `telemetry_events` with type `openai_call`:

```typescript
const cost = await calculateCost(model, tokensIn, tokensOut);

await supabase.from('telemetry_events').insert({
  user_id: userId,
  session_id: sessionId,
  type: 'openai_call',
  payload_json: {
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: cost.total,
    // ... other metrics
  }
});
```

### Cost Aggregation

Daily aggregation includes cost rollups:

```sql
-- Automated by aggregate_daily_usage() function
SELECT 
    SUM(payload_json->>'cost_usd') as total_cost,
    AVG(payload_json->>'cost_usd') as avg_cost_per_request
FROM telemetry_events
WHERE type = 'openai_call'
  AND created_at::date = CURRENT_DATE;
```

## Monitoring & Alerts

### Recommended Monitoring

1. **Pricing Staleness**: Alert if pricing hasn't been updated in 30+ days
2. **Missing Models**: Alert when cost calculation fails due to missing model
3. **Rate Changes**: Log all pricing updates for audit trail
4. **Cost Anomalies**: Alert on unusual cost spikes

### Audit Queries

```sql
-- Recent pricing changes
SELECT model, input_per_mtok, output_per_mtok, updated_at
FROM models_pricing
WHERE updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;

-- Models without cached pricing
SELECT model 
FROM models_pricing
WHERE cached_input_per_mtok IS NULL;

-- Cost comparison between models
SELECT 
    model,
    calculate_token_cost(model, 1000, 500, 0) as cost_1k_tokens
FROM models_pricing
ORDER BY cost_1k_tokens DESC;
```

## Migration & Deployment

### Initial Setup

1. Run migration: `009_create_models_pricing_standalone.sql`
2. Verify seed data matches current provider rates
3. Update rates via admin panel or API
4. Test cost calculation function

### Updating Pricing

1. **Regular Updates**: Monthly review of provider pricing
2. **Immediate Updates**: When providers announce changes
3. **Bulk Updates**: Use CSV import for multiple models
4. **Validation**: Ensure cached rates < regular rates

## Troubleshooting

### Common Issues

1. **Model Not Found**: Ensure model name matches exactly (case-sensitive)
2. **Zero Costs**: Check if model exists in pricing table
3. **Incorrect Costs**: Verify rates match provider's current pricing
4. **Access Denied**: Ensure service role key is used for writes

### Debug Queries

```sql
-- Check if model exists
SELECT * FROM models_pricing WHERE model = 'gpt-4o-mini';

-- Test cost calculation
SELECT * FROM calculate_token_cost('gpt-4o-mini', 1000, 500, 100);

-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename = 'models_pricing';
```