# Magic Link Authentication Setup for Android

## Important: How Magic Link Works

The Supabase magic link authentication flow works as follows:

1. **Send Magic Link**: User enters email in the app
2. **Email Received**: User receives email with a verification link
3. **Click Link in Browser**: User must click the link, which opens in a web browser
4. **Browser Verification**: Browser verifies the token with Supabase
5. **Redirect to App**: Browser redirects to `aichat-dev://auth` with session tokens
6. **App Receives Session**: App catches the deep link and establishes session

## Setup Instructions

### 1. Email Configuration

When you receive the magic link email, it will contain a link like:
```
https://fgscwpqqadqncgjknsmk.supabase.co/auth/v1/verify?token=...&type=signup&redirect_to=aichat-dev://auth
```

**IMPORTANT**: You must click this link to open it in your default browser. Do not copy and paste the link.

### 2. Testing on Emulator

If testing on an Android emulator:

1. Click the magic link in your email (open email in emulator's browser)
2. The browser will verify and redirect to the app
3. The app should automatically open and log you in

If the app doesn't open automatically:
- Make sure the app is installed
- Check that the deep link scheme matches (`aichat-dev://auth`)

### 3. Testing on Physical Device

On a physical Android device:

1. Install the dev APK on your device
2. Open your email app and click the magic link
3. The browser will open, verify, and redirect to the app
4. Accept the "Open with AI Chat" prompt if asked

### 4. Manual Deep Link Testing

To test deep links manually with ADB:

```bash
# Test the deep link redirect (after browser verification)
adb shell am start -W -a android.intent.action.VIEW \
  -d "aichat-dev://auth#access_token=TOKEN&refresh_token=REFRESH&type=signup" \
  com.prototype.aichat.dev.debug
```

### 5. Troubleshooting

#### App Stays on "Magic Link Sent" Screen

This usually means the deep link wasn't received. Possible causes:

1. **Link not clicked in browser**: The verification link must be opened in a browser, not copied
2. **App not installed**: Make sure the dev variant is installed
3. **Wrong scheme**: Check that the redirect URL in Supabase matches `aichat-dev://auth`

#### "Invalid or expired magic link" Error

- Magic links expire after a certain time (usually 24 hours)
- Request a new magic link if the old one expired
- Make sure you're using the latest link sent

#### Deep Link Not Opening App

1. Check AndroidManifest.xml has the correct intent filter
2. Verify the app package name matches: `com.prototype.aichat.dev.debug`
3. Try reinstalling the app

### 6. Supabase Dashboard Configuration

In your Supabase project dashboard:

1. Go to **Authentication → URL Configuration**
2. Add to **Redirect URLs**:
   - `aichat-dev://auth` (for development)
   - `aichat://auth` (for production)
3. Save changes

### 7. Current Known Issues

- The Supabase SDK v2.1.0 requires the magic link to be opened in a browser
- Direct deep link handling (without browser) is not fully supported
- Session persistence works after successful authentication

## Alternative: Testing with Direct Token

For development testing, you can also create a session directly in the app using test tokens. See the API documentation for generating test JWTs.