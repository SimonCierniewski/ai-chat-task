# Users & Pricing Management Documentation

## Overview

The Users and Pricing management features provide comprehensive admin controls for user role management and model pricing configuration. All operations are performed server-side using service role credentials, ensuring security and data integrity.

## Architecture

### Security Model
- **Server-Side Operations**: All data fetching and updates use server-side API routes
- **Service Role Key**: Never exposed to browser, used only in Node.js API routes
- **Role-Based Access**: Admin role required for all operations
- **Sanitized Responses**: Client receives only necessary data

### Data Flow
1. **Client Request**: Browser makes request to Next.js API route
2. **Authentication**: Server verifies JWT and admin role
3. **Backend Call**: Server uses service role to fetch/update data
4. **Response**: Sanitized data returned to client

## Users Management (/admin/users)

### Features

#### 1. User List
- **Pagination**: 10 users per page with navigation controls
- **Search**: Real-time search by email or user ID
- **Debouncing**: 300ms delay on search input
- **Display**: Email, role, created date, last sign-in, message count

#### 2. Role Management
- **Promote to Admin**: Elevate user role to admin
- **Demote to User**: Reduce admin to standard user
- **Self-Protection**: Cannot demote yourself
- **Instant Update**: UI reflects changes immediately

#### 3. Server Routes
- `GET /api/users`: Fetch paginated user list
- `PUT /api/users/[userId]/role`: Update user role

### Workflow

#### Viewing Users
1. Navigate to `/admin/users`
2. Users load automatically with pagination
3. Use search box to filter by email/ID
4. Navigate pages using Previous/Next buttons

#### Updating Roles
1. Find target user in list
2. Click "Promote to Admin" or "Demote to User"
3. Confirm action if prompted
4. Role updates immediately
5. Profile created if doesn't exist

### Guardrails

#### Permission Checks
```typescript
// Server-side role verification
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('user_id', user.id)
  .single();

if (profile?.role !== 'admin') {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

#### Self-Demotion Prevention
```typescript
if (params.userId === user.id && body.role !== 'admin') {
  return NextResponse.json({ 
    error: 'Cannot demote yourself' 
  }, { status: 400 });
}
```

#### Profile Auto-Creation
If user profile doesn't exist when updating role:
1. Detect missing profile
2. Create new profile with specified role
3. Return success response

## Pricing Management (/admin/pricing)

### Features

#### 1. Pricing Table
- **Inline Editing**: Click Edit to modify prices
- **Batch Save**: Save all changes at once
- **Change Tracking**: Visual indicator for unsaved changes
- **Validation**: Non-negative values enforced

#### 2. Cost Calculator
- **Real-Time**: Updates as you type
- **Model Selection**: Choose from configured models
- **Token Input**: Specify input/output tokens
- **Precision**: 6 decimal places for accuracy

#### 3. Server Routes
- `GET /api/pricing`: Fetch current pricing
- `POST /api/pricing`: Update model pricing

### Workflow

#### Viewing Pricing
1. Navigate to `/admin/pricing`
2. Current pricing loads automatically
3. View model names, input/output/cached rates
4. Check last updated timestamps

#### Updating Pricing
1. Click "Edit" on target model row
2. Modify input/output/cached prices
3. Click "Done" when finished editing
4. Yellow bar appears showing unsaved changes
5. Click "Save All Changes" to persist
6. Success message confirms update
7. Changes reflected immediately in playground

#### Using Calculator
1. Select model from dropdown
2. Enter input token count
3. Enter output token count
4. View calculated cost instantly

### Data Format

#### Pricing Model Structure
```typescript
interface ModelPricing {
  model: string;                // Model identifier (e.g., "gpt-4o-mini")
  display_name?: string;        // Human-friendly name
  input_per_mtok: number;       // Cost per million input tokens
  output_per_mtok: number;      // Cost per million output tokens
  cached_input_per_mtok?: number; // Optional cached rate
  updated_at?: string;          // ISO timestamp
}
```

#### Cost Calculation
```typescript
const inputCost = (tokens / 1000000) * input_per_mtok;
const outputCost = (tokens / 1000000) * output_per_mtok;
const totalCost = inputCost + outputCost;
```

### Guardrails

#### Validation Rules
1. **Required Fields**: model, input_per_mtok, output_per_mtok
2. **Non-Negative**: All prices must be >= 0
3. **Numeric Only**: Parse and validate numbers
4. **Precision**: Up to 4 decimal places displayed

#### Update Process
```typescript
// Attempt backend API update first
const response = await fetch('/api/v1/admin/models/pricing', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ models }),
});

// Fallback to direct Supabase if needed
if (!response.ok) {
  // Use service role for direct update
  await updateViaSupabase(models);
}
```

## Permissions Required

### Database Tables
- **profiles**: Read/write access via service role
- **auth.users**: Read access via Supabase Admin API
- **models_pricing**: Read/write access via service role

### Environment Variables
```bash
# Required for server-side operations
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
DATABASE_URL=<postgres-connection-string>
```

### RLS Policies
Profiles table RLS should allow:
- Service role: Full access
- Users: Read own profile only
- Admins: Read all profiles (via service role)

## Error Handling

### Common Errors

#### Authentication Errors
- **401 Unauthorized**: User not authenticated
- **403 Forbidden**: User lacks admin role
- **Solution**: Ensure valid session and admin role

#### Data Errors
- **404 Profile Not Found**: User has no profile
- **Solution**: Auto-create profile on first update

#### Network Errors
- **502 Backend Unavailable**: API server down
- **Solution**: Fallback to mock data in development

### Error Messages
```typescript
// User-friendly error display
{error && (
  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
    <p className="text-red-700">{error}</p>
    <button onClick={retry}>Retry</button>
  </div>
)}
```

## Testing Checklist

### Users Management
- [ ] List loads with pagination
- [ ] Search filters results correctly
- [ ] Pagination navigation works
- [ ] Promote user to admin succeeds
- [ ] Demote admin to user succeeds
- [ ] Cannot demote self
- [ ] Profile auto-creation works

### Pricing Management
- [ ] Pricing loads from backend
- [ ] Inline editing enables/disables
- [ ] Changes tracked visually
- [ ] Save all persists to backend
- [ ] Calculator updates in real-time
- [ ] Validation prevents negative values
- [ ] Success/error messages display

### Security Tests
- [ ] Non-admin cannot access pages
- [ ] Service role key not in network tab
- [ ] JWT verification works
- [ ] RLS policies enforced

## Development Notes

### Mock Data
Both features include mock data for development:
- Users: 12 sample users with varied roles
- Pricing: 5 common models with realistic prices

### Caching Strategy
- Users: No caching, fresh data each request
- Pricing: Can be cached client-side until save

### Performance Considerations
- Debounced search reduces API calls
- Pagination limits data transfer
- Batch updates reduce round trips

## Troubleshooting

### Issue: Users not loading
**Check**: Backend API `/api/v1/admin/users` accessible
**Check**: Supabase auth.users endpoint configured
**Fallback**: Mock users displayed in development

### Issue: Cannot update roles
**Check**: Service role key configured
**Check**: Profiles table exists with proper schema
**Action**: Verify RLS policies allow service role access

### Issue: Pricing changes not saving
**Check**: Backend API `/api/v1/admin/models/pricing` accessible
**Check**: models_pricing table exists
**Action**: Check browser console for detailed errors

### Issue: Calculator showing $0
**Check**: Model selected in dropdown
**Check**: Token values are numbers
**Action**: Verify pricing data loaded correctly

## Future Enhancements

### Users
1. **Bulk Operations**: Select multiple users for role changes
2. **User Details**: Expanded view with full activity history
3. **Export**: Download user list as CSV
4. **Filtering**: Advanced filters by date, role, activity
5. **Audit Log**: Track who made role changes

### Pricing
1. **History**: View pricing changes over time
2. **Import/Export**: Bulk update via CSV
3. **Presets**: Save common pricing configurations
4. **Comparison**: Side-by-side model cost analysis
5. **Alerts**: Notification when costs exceed thresholds