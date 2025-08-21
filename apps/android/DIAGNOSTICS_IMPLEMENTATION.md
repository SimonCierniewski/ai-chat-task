# Diagnostics Implementation Summary

## Completed Tasks

### 1. ✅ Diagnostics Screen (Dev-Only)
**Location**: `/app/src/main/java/com/prototype/aichat/ui/screens/DiagnosticsScreen.kt`

**Features Implemented**:
- Build variant and flavor display
- API and Supabase URL configuration (no secrets)
- User session information (ID, email, expiry)
- Performance metrics (TTFT, SSE status, memory)
- Recent logs viewer with sanitization
- Copy logs to clipboard functionality
- Clear logs and refresh actions

### 2. ✅ Supporting Infrastructure

**Created Files**:
- `DiagnosticsViewModel.kt` - Business logic and data management
- `LogCollector.kt` - Centralized logging with circular buffer
- `MetricsRepository.kt` - Performance metrics tracking

**Updated Files**:
- `AppNavigation.kt` - Added dev-only route for diagnostics
- `ChatScreen.kt` - Added menu option to access diagnostics
- `build.gradle.kts` - Added FLAVOR BuildConfig field

### 3. ✅ Security & Access Control

**Implementation**:
- Screen only accessible via `BuildConfig.DEBUG` flag
- Menu option conditionally rendered in debug builds
- Navigation route conditionally registered
- Automatic log sanitization removes:
  - Bearer tokens
  - Passwords  
  - API keys
  - Service role keys

### 4. ✅ Documentation

**Created Documents**:
- `/docs/QA_CHECKLIST.md` - Comprehensive QA testing guide
- `/docs/RELEASE.md` - Release process and configuration
- `/docs/DIAGNOSTICS.md` - Diagnostics feature documentation

## How to Access Diagnostics

### In Debug Builds Only:
1. Launch the app in debug mode
2. Navigate to the Chat screen
3. Tap the three-dot menu (⋮) in top-right
4. Select "Diagnostics (Dev)" option
5. Red-colored app bar indicates dev screen

### Build Commands:
```bash
# Debug build with diagnostics
cd apps/android
gradle assembleDevDebug

# Release build without diagnostics  
gradle assembleDevRelease
```

## Key Implementation Details

### Build Variant Detection
The screen displays build information using BuildConfig fields:
```kotlin
BuildConfig.BUILD_TYPE    // "debug" or "release"
BuildConfig.FLAVOR        // "dev" or "prod"
BuildConfig.VERSION_NAME  // e.g., "1.0.0-dev"
BuildConfig.DEBUG         // true in debug builds
```

### Log Sanitization
Sensitive data is automatically removed:
```kotlin
private fun sanitizeLogs(logs: String): String {
    return logs
        .replace(Regex("Bearer [A-Za-z0-9-._~+/]+=*"), "Bearer [REDACTED]")
        .replace(Regex("\"password\"\\s*:\\s*\"[^\"]*\""), "\"password\":\"[REDACTED]\"")
        // ... other patterns
}
```

### Metrics Collection
Performance data is collected in real-time:
- TTFT tracked from SSE first token
- Memory usage from Runtime
- Connection status from SSE client
- Session info from repositories

## Testing the Implementation

### Verify Dev Build Has Diagnostics:
1. Build: `gradle assembleDevDebug`
2. Install APK
3. Navigate to Chat → Menu → Diagnostics
4. Verify all sections display data
5. Test copy logs functionality

### Verify Release Build Excludes Diagnostics:
1. Build: `gradle assembleDevRelease`  
2. Install APK
3. Navigate to Chat → Menu
4. Confirm no "Diagnostics" option
5. APK should be smaller (code removed)

## Notes for QA

- The Diagnostics screen is intentionally styled with error colors (red app bar) to make it obvious this is a development feature
- All displayed URLs and configuration values are already public in BuildConfig
- No secrets or sensitive tokens are ever displayed
- The screen includes a warning that it's dev-only
- Logs are limited to last 100 entries to prevent memory issues

## Future Enhancements (Optional)

Could add in future releases:
- Network request inspector
- Database table viewer
- Shared preferences editor
- Cache size display
- Thread dump capability
- Memory heap analysis

## Acceptance Criteria Met ✅

1. **Dev-only route**: Screen only accessible in debug builds via BuildConfig.DEBUG
2. **Shows required info**: Build variant, URLs, user info, TTFT, SSE status
3. **Copy logs**: Button to copy sanitized recent logs to clipboard
4. **No secrets**: All sensitive data automatically redacted
5. **QA doc created**: Comprehensive checklist in `/docs/QA_CHECKLIST.md`
6. **Release doc created**: Full release guide in `/docs/RELEASE.md`
7. **Can produce debug APK**: Build configuration properly set up
8. **Run QA without code changes**: All test scenarios documented

## Where to Flip Dev Flag

The dev/debug behavior is controlled by:
1. **Build Variant**: Choose `devDebug` vs `devRelease` in Android Studio
2. **Gradle Command**: Use `assembleDevDebug` vs `assembleDevRelease`
3. **BuildConfig.DEBUG**: Automatically set by build type

No manual flag flipping needed - it's controlled by the build variant!