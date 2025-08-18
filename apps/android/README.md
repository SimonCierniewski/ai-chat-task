# Android App - AI Chat

Native Android application with Kotlin/Compose, featuring Supabase magic link authentication and SSE streaming support.

## Features

- 🔐 **Magic Link Authentication** via Supabase
- 🔗 **Deep Link Handling** for auth callbacks
- 💾 **Persistent Session Storage** using DataStore
- 📋 **Session Management UI** with token display (dev mode)
- 🌊 **SSE Streaming Support** for real-time chat

## Setup

### Prerequisites

- Android Studio Hedgehog (2023.1.1) or later
- JDK 17 or later
- Android SDK 34
- Minimum device/emulator API 24 (Android 7.0)

### 1. Clone and Configure

```bash
cd apps/android
cp local.properties.example local.properties
```

### 2. Configure Environment

Edit `local.properties` with your Supabase credentials:

```properties
# Supabase Configuration
supabase.url=https://your-project.supabase.co
supabase.anonKey=your-anon-key

# Deep Link Configuration
app.deeplink.scheme=aichat
app.deeplink.host=auth

# API Configuration (for emulator)
api.baseUrl=http://10.0.2.2:3000
```

**Important:** Use `10.0.2.2` instead of `localhost` when running on Android emulator to access host machine's localhost.

### 3. Configure Supabase Deep Links

In your Supabase Dashboard:

1. Go to **Authentication → URL Configuration**
2. Add to **Redirect URLs**:
   ```
   aichat://auth
   ```
   (Replace `aichat` with your configured scheme)

### 4. Build and Run

```bash
# Using Gradle
./gradlew assembleDebug
./gradlew installDebug

# Or use Android Studio
# Open the project and click Run
```

## Testing Authentication Flow

### Complete Auth Flow Test

1. **Launch the app**
   - App opens showing the login screen
   - No session exists initially

2. **Enter email and request magic link**
   - Enter a valid email address
   - Tap "Send Magic Link"
   - You should see "Magic link sent to [email]" message

3. **Check email**
   - Open your email client
   - Look for email from Supabase (check spam if needed)
   - The email contains a magic link

4. **Tap the magic link**
   - On a physical device: Tap the link in your email app
   - On emulator: Copy the link and open it in the emulator's browser
   - The link should look like: `https://your-project.supabase.co/auth/v1/verify?token=...&type=magiclink&redirect_to=aichat://auth`

5. **App handles deep link**
   - Android system prompts which app to open (select AI Chat)
   - App automatically opens and processes the auth callback
   - Session is established

6. **Verify authentication**
   - Session screen appears showing:
     - Logged in email
     - User ID
     - Session expiry time
     - Access token (with copy button for dev testing)

### Testing Deep Links Manually

```bash
# Test deep link via ADB (Android Debug Bridge)
adb shell am start -W -a android.intent.action.VIEW -d "aichat://auth?token=test" com.prototype.aichat

# The app should open and attempt to handle the deep link
```

### Session Persistence Test

1. **Authenticate successfully**
2. **Force close the app** (swipe up from recent apps)
3. **Reopen the app**
4. **Verify session persists** (should show session screen, not login)

### Token Copy Feature (Dev Only)

1. When authenticated, go to session screen
2. Find "Access Token (Dev Only)" section
3. Tap "Copy Full Token" button
4. Token is copied to clipboard
5. Can be used for testing API calls manually

## Project Structure

```
app/src/main/java/com/prototype/aichat/
├── data/
│   ├── SupabaseClient.kt       # Supabase initialization
│   └── AuthRepository.kt       # Auth state management
├── ui/
│   ├── screens/
│   │   ├── LoginScreen.kt      # Magic link login UI
│   │   └── SessionScreen.kt    # Session display UI
│   └── theme/
│       ├── Theme.kt
│       ├── Color.kt
│       └── Type.kt
├── viewmodel/
│   └── AuthViewModel.kt        # Auth business logic
├── MainActivity.kt             # Deep link handler
└── AIChatApplication.kt       # Application class
```

## Key Components

### Deep Link Configuration

The app is configured to handle `aichat://auth` deep links:

- **Scheme**: `aichat` (configurable via `app.deeplink.scheme`)
- **Host**: `auth` (configurable via `app.deeplink.host`)
- **Manifest**: Intent filter in `AndroidManifest.xml`
- **Handler**: `MainActivity.handleIntent()`

### Auth State Management

```kotlin
sealed class AuthState {
    object Loading : AuthState()
    object NotAuthenticated : AuthState()
    data class MagicLinkSent(val email: String) : AuthState()
    data class Authenticated(val session: UserSession) : AuthState()
    data class Error(val message: String) : AuthState()
}
```

### Session Access

To access the current session token in your app:

```kotlin
// In a Composable
val authViewModel: AuthViewModel = viewModel()
val token = authViewModel.getAccessToken()

// Use token for API calls
val response = apiClient.get("/api/me") {
    header("Authorization", "Bearer $token")
}
```

## Gradle Dependencies

Key dependencies configured in `app/build.gradle.kts`:

```kotlin
// Supabase
implementation("io.github.jan-tennert.supabase:gotrue-kt:2.0.3")
implementation("io.github.jan-tennert.supabase:postgrest-kt:2.0.3")
implementation("io.github.jan-tennert.supabase:realtime-kt:2.0.3")

// Compose
implementation("androidx.compose.ui:ui")
implementation("androidx.compose.material3:material3")
implementation("androidx.navigation:navigation-compose:2.7.6")

// DataStore for session persistence
implementation("androidx.datastore:datastore-preferences:1.0.0")

// SSE for streaming
implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")
```

## Environment Variables

Required in `local.properties`:

| Variable | Description | Example |
|----------|-------------|---------|
| `supabase.url` | Supabase project URL | `https://xxx.supabase.co` |
| `supabase.anonKey` | Supabase anonymous key | `eyJhbG...` |
| `app.deeplink.scheme` | Deep link scheme | `aichat` |
| `app.deeplink.host` | Deep link host | `auth` |
| `api.baseUrl` | Backend API URL | `http://10.0.2.2:3000` |

## Troubleshooting

### Deep Link Not Working

1. **Check URL Configuration in Supabase**
   - Ensure `aichat://auth` is in redirect URLs
   - Verify email template uses correct redirect URL

2. **Verify Manifest Configuration**
   - Check intent filter in `AndroidManifest.xml`
   - Ensure `launchMode="singleTask"`

3. **Test with ADB**
   ```bash
   adb shell am start -W -a android.intent.action.VIEW \
     -d "aichat://auth" com.prototype.aichat
   ```

### Session Not Persisting

1. **Check DataStore**
   - Clear app data and try again
   - Verify DataStore initialization

2. **Check Supabase Client**
   - Ensure auth persistence is enabled
   - Verify session refresh works

### Network Issues on Emulator

- Use `10.0.2.2` instead of `localhost` for API URL
- Check emulator has internet access
- Verify INTERNET permission in manifest

### Magic Link Email Not Received

1. Check spam/junk folder
2. Verify email configuration in Supabase
3. Check Supabase logs for email sending errors
4. Try with a different email provider

## Build Commands

```bash
# Debug build
./gradlew assembleDebug

# Release build
./gradlew assembleRelease

# Install on connected device/emulator
./gradlew installDebug

# Run tests
./gradlew test

# Clean build
./gradlew clean

# Generate signed APK (requires keystore)
./gradlew assembleRelease
```

## Next Steps

After authentication is working:

1. **Implement Chat UI** - Add chat screens with message list
2. **SSE Integration** - Connect to API streaming endpoints
3. **Memory Toggle** - Add Zep memory integration
4. **Session Management** - Add refresh token handling
5. **Error Handling** - Improve error messages and retry logic