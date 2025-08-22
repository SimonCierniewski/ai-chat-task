# Java Setup for Android Build

## Problem
The Android app build is failing because Java 23 is installed, but Android Gradle Plugin requires Java 17 or Java 21.

## Solution

### Option 1: Install Java 17 (Recommended)

```bash
# Install Java 17 using Homebrew
brew install openjdk@17

# Link Java 17
sudo ln -sfn /usr/local/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# Set JAVA_HOME for current session
export JAVA_HOME=/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH

# Verify Java version
java -version
# Should show: openjdk version "17.x.x"
```

### Option 2: Use jenv to manage multiple Java versions

```bash
# Install jenv
brew install jenv

# Add to shell profile (~/.zshrc or ~/.bash_profile)
export PATH="$HOME/.jenv/bin:$PATH"
eval "$(jenv init -)"

# Add Java versions to jenv
jenv add /usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home
jenv add /usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home

# Set Java 17 for this project
cd /Users/simon/Repos/ai-chat-task/apps/android
jenv local 17
```

### Option 3: Use SDKMAN

```bash
# Install SDKMAN
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

# Install Java 17
sdk install java 17.0.9-tem

# Use Java 17
sdk use java 17.0.9-tem
```

## After Installing Java 17

1. **Stop all Gradle daemons**:
   ```bash
   ./gradlew --stop
   ```

2. **Clear Gradle cache** (optional but recommended):
   ```bash
   rm -rf ~/.gradle/caches/
   ```

3. **Build the app**:
   ```bash
   ./gradlew assembleDevDebug
   ```

## Verification

Check that the correct Java version is being used:

```bash
# Check system Java
java -version

# Check Gradle's Java
./gradlew -version | grep JVM
```

Both should show Java 17.

## Alternative: Specify Java Path in gradle.properties

If you have Java 17 installed but Gradle is not finding it, add this to `gradle.properties`:

```properties
org.gradle.java.home=/path/to/java17/home
```

For example:
```properties
org.gradle.java.home=/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
```

## Common Issues

### Issue: "Could not resolve all files for configuration"
**Solution**: This is usually due to Java version mismatch. Ensure Java 17 is being used.

### Issue: "Daemon will expire after the build"
**Solution**: Already fixed in gradle.properties with increased heap size.

### Issue: Build hangs indefinitely
**Solution**: Kill the process, stop daemons (`./gradlew --stop`), and ensure Java 17 is installed.

## System Requirements

- **Java**: 17 (LTS) - Required for Android Gradle Plugin 8.x
- **Android SDK**: API 34
- **Gradle**: 8.10 (included via wrapper)
- **Memory**: At least 8GB RAM recommended

## Why Java 17?

- Android Gradle Plugin 8.x requires Java 17 minimum
- Java 23 is too new and not yet supported by Android build tools
- Java 17 is an LTS (Long Term Support) version
- Best compatibility with Android Studio and command-line builds