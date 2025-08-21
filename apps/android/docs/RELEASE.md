# Android App Release Guide

## Overview
This document outlines the process for building, signing, and releasing the Android app. It covers versioning, build configuration, signing setup, and deployment procedures.

## Version Management

### Version Numbering Scheme
The app uses semantic versioning with the following format:
- **versionName**: `MAJOR.MINOR.PATCH` (e.g., "1.0.0")
- **versionCode**: Integer that increments with each release

### Version Guidelines
- **MAJOR**: Breaking changes or significant features
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes and minor improvements
- **versionCode**: Always increment, even for internal builds

### Updating Version
Edit `/apps/android/app/build.gradle.kts`:
```kotlin
defaultConfig {
    versionCode = 2  // Increment this
    versionName = "1.0.1"  // Update semantic version
}
```

---

## Build Configuration

### Build Types

#### Debug Build
- **Purpose**: Development and testing
- **Features**:
  - Debuggable
  - No obfuscation
  - Includes diagnostics screen
  - Uses debug signing certificate
  - Cleartext traffic allowed (dev only)

#### Release Build
- **Purpose**: Production deployment
- **Features**:
  - Not debuggable
  - Code minification enabled (R8)
  - Resource shrinking enabled
  - ProGuard rules applied
  - Production signing required
  - HTTPS only

### Product Flavors

#### Dev Flavor
- **Application ID**: `com.prototype.aichat.dev`
- **Deep Link**: `aichat-dev://auth`
- **API**: Points to development server
- **Features**: All debug tools enabled

#### Prod Flavor
- **Application ID**: `com.prototype.aichat`
- **Deep Link**: `aichat://auth`
- **API**: Points to production server
- **Features**: Debug tools disabled

---

## Signing Configuration

### Debug Keystore (Current)
The app currently uses the default Android debug keystore:
- **Location**: `~/.android/debug.keystore`
- **Password**: `android`
- **Alias**: `androiddebugkey`
- **Validity**: Auto-generated, expires after 365 days

### Production Keystore (TODO)

#### 1. Generate Release Keystore
```bash
keytool -genkey -v -keystore ai-chat-release.keystore \
  -alias ai-chat-key \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

#### 2. Configure Signing in Gradle
Create `/apps/android/keystore.properties` (DO NOT COMMIT):
```properties
storePassword=your_store_password
keyPassword=your_key_password
keyAlias=ai-chat-key
storeFile=../ai-chat-release.keystore
```

Update `build.gradle.kts`:
```kotlin
// Load keystore properties
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

android {
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["keyPassword"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["storePassword"] as String
        }
    }
    
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

#### 3. Backup Keystore
**CRITICAL**: Back up your release keystore securely:
- Store in password manager
- Keep offline backup
- Document passwords separately
- Never commit to version control

---

## ProGuard/R8 Configuration

### Current Rules
Location: `/apps/android/app/proguard-rules.pro`

```proguard
# Supabase
-keep class io.github.jan.supabase.** { *; }
-keep class io.ktor.** { *; }

# Kotlin Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }

# OkHttp SSE
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# App Models
-keep class com.prototype.aichat.domain.models.** { *; }
-keep class com.prototype.aichat.data.models.** { *; }
```

### Testing Minification
1. Build release variant locally
2. Test all features thoroughly
3. Check for crashes in logcat
4. Verify SSE streaming works

---

## Build Commands

### Debug APK
```bash
cd apps/android

# Dev Debug (default)
./gradlew assembleDevDebug

# Prod Debug
./gradlew assembleProdDebug
```

### Release APK
```bash
# Dev Release (testing)
./gradlew assembleDevRelease

# Production Release
./gradlew assembleProdRelease
```

### Bundle for Play Store
```bash
./gradlew bundleProdRelease
```

### Output Locations
- APKs: `app/build/outputs/apk/[flavor]/[buildType]/`
- Bundles: `app/build/outputs/bundle/[flavor]Release/`

---

## Pre-Release Checklist

### Code Preparation
- [ ] Remove all `TODO` and `FIXME` comments
- [ ] Remove debug logging statements
- [ ] Update version number and code
- [ ] Review ProGuard rules
- [ ] Test release build locally

### Configuration
- [ ] Verify production API URLs
- [ ] Confirm Supabase production keys
- [ ] Check deep link configuration
- [ ] Ensure HTTPS only for production
- [ ] Remove cleartext traffic permission

### Resources
- [ ] App icon updated (all densities)
- [ ] Splash screen configured
- [ ] Remove unused resources
- [ ] Optimize images (WebP format)
- [ ] Review and update strings

### Security
- [ ] No hardcoded secrets
- [ ] API keys in BuildConfig only
- [ ] Sensitive data encrypted
- [ ] Network security config correct
- [ ] Permissions minimized

---

## Release Process

### 1. Version Bump
```bash
# Update version in build.gradle.kts
# Commit with message: "Bump version to 1.0.1"
git add app/build.gradle.kts
git commit -m "Bump version to 1.0.1"
git tag v1.0.1
```

### 2. Build Release
```bash
# Clean build
./gradlew clean

# Build release APK
./gradlew assembleProdRelease

# Or build bundle for Play Store
./gradlew bundleProdRelease
```

### 3. Test Release Build
- [ ] Install on test device
- [ ] Run through QA checklist
- [ ] Verify no debug features accessible
- [ ] Check crash reporting works
- [ ] Test deep links

### 4. Generate Release Notes
```markdown
## Version 1.0.1 (Build 2)
Release Date: YYYY-MM-DD

### New Features
- Feature description

### Improvements
- Improvement description

### Bug Fixes
- Fix description

### Known Issues
- Issue description
```

---

## Google Play Store Deployment

### Initial Setup (One-time)
1. Create Google Play Developer account
2. Pay one-time $25 registration fee
3. Create new app in Play Console
4. Complete store listing

### Store Listing Requirements
- **App Name**: AI Chat
- **Short Description** (80 chars)
- **Full Description** (4000 chars)
- **Category**: Productivity
- **Content Rating**: Complete questionnaire
- **Privacy Policy URL**: Required
- **Contact Email**: Required

### Graphics Assets
- **App Icon**: 512x512 PNG
- **Feature Graphic**: 1024x500 PNG
- **Screenshots**: 
  - Phone: 2-8 images (min 320px, max 3840px)
  - Tablet: Optional (if tablet support)

### Release Tracks
- **Internal Testing**: Limited to team
- **Closed Testing**: Beta testers
- **Open Testing**: Public beta
- **Production**: Full release

### Upload Process
1. Go to Release > Production
2. Create new release
3. Upload AAB file
4. Add release notes
5. Review and roll out

### Post-Release
- Monitor crash reports
- Respond to user reviews
- Track installation metrics
- Plan next release

---

## Troubleshooting

### Common Issues

#### Build Fails with Signing Error
- Verify keystore path is correct
- Check passwords in keystore.properties
- Ensure keystore file exists

#### ProGuard Breaking App
- Add keep rules for affected classes
- Check logcat for ClassNotFoundException
- Test with `-dontobfuscate` temporarily

#### APK Too Large
- Enable resource shrinking
- Convert images to WebP
- Remove unused dependencies
- Use App Bundle instead of APK

#### Deep Links Not Working
- Verify manifest configuration
- Check scheme and host match
- Test with adb: `adb shell am start -W -a android.intent.action.VIEW -d "aichat://auth" com.prototype.aichat`

---

## Rollback Procedure

If issues are discovered post-release:

1. **Immediate**: Halt rollout in Play Console
2. **Assessment**: Determine severity
3. **Fix**: 
   - Hotfix for critical issues
   - Include in next release for minor issues
4. **Test**: Thoroughly test fix
5. **Release**: New version with fix
6. **Communication**: Notify affected users

---

## Appendix

### Useful Commands

```bash
# Check APK contents
aapt dump badging app-prod-release.apk

# Verify APK signature
jarsigner -verify -verbose app-prod-release.apk

# Install APK
adb install app-prod-release.apk

# Get installed version
adb shell dumpsys package com.prototype.aichat | grep version

# Clear app data
adb shell pm clear com.prototype.aichat
```

### Environment Variables
Required in `local.properties`:
```properties
# Development
dev.supabase.url=https://xxx.supabase.co
dev.supabase.anonKey=xxx
dev.api.baseUrl=http://10.0.2.2:3000
dev.app.deeplink.scheme=aichat-dev
dev.app.deeplink.host=auth

# Production
prod.supabase.url=https://xxx.supabase.co
prod.supabase.anonKey=xxx
prod.api.baseUrl=https://api.example.com
prod.app.deeplink.scheme=aichat
prod.app.deeplink.host=auth
```

---

## Release History

| Version | Code | Date | Notes |
|---------|------|------|-------|
| 1.0.0 | 1 | TBD | Initial release |
| | | | |

---

## Contacts

- **Development Team**: dev@example.com
- **QA Team**: qa@example.com
- **Product Owner**: product@example.com
- **Support**: support@example.com