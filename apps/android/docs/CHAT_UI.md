# Chat UI Implementation Guide

Complete documentation for the Android chat screen with SSE streaming, auto-scroll, and usage metrics display.

## Architecture Overview

The chat UI is built with a clean separation of concerns:

### Screen Components

1. **ChatScreen** (`ui/screens/ChatScreen.kt`)
   - Main scaffold with top bar and input
   - Manages auto-scroll behavior
   - Handles keyboard and error states

2. **ChatViewModel** (`viewmodel/ChatViewModel.kt`)
   - Manages chat state and messages
   - Handles SSE streaming logic
   - Processes tokens into messages
   - Tracks TTFT and usage metrics

3. **MessageComponents** (`ui/components/MessageComponents.kt`)
   - Reusable message bubbles
   - Usage panel display
   - Streaming indicators
   - Timestamp formatting

## Component Responsibilities

### ChatScreen
- **Responsibilities:**
  - Layout orchestration
  - Auto-scroll management
  - Keyboard control
  - Navigation handling
  - Error snackbar display

### ChatTopBar
- **Responsibilities:**
  - Memory toggle button
  - Model selection dropdown
  - Session history navigation
  - Logout action

### MessageList
- **Responsibilities:**
  - Lazy loading of messages
  - Smooth scrolling
  - Message rendering
  - Streaming indicator placement

### ChatInputBar
- **Responsibilities:**
  - Text input management
  - Send/Cancel button state
  - Keyboard actions
  - Input validation

### MessageBubbleWithUsage
- **Responsibilities:**
  - Message bubble rendering
  - Usage panel attachment
  - Role-based styling
  - Timestamp display

### UsagePanel
- **Responsibilities:**
  - Token counts display
  - Cost calculation
  - TTFT metrics
  - Model information

### StreamingIndicator
- **Responsibilities:**
  - Animated dots
  - "AI is thinking" message
  - Visual feedback during streaming

## UI Features

### Message Bubbles

**User Messages:**
- Right-aligned
- Primary container color
- Rounded corners (sharp on user side)
- Timestamp in bottom-right

**Assistant Messages:**
- Left-aligned
- Surface variant color
- Rounded corners (sharp on AI side)
- Streaming text with cursor effect
- Usage panel below when complete

**System/Error Messages:**
- Center-aligned
- Error container color
- Warning icon prefix
- Full-width card

### Streaming Behavior

1. **Token Arrival:**
   - Tokens append to current message
   - Smooth text rendering
   - No flickering or jumps

2. **Completion:**
   - Usage panel fades in
   - Cursor disappears
   - Final metrics displayed

3. **Cancellation:**
   - Stream stops immediately
   - Partial message preserved
   - Can retry from input

### Auto-Scroll Logic

```kotlin
// User hasn't scrolled: Auto-scroll to bottom
if (!userScrolled && messages.isNotEmpty()) {
    listState.animateScrollToItem(messages.size - 1)
}

// User scrolled up: Show FAB, preserve position
if (userScrolled && listState.canScrollForward) {
    // Show scroll-to-bottom FAB
}

// At bottom: Reset auto-scroll
if (!listState.canScrollForward) {
    userScrolled = false
}
```

### Usage Panel Metrics

| Metric | Icon | Format | Description |
|--------|------|--------|-------------|
| Tokens In | ↓ | Number | Input token count |
| Tokens Out | ↑ | Number | Output token count |
| Cost | $ | $0.0000 | Cost in USD (4 decimals) |
| TTFT | ⚡ | XXXms | Time to first token |
| Model | 🧠 | Name | Model used |

## Accessibility Features

### Content Descriptions

All interactive elements have semantic descriptions:

```kotlin
Modifier.semantics {
    contentDescription = "Memory enabled"
}
```

**Examples:**
- "Send message" button
- "Cancel streaming" button
- "Your message: [content]"
- "AI response: [content]"
- "Select model: gpt-4"
- "Scroll to bottom"

### Keyboard Navigation

- Tab order follows logical flow
- Enter key sends message
- Escape dismisses dropdowns
- Focus management on errors

### Screen Reader Support

- Messages announced with role
- Usage metrics read as structured data
- Streaming state announced
- Error messages prioritized

## Error Handling

### Error Display

Errors appear in two places:

1. **In Chat:** System message bubble
2. **Snackbar:** With retry option

### Error Types

| Error | Message | Action |
|-------|---------|--------|
| 401 | "Session expired. Please login again." | Navigate to login |
| 429 | "Rate limit exceeded. Please wait." | Show retry after delay |
| 5xx | "Server error. Please try again." | Show retry button |
| Network | "Connection error. Please try again." | Show retry button |

### Retry Mechanism

```kotlin
// Retry button in snackbar
onRetry = { 
    chatViewModel.retryLastMessage() 
}
```

## Screenshots for QA

### 1. Initial State
- Empty message list
- Input field ready
- Memory toggle on
- Model selector showing

### 2. Sending Message
- User message appears immediately
- Input clears
- Send button disabled
- Auto-scroll to bottom

### 3. Streaming Response
- "AI is thinking..." indicator
- Animated dots
- Cancel button available
- Text appearing progressively

### 4. Completed Response
- Full assistant message
- Usage panel visible
- Metrics displayed
- Timestamp shown

### 5. Scrolled State
- Messages above fold
- Scroll-to-bottom FAB visible
- Position preserved during streaming
- New message doesn't jump

### 6. Error State
- Error message in chat
- Snackbar with retry
- Input remains enabled
- Previous messages intact

### 7. Model Selection
- Dropdown menu open
- Current model checked
- Other models listed
- Closes on selection

### 8. Memory Toggle
- Icon changes (filled/outlined)
- Color indicates state
- Applies to next message
- Visual feedback immediate

## Performance Considerations

### Lazy Loading

```kotlin
LazyColumn {
    items(
        items = messages,
        key = { it.id }  // Stable keys for recomposition
    )
}
```

### Streaming Optimization

- StringBuilder for token accumulation
- Single recomposition per token batch
- Debounced UI updates
- Cancelled coroutines on navigation

### Memory Management

- Messages limited to session
- Old sessions can be cleared
- Images not stored in memory
- Proper ViewModel lifecycle

## Testing Checklist

### Functional Tests

- [ ] Send message works
- [ ] Streaming displays smoothly
- [ ] Usage panel shows correct data
- [ ] Memory toggle persists
- [ ] Model selection changes
- [ ] Auto-scroll works
- [ ] Manual scroll preserves position
- [ ] Retry after error works
- [ ] Cancel streaming works
- [ ] Logout clears session

### UI/UX Tests

- [ ] Messages align correctly
- [ ] Timestamps format properly
- [ ] Colors match theme
- [ ] Animations smooth
- [ ] Keyboard behavior correct
- [ ] FAB appears when scrolled
- [ ] Error messages clear
- [ ] Loading states visible
- [ ] Empty state handled
- [ ] Landscape orientation works

### Accessibility Tests

- [ ] TalkBack reads messages
- [ ] All buttons labeled
- [ ] Focus order logical
- [ ] Contrast sufficient
- [ ] Touch targets 48dp
- [ ] Keyboard navigation works

### Edge Cases

- [ ] Very long messages wrap
- [ ] Rapid sending queues properly
- [ ] Network loss handled
- [ ] Token timeout recovery
- [ ] Empty responses handled
- [ ] Special characters render
- [ ] RTL text support
- [ ] Dark mode contrast
- [ ] Large text scaling
- [ ] Split-screen mode

## Known Limitations

1. **No Image Support:** Text-only messages currently
2. **No Voice Input:** Keyboard input only
3. **No Message Edit:** Messages are immutable
4. **No Threading:** Linear conversation only
5. **No Offline Queue:** Requires connection to send

## Future Enhancements

1. **Rich Content:**
   - Markdown rendering
   - Code syntax highlighting
   - LaTeX math support
   - Image attachments

2. **Advanced Features:**
   - Message search
   - Export conversation
   - Share responses
   - Voice input/output

3. **Personalization:**
   - Custom themes
   - Font size adjustment
   - Compact/Comfortable modes
   - Notification preferences

## Debug Tools

### Logging

```kotlin
if (AppConfig.IS_DEBUG) {
    Log.d("ChatVM", "TTFT: ${ttft}ms")
    Log.d("ChatVM", "Tokens: $tokenCount")
}
```

### Layout Inspector

- Check message alignment
- Verify padding/margins
- Inspect recomposition count
- Monitor memory usage

### Network Inspector

- SSE connection status
- Token streaming rate
- Error responses
- Retry attempts

## Acceptance Criteria Validation

✅ **Streaming is smooth:** Tokens render without flicker
✅ **Usage displays at end:** Panel appears after completion
✅ **Toggles apply:** Memory and model selection work
✅ **Scrolling behaves well:** Auto-scroll with manual override
✅ **IME behaves well:** Keyboard actions and state management
✅ **Accessibility:** All elements have descriptions
✅ **Error handling:** Graceful failures with retry options