# Magic Link Authentication Flow

Complete implementation guide for Supabase magic link authentication with deep linking and persistent sessions in the Android app.

## Overview

The app uses passwordless authentication via magic links sent to the user's email. When the user clicks the link, it opens the app via deep linking, authenticates the session, and persists it for future app launches.

## Architecture Components

### 1. Deep Link Configuration

**AndroidManifest.xml**
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    
    <data
        android:scheme="${deeplinkScheme}"
        android:host="${deeplinkHost}" />
</intent-filter>
```

Build variants inject different schemes:
- **Dev**: `aichat-dev://auth`
- **Prod**: `aichat://auth`

### 2. Supabase Client Setup

**SupabaseAuthClient.kt**
- Configured with deep link scheme and host
- Auto-refresh enabled for token management
- Handles session restoration from saved tokens

```kotlin
install(Auth) {
    scheme = AppConfig.DEEPLINK_SCHEME
    host = AppConfig.DEEPLINK_HOST
    alwaysAutoRefresh = true
    autoRefreshPeriod = 30 // seconds before expiry
}
```

### 3. Session Persistence

**SessionRepository.kt**
- Uses DataStore for encrypted preference storage
- Saves: access token, refresh token, expiry, user info
- Validates session expiry before restoration
- Provides Flow-based session observation

### 4. Authentication Flow States

**AuthViewModel.kt** manages UI states:
- `isLoading`: API call in progress
- `isAuthenticated`: User has valid session
- `emailSent`: Magic link sent successfully
- `emailSentTo`: Email address for user reference
- `error`: Error messages for user feedback

## Manual Testing Steps

### Step 1: Configure Supabase Project

1. **Create Supabase Project**
   ```
   - Go to https://app.supabase.com
   - Create new project in EU region
   - Note down project URL and anon key
   ```

2. **Enable Email Auth**
   ```
   - Dashboard → Authentication → Providers
   - Enable Email provider
   - Disable "Confirm email" for testing
   ```

3. **Configure Redirect URLs**
   ```
   - Dashboard → Authentication → URL Configuration
   - Add to "Redirect URLs":
     - aichat-dev://auth (for dev)
     - aichat://auth (for prod)
   ```

4. **Customize Email Template** (Optional)
   ```
   - Dashboard → Authentication → Email Templates
   - Select "Magic Link"
   - Customize subject and body
   - Ensure {{ .ConfirmationURL }} is included
   ```

### Step 2: Configure Android App

1. **Update local.properties**
   ```properties
   # Development
   dev.supabase.url=https://your-project.supabase.co
   dev.supabase.anonKey=your-anon-key
   dev.app.deeplink.scheme=aichat-dev
   dev.app.deeplink.host=auth
   
   # Production
   prod.supabase.url=https://your-project.supabase.co
   prod.supabase.anonKey=your-anon-key
   prod.app.deeplink.scheme=aichat
   prod.app.deeplink.host=auth
   ```

2. **Select Build Variant**
   ```
   Android Studio → Build Variants → devDebug
   ```

### Step 3: Test Magic Link Flow

1. **Send Magic Link**
   - Launch app
   - Enter email address
   - Tap "Send Magic Link"
   - UI shows "Check your email" state

2. **Receive Email**
   - Check email inbox
   - Email subject: "Confirm Your Email"
   - Email contains magic link button

3. **Click Magic Link**
   - Tap link in email
   - Browser opens briefly
   - Redirects to app via deep link
   - App opens and processes auth

4. **Session Established**
   - Loading indicator shows
   - Session is validated
   - User navigates to Chat screen
   - Session persisted to DataStore

### Step 4: Verify Session Persistence

1. **Force Stop App**
   ```bash
   adb shell am force-stop com.prototype.aichat.dev
   ```

2. **Relaunch App**
   - App should skip login
   - Session restored from DataStore
   - Direct navigation to Chat screen

3. **Check Session Info**
   - Navigate to Session/Profile screen
   - Verify user email displayed
   - Access token available for API calls

### Step 5: Test Edge Cases

#### Expired Link
1. Wait > 1 hour after sending link
2. Click expired link
3. App shows error: "Invalid or expired magic link"

#### Invalid Link
1. Modify URL parameters manually
2. Open modified link
3. App shows error: "Invalid or expired magic link"

#### Network Failure
1. Enable airplane mode
2. Try to send magic link
3. App shows error: "Network error"

#### Session Expiry
1. Wait for token expiry (default 1 hour)
2. App auto-refreshes using refresh token
3. Session continues seamlessly

#### Sign Out
1. Tap sign out button
2. Session cleared from DataStore
3. Navigate back to login screen

## Deep Link Testing

### Using ADB

```bash
# Test deep link with sample token (will fail auth but tests routing)
adb shell am start -W -a android.intent.action.VIEW \
  -d "aichat-dev://auth?token=sample_token" \
  com.prototype.aichat.dev

# Test with actual Supabase URL format
adb shell am start -W -a android.intent.action.VIEW \
  -d "aichat-dev://auth#access_token=xxx&refresh_token=yyy&expires_in=3600" \
  com.prototype.aichat.dev
```

### Using Email Client

1. **Gmail App**
   - Magic links open in Chrome first
   - Chrome redirects to app
   - Session imported automatically

2. **Outlook App**
   - Opens in-app browser
   - May require "Open in App" tap
   - Then redirects properly

3. **Default Mail App**
   - Behavior varies by device
   - Usually opens default browser
   - Browser handles redirect

## Troubleshooting

### Issue: Deep link not opening app

**Solution 1**: Verify intent filter
```bash
# Check installed app handles the scheme
adb shell pm dump com.prototype.aichat.dev | grep -A 5 "aichat-dev"
```

**Solution 2**: Clear defaults
```
Settings → Apps → Chrome → Clear Defaults
Settings → Apps → AI Chat → Set as Default → Supported Links
```

### Issue: Session not persisting

**Solution**: Check DataStore
```kotlin
// Add debug logging in SessionRepository
Log.d("Session", "Saving: $session")
Log.d("Session", "Retrieved: $savedSession")
```

### Issue: Magic link not received

**Solution**: Check Supabase logs
```
Dashboard → Logs → Auth Logs
Look for email send events
Check spam folder
```

### Issue: Token expired immediately

**Solution**: Check device time
```bash
# Ensure device time is synced
adb shell date
```

## Security Considerations

1. **Token Storage**
   - Tokens stored in encrypted DataStore
   - Not accessible to other apps
   - Cleared on app uninstall

2. **Deep Link Security**
   - Uses custom scheme (not https)
   - Tokens in URL are temporary
   - Session validated server-side

3. **Network Security**
   - Dev: Allows cleartext to localhost
   - Prod: HTTPS only
   - Certificate pinning optional

## API Integration

After successful authentication:

```kotlin
// Get access token for API calls
val token = authViewModel.getAccessToken()

// Use in API headers
val headers = mapOf(
    "Authorization" to "Bearer $token"
)

// SSE connection with auth
chatApiService.sendChatMessage(request, token)
```

## Session Lifecycle

```
App Launch
    ↓
Check DataStore
    ↓
Session exists? → Yes → Validate expiry → Valid → Restore session → Chat
    ↓ No                     ↓ Expired
Login Screen ← ← ← ← ← ← ← ←

User enters email
    ↓
Send magic link
    ↓
Email received
    ↓
Click link
    ↓
Deep link handled
    ↓
Session created
    ↓
Save to DataStore
    ↓
Navigate to Chat
```

## Build Variant URLs

### Development
- Supabase: `https://dev-project.supabase.co`
- API: `http://10.0.2.2:3000`
- Deep Link: `aichat-dev://auth`

### Production
- Supabase: `https://prod-project.supabase.co`
- API: `https://api.your-domain.com`
- Deep Link: `aichat://auth`

## Monitoring

Check authentication metrics:
- Supabase Dashboard → Authentication → Users
- See active users, last sign in
- Monitor failed authentication attempts

## Next Steps

1. Implement biometric authentication for session unlock
2. Add "Remember me" option with longer refresh tokens
3. Implement account deletion flow
4. Add email verification requirement for production
5. Implement rate limiting on magic link sends
6. Add analytics tracking for auth events