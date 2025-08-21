# Supabase Database Notes

## Daily Usage Views

The telemetry system uses views to aggregate usage data. After running migration `010_create_daily_usage_views.sql`, you have:

1. **`daily_usage_view`** - Real-time view (always up-to-date, but can be slow on large datasets)
2. **`daily_usage_mv`** - Materialized view (cached data, faster queries but needs refresh)

## Known Supabase Limitations

### 1. pg_cron Extension
- **Issue**: `ERROR: schema "cron" does not exist`
- **Reason**: pg_cron is only available on paid Supabase plans
- **Solution**: Use one of these alternatives:
  - Manual refresh via SQL Editor
  - Supabase Edge Functions with scheduled triggers
  - External cron service calling the refresh function via API

### 2. ALTER OWNER Permission
- **Issue**: `ERROR: permission denied for schema public`
- **Reason**: Supabase doesn't allow changing ownership to service_role
- **Solution**: Use GRANT statements instead (already included in migration)

## Refreshing the Materialized View

### Option 1: Manual Refresh (Recommended for Development)
Run this in SQL Editor whenever you want fresh data:
```sql
-- Full refresh (rebuilds entire view)
SELECT refresh_daily_usage_mv();

-- OR incremental refresh (last 7 days only, faster)
SELECT refresh_daily_usage_mv_incremental(7);
```

### Option 2: Supabase Edge Function (Recommended for Production)
Create an Edge Function that runs on a schedule:

```typescript
// supabase/functions/refresh-daily-usage/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.rpc('refresh_daily_usage_mv_incremental', {
    days_back: 2
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

Then schedule it using a service like:
- GitHub Actions (cron schedule)
- Vercel Cron Jobs
- External monitoring service (e.g., UptimeRobot)

### Option 3: API Endpoint for Manual Trigger
Add this to your admin routes:

```typescript
// /api/v1/admin/refresh-metrics
server.post('/refresh-metrics', async (req, reply) => {
  const { data, error } = await supabaseAdmin
    .rpc('refresh_daily_usage_mv_incremental', { days_back: 2 });
  
  if (error) {
    return reply.status(500).send({ error: error.message });
  }
  
  return reply.send({ success: true, message: 'Metrics refreshed' });
});
```

## Performance Tips

1. **For Development**: Use the real-time view (`daily_usage_view`) - always current
2. **For Production**: Use the materialized view (`daily_usage_mv`) with scheduled refresh
3. **Refresh Frequency**: Every hour is usually sufficient for dashboards
4. **Incremental vs Full**: Use incremental refresh (last 2-7 days) for better performance

## Testing the Views

```sql
-- Check real-time view
SELECT * FROM daily_usage_view 
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY day DESC, user_id, model
LIMIT 10;

-- Check materialized view (may need refresh first)
SELECT * FROM daily_usage_mv 
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY day DESC, user_id, model
LIMIT 10;

-- Check when materialized view was last refreshed
SELECT DISTINCT last_refreshed FROM daily_usage_mv LIMIT 1;
```