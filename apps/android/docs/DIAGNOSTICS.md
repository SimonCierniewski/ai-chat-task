# Diagnostics Screen Documentation

## Overview
The Diagnostics screen is a development-only feature that provides debugging information and system metrics for the Android app. This screen is **only available in debug builds** and is completely removed from release builds.

## Accessing the Diagnostics Screen

### Location
The Diagnostics screen can be accessed from the Chat screen:
1. Open the app and navigate to the Chat screen
2. Tap the three-dot menu (⋮) in the top-right corner
3. Select "Diagnostics (Dev)" from the dropdown menu

### Availability
- ✅ **Available in**: `devDebug`, `prodDebug` builds
- ❌ **Not available in**: `devRelease`, `prodRelease` builds

The menu option is conditionally displayed based on `BuildConfig.DEBUG` flag.

## Information Displayed

### 1. Build Information
- **Build Variant**: Current build type (debug/release)
- **Flavor**: Environment flavor (dev/prod)
- **Version Name**: Semantic version with suffix
- **Version Code**: Integer version code
- **Application ID**: Full package name with suffixes
- **Debug Mode**: Boolean flag status

### 2. Configuration
- **API Base URL**: Backend API endpoint
- **Supabase URL**: Supabase project URL
- **Deep Link Scheme**: URL scheme for auth callbacks
- **Deep Link Host**: Host portion of deep links

### 3. User Session
- **User ID**: Current authenticated user's ID
- **Email**: User's email address
- **Session Active**: Whether a valid session exists
- **Token Expiry**: JWT expiration timestamp

### 4. Performance Metrics
- **Last TTFT**: Time to first token in milliseconds
- **Last SSE Status**: Status of last SSE connection
- **Active Connections**: Number of open connections
- **Memory Used**: Current memory usage in MB

### 5. Recent Logs
- Displays recent application logs
- Automatically sanitized to remove secrets
- Limited to last 100 log entries
- Monospace font for readability

## Features

### Log Management
- **Copy Logs**: Copy sanitized logs to clipboard
- **Clear Logs**: Clear the log buffer
- **Refresh**: Update metrics and information

### SSE Testing
- **Test SSE Connection**: Trigger a test SSE connection to verify streaming

## Security Considerations

### Log Sanitization
The following sensitive data is automatically removed from logs:
- Bearer tokens
- Passwords
- API keys
- Service role keys
- Anonymous keys

### Build Protection
The Diagnostics screen is protected at multiple levels:
1. **Code Level**: Wrapped in `if (BuildConfig.DEBUG)` checks
2. **Navigation Level**: Route only registered in debug builds
3. **UI Level**: Menu option conditionally rendered
4. **ProGuard**: Code removed during release minification

## Implementation Details

### Key Components
- **DiagnosticsScreen.kt**: Main UI composable
- **DiagnosticsViewModel.kt**: Business logic and data collection
- **LogCollector.kt**: Centralized log collection service
- **MetricsRepository.kt**: Performance metrics tracking

### Data Sources
- **Build Information**: From `BuildConfig` generated fields
- **Configuration**: From `AppConfig` object
- **Session Info**: From `SessionRepository`
- **Metrics**: From `MetricsRepository`
- **Logs**: From `LogCollector` singleton

## Testing the Diagnostics Screen

### In Development
1. Build a debug variant: `./gradlew assembleDevDebug`
2. Install on device/emulator
3. Navigate to Chat screen
4. Access via overflow menu
5. Verify all information displays correctly

### Verify Removal in Release
1. Build a release variant: `./gradlew assembleDevRelease`
2. Install and run the app
3. Navigate to Chat screen
4. Verify no "Diagnostics" option in menu
5. Check APK with `aapt` to confirm code removal

## Extending the Diagnostics Screen

To add new diagnostic information:

1. **Add to UI State**:
```kotlin
data class DiagnosticsUiState(
    // ... existing fields
    val newMetric: String = "N/A"
)
```

2. **Update ViewModel**:
```kotlin
// In loadDiagnosticData()
_uiState.value = _uiState.value.copy(
    newMetric = calculateNewMetric()
)
```

3. **Display in UI**:
```kotlin
DiagnosticItem("New Metric", uiState.newMetric)
```

## Best Practices

### Do's
- ✅ Always sanitize sensitive data
- ✅ Keep logs concise and relevant
- ✅ Update metrics in real-time when possible
- ✅ Test in both debug and release builds

### Don'ts
- ❌ Never log passwords or tokens
- ❌ Don't include in production builds
- ❌ Avoid excessive memory usage
- ❌ Don't expose internal implementation details

## Troubleshooting

### Diagnostics Not Appearing
- Verify you're running a debug build
- Check `BuildConfig.DEBUG` is true
- Ensure navigation route is registered
- Look for compilation errors

### Logs Not Updating
- Check `LogCollector` is initialized
- Verify log methods are being called
- Ensure buffer size limits not exceeded
- Try clearing and refreshing logs

### Metrics Showing N/A
- Verify repositories are initialized
- Check data sources are available
- Ensure proper permissions granted
- Wait for async operations to complete