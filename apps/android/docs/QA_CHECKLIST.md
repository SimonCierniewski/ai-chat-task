# Android App QA Checklist

## Overview
This document provides a comprehensive QA checklist for testing the Android app across different scenarios and edge cases. All tests should be performed on both debug and release builds where applicable.

## Test Environment Setup

### Prerequisites
- [ ] Android device or emulator (API 24+)
- [ ] Active internet connection
- [ ] Supabase project configured
- [ ] API server running
- [ ] Valid test accounts (user and admin)

### Build Variants to Test
- [ ] devDebug - Development environment, debug build
- [ ] devRelease - Development environment, release build
- [ ] prodDebug - Production environment, debug build
- [ ] prodRelease - Production environment, release build

---

## 1. Authentication Flow

### 1.1 Magic Link Login
- [ ] **Initial Login**
  - [ ] App shows login screen on first launch
  - [ ] Email input validates format
  - [ ] "Send Magic Link" button is disabled for invalid emails
  - [ ] Loading state appears after sending link
  - [ ] "Check your email" message displays after sending

- [ ] **Deep Link Handling**
  - [ ] Magic link opens app from email client
  - [ ] App handles `aichat://auth` (prod) and `aichat-dev://auth` (dev) schemes
  - [ ] Session is stored after successful authentication
  - [ ] User is redirected to chat screen after login
  - [ ] Invalid/expired tokens show appropriate error

### 1.2 Session Persistence
- [ ] **Session Recovery**
  - [ ] App remembers user after force close
  - [ ] Session survives app updates
  - [ ] Expired sessions redirect to login
  - [ ] Manual logout clears session completely

### 1.3 Error Cases
- [ ] **Network Errors**
  - [ ] No internet connection shows offline message
  - [ ] Server timeout shows appropriate error
  - [ ] Invalid Supabase URL shows configuration error

---

## 2. SSE Streaming & Chat

### 2.1 Streaming Performance
- [ ] **TTFT (Time To First Token)**
  - [ ] First token appears within 350ms (target)
  - [ ] Streaming indicator shows immediately
  - [ ] Tokens appear continuously without batching
  - [ ] No UI freezing during streaming

### 2.2 Chat Functionality
- [ ] **Message Sending**
  - [ ] Send button disabled when input is empty
  - [ ] Input clears after sending
  - [ ] Message appears immediately in chat
  - [ ] Timestamp shows on messages

- [ ] **Streaming Response**
  - [ ] Assistant response streams character by character
  - [ ] Cursor animation during streaming
  - [ ] Usage panel shows after completion (tokens, cost, TTFT)
  - [ ] Model name displays correctly

### 2.3 Memory Toggle
- [ ] **Memory On**
  - [ ] Toggle switch reflects state
  - [ ] Context from previous messages is used
  - [ ] Memory indicator shows in UI

- [ ] **Memory Off**
  - [ ] Toggle switch reflects state
  - [ ] Each message is independent
  - [ ] No context carried between messages

### 2.4 Model Selection
- [ ] **Model Dropdown**
  - [ ] Available models load from API
  - [ ] Selected model persists between messages
  - [ ] Model change affects next message
  - [ ] Default model is pre-selected

### 2.5 Cancellation
- [ ] **Cancel Streaming**
  - [ ] Cancel button appears during streaming
  - [ ] Streaming stops immediately on cancel
  - [ ] Partial message is preserved
  - [ ] Can send new message after cancellation

---

## 3. Error Handling

### 3.1 HTTP Status Codes
- [ ] **401 Unauthorized**
  - [ ] User redirected to login screen
  - [ ] Session cleared
  - [ ] Appropriate error message shown

- [ ] **429 Rate Limited**
  - [ ] Rate limit message displayed
  - [ ] Retry after specified time
  - [ ] No app crash

- [ ] **5xx Server Errors**
  - [ ] User-friendly error message
  - [ ] Retry option available
  - [ ] App remains stable

### 3.2 Network Issues
- [ ] **Offline Mode**
  - [ ] Airplane mode shows offline indicator
  - [ ] Cached data still viewable
  - [ ] Messages queued for retry
  - [ ] Reconnection automatic when online

- [ ] **Connection Timeout**
  - [ ] Timeout message after reasonable wait
  - [ ] Manual retry option
  - [ ] Previous messages preserved

### 3.3 SSE Connection
- [ ] **Connection Drop**
  - [ ] Automatic reconnection attempt
  - [ ] User notified of connection issues
  - [ ] Partial messages handled gracefully

- [ ] **Heartbeat Timeout**
  - [ ] Connection considered dead after 30s without heartbeat
  - [ ] Automatic reconnection triggered
  - [ ] User can manually retry

---

## 4. History & Sessions

### 4.1 Session List
- [ ] **Loading Sessions**
  - [ ] Pull-to-refresh works
  - [ ] Loading indicator shows
  - [ ] Empty state for no sessions
  - [ ] Sessions sorted by date

### 4.2 Session Details
- [ ] **Viewing History**
  - [ ] Full transcript loads
  - [ ] Messages display with roles
  - [ ] Usage metadata visible
  - [ ] Can continue conversation

### 4.3 Session Management
- [ ] **Creating Sessions**
  - [ ] New session on first message
  - [ ] Session ID generated correctly
  - [ ] Session persists to database

- [ ] **Editing Sessions**
  - [ ] Can edit session title
  - [ ] Changes persist
  - [ ] UI updates immediately

---

## 5. UI/UX

### 5.1 Responsive Design
- [ ] **Different Screen Sizes**
  - [ ] Phone portrait mode
  - [ ] Phone landscape mode
  - [ ] Tablet support
  - [ ] Foldable device support

### 5.2 Accessibility
- [ ] **Screen Readers**
  - [ ] All buttons have content descriptions
  - [ ] Navigation is logical
  - [ ] Important state changes announced

- [ ] **Keyboard Navigation**
  - [ ] Tab order is logical
  - [ ] Enter key sends messages
  - [ ] Escape key closes dialogs

### 5.3 Performance
- [ ] **Scrolling**
  - [ ] Smooth scrolling in message list
  - [ ] Auto-scroll to bottom for new messages
  - [ ] Scroll-to-bottom FAB when scrolled up
  - [ ] No jank with many messages

- [ ] **Memory Usage**
  - [ ] No memory leaks after extended use
  - [ ] Old messages properly garbage collected
  - [ ] Images and resources released

---

## 6. Diagnostics Screen (Dev Only)

### 6.1 Access Control
- [ ] **Visibility**
  - [ ] Only visible in debug builds
  - [ ] Not accessible in release builds
  - [ ] Menu option in overflow menu

### 6.2 Information Display
- [ ] **Build Information**
  - [ ] Build variant shown correctly
  - [ ] Version name and code accurate
  - [ ] Application ID displayed
  - [ ] Debug flag status

- [ ] **Configuration**
  - [ ] API URL displayed (no secrets)
  - [ ] Supabase URL shown
  - [ ] Deep link scheme visible

- [ ] **Session Info**
  - [ ] User ID displayed
  - [ ] Email shown
  - [ ] Token expiry time

- [ ] **Performance Metrics**
  - [ ] Last TTFT value
  - [ ] Last SSE status
  - [ ] Memory usage
  - [ ] Active connections

### 6.3 Log Management
- [ ] **Log Display**
  - [ ] Recent logs shown (sanitized)
  - [ ] No secrets in logs
  - [ ] Scrollable log view

- [ ] **Log Actions**
  - [ ] Copy logs to clipboard
  - [ ] Clear logs button works
  - [ ] Refresh metrics updates display

---

## 7. Edge Cases

### 7.1 State Restoration
- [ ] **Process Death**
  - [ ] App restores after system kills it
  - [ ] Current conversation preserved
  - [ ] Navigation state maintained

### 7.2 Configuration Changes
- [ ] **Screen Rotation**
  - [ ] State preserved on rotation
  - [ ] Streaming continues uninterrupted
  - [ ] Input text retained

### 7.3 Background/Foreground
- [ ] **App Switching**
  - [ ] SSE connection handled properly
  - [ ] Messages continue streaming
  - [ ] Notifications for completed messages (if implemented)

---

## 8. Security

### 8.1 Data Protection
- [ ] **Sensitive Information**
  - [ ] Tokens not visible in UI
  - [ ] No secrets in logs
  - [ ] Clipboard cleared after timeout

### 8.2 Network Security
- [ ] **HTTPS Only (Production)**
  - [ ] All API calls use HTTPS
  - [ ] Certificate pinning (if implemented)
  - [ ] No cleartext traffic in prod

---

## 9. Release Readiness

### 9.1 Build Configuration
- [ ] **ProGuard/R8**
  - [ ] Release build minified correctly
  - [ ] No crashes from obfuscation
  - [ ] Critical classes kept

### 9.2 Performance
- [ ] **App Size**
  - [ ] APK size reasonable (<50MB)
  - [ ] No unnecessary resources
  - [ ] Images optimized

### 9.3 Store Compliance
- [ ] **Permissions**
  - [ ] Only necessary permissions requested
  - [ ] Internet permission declared
  - [ ] No unused permissions

---

## Test Execution Log

| Date | Tester | Build | Version | Pass/Fail | Notes |
|------|--------|-------|---------|-----------|-------|
| | | | | | |
| | | | | | |
| | | | | | |

## Known Issues

Document any known issues discovered during testing:

1. **Issue**: [Description]
   - **Severity**: Critical/Major/Minor
   - **Steps to Reproduce**: 
   - **Expected**: 
   - **Actual**: 
   - **Workaround**: 

---

## Sign-off

- [ ] All critical tests passed
- [ ] No blocking issues
- [ ] Performance acceptable
- [ ] Ready for release

**QA Lead**: _____________________ Date: _________

**Dev Lead**: _____________________ Date: _________

**Product Owner**: _____________________ Date: _________