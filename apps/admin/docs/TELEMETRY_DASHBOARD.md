# Telemetry Dashboard Documentation

## Overview

The Telemetry Dashboard provides comprehensive analytics and metrics visualization for the AI Chat system. All data is fetched server-side to protect service-role credentials, ensuring security while providing real-time insights into system performance and usage.

## Architecture

### Data Flow
1. **Client Request**: Browser requests `/admin/telemetry` page
2. **Server-Side Fetch**: Next.js API route fetches from backend `/api/v1/admin/metrics`
3. **Authentication**: Service role key used server-side, never exposed to browser
4. **Data Rendering**: Recharts components visualize the metrics client-side

### Security
- All metrics fetched through server-side API route (`/api/telemetry/metrics`)
- Service role key remains server-only
- Admin role verification before data access
- No sensitive credentials exposed to browser

## Features

### 1. Filters
- **Date Range**: Last 7 days or Last 30 days
- **User Selector**: Optional filter by specific user (shows email)
- **Model Selector**: Optional filter by AI model

### 2. KPI Cards
- **Total Messages**: Sum of all messages in selected period
- **Total Cost**: Aggregate cost in USD (4 decimal precision)
- **Average TTFT**: Mean time to first token across all requests
- **Average Response Time**: Mean end-to-end latency

### 3. Visualizations

#### Messages per Day (Line Chart)
- X-axis: Date (MM/DD format)
- Y-axis: Message count
- Interactive tooltip with exact values
- Blue line with dot markers

#### Average TTFT per Day (Line Chart)
- Dual metrics: TTFT and Response Time
- Purple line for TTFT
- Pink line for Response Time
- Y-axis shows milliseconds
- Performance trends visible at a glance

#### Costs per Day (Area Chart)
- Green filled area chart
- Y-axis in USD currency format
- Shows daily spending patterns
- Helps identify cost spikes

#### Model Usage & Costs (Bar Chart)
- Dual Y-axis design
- Left axis: Message count (blue bars)
- Right axis: Total cost in USD (green bars)
- Model comparison at a glance

## Sample Screenshots to Produce During QA

### Screenshot 1: Full Dashboard View
**Setup**: 
- Date range: Last 7 days
- No filters applied
- All charts visible

**Expected Elements**:
```
┌─────────────────────────────────────────────────────┐
│ Telemetry                                            │
│ System metrics and performance data                  │
├─────────────────────────────────────────────────────┤
│ [Date Range ▼] [User (Optional) ▼] [Model ▼]       │
├─────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                   │
│ │ 💬  │ │ 💰  │ │ ⚡  │ │ ⏱️  │                   │
│ │2,345│ │$123 │ │287ms│ │1.2s │                   │
│ └─────┘ └─────┘ └─────┘ └─────┘                   │
├─────────────────────────────────────────────────────┤
│ Messages per Day          │ Avg TTFT per Day        │
│ [Line Chart]              │ [Dual Line Chart]       │
├─────────────────────────────────────────────────────┤
│ Costs per Day             │ Model Usage & Costs     │
│ [Area Chart]              │ [Bar Chart]             │
└─────────────────────────────────────────────────────┘
```

### Screenshot 2: Filtered View
**Setup**:
- Date range: Last 30 days
- User: alice@example.com
- Model: gpt-4o-mini

**Expected Changes**:
- KPI values update to reflect filtered data
- Charts show only filtered results
- Reduced data points if filtering is restrictive

### Screenshot 3: Loading State
**Setup**:
- Initial page load or filter change

**Expected Display**:
```
┌─────────────────────────────────────────────────────┐
│ Telemetry                                            │
│ System metrics and performance data                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│            Loading metrics...                        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Screenshot 4: Error State
**Setup**:
- Backend API unavailable or returns error

**Expected Display**:
```
┌─────────────────────────────────────────────────────┐
│ Telemetry                                            │
│ System metrics and performance data                  │
├─────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────┐  │
│ │ ⚠️ Failed to fetch metrics                    │  │
│ │ [Retry]                                        │  │
│ └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Screenshot 5: Interactive Tooltip
**Setup**:
- Hover over any data point in charts

**Expected Tooltip**:
```
┌─────────────────────┐
│ 2024-01-15          │
│ Messages: 342       │
│ Cost: $12.3456      │
│ TTFT: 245ms         │
└─────────────────────┘
```

## API Response Format

### Request
```http
GET /api/telemetry/metrics?from=2024-01-01&to=2024-01-07&userId=user-123&model=gpt-4o-mini
```

### Response Structure
```json
{
  "kpis": {
    "total_messages": 2345,
    "total_cost": 123.4567,
    "avg_ttft_ms": 287,
    "avg_response_ms": 1234
  },
  "daily": [
    {
      "day": "2024-01-01",
      "messages": 342,
      "total_cost": 12.3456,
      "avg_ttft_ms": 245,
      "avg_response_ms": 987,
      "tokens_in": 12345,
      "tokens_out": 23456
    }
  ],
  "models": [
    {
      "model": "gpt-4o-mini",
      "count": 1234,
      "total_cost": 45.6789
    }
  ],
  "users": [
    {
      "user_id": "user-123",
      "email": "alice@example.com",
      "message_count": 567,
      "total_cost": 23.4567
    }
  ]
}
```

## Testing Checklist

### Functional Tests
- [ ] Date range filter changes data correctly
- [ ] User filter shows only selected user's metrics
- [ ] Model filter shows only selected model's metrics
- [ ] KPI cards update with filter changes
- [ ] All charts render without errors
- [ ] Tooltips show correct formatted values

### Performance Tests
- [ ] Initial load time < 2 seconds
- [ ] Filter changes update < 1 second
- [ ] Charts render smoothly with 30 days of data
- [ ] No memory leaks on filter changes

### Data Validation
- [ ] KPI totals match sum of daily data
- [ ] Cost calculations accurate to 4 decimals
- [ ] Timing metrics in correct units (ms)
- [ ] Date formatting consistent (MM/DD)

### Error Handling
- [ ] Graceful fallback for API errors
- [ ] Retry button functional
- [ ] Loading state displays correctly
- [ ] No console errors in production

### Security Tests
- [ ] No service role key in browser DevTools
- [ ] No sensitive data in network requests
- [ ] Admin role properly enforced
- [ ] CORS properly configured

## Development Notes

### Key Files
- `/apps/admin/src/app/admin/telemetry/page.tsx` - Main dashboard component
- `/apps/admin/src/app/api/telemetry/metrics/route.ts` - Server-side data fetching
- `/apps/admin/lib/config.ts` - Configuration management

### Mock Data
The API route includes mock data generation for development when the backend is unavailable. This ensures the UI can be developed and tested independently.

### Chart Library
Using Recharts 2.10.3 for all visualizations:
- Responsive containers for adaptive sizing
- Custom tooltips for formatted values
- Consistent color scheme across charts

## Troubleshooting

### Issue: Charts not rendering
- **Check**: Recharts package installed correctly
- **Check**: Data format matches expected structure
- **Action**: Verify ResponsiveContainer has explicit height

### Issue: No data displayed
- **Check**: Backend API `/api/v1/admin/metrics` accessible
- **Check**: User has admin role
- **Check**: Date range contains data

### Issue: Filters not working
- **Check**: Query parameters properly encoded
- **Check**: Backend supports filtering parameters
- **Action**: Check network tab for correct API calls

### Issue: Performance degradation
- **Check**: Date range not too large (>30 days)
- **Check**: Browser memory usage
- **Action**: Consider pagination for large datasets

## Future Enhancements

1. **Real-time Updates**: WebSocket for live metrics
2. **Custom Date Range**: Date picker for specific periods
3. **Export**: Download charts as PNG/CSV
4. **Comparison Mode**: Compare metrics across periods
5. **Alerts**: Threshold-based notifications
6. **Drill-down**: Click charts to see detailed logs