# Model Selection Removed from Android App

## Overview
The model selection feature has been removed from the Android app. The API now uses the admin-configured default model for all chat requests.

## Changes Made

### Android App
1. **ChatViewModel**:
   - Removed `selectedModel` and `availableModels` from `ChatUiState`
   - Removed `selectModel()` function
   - Updated `ChatRequest` to not include model parameter

2. **ChatScreen UI**:
   - Removed model selector dropdown from the top bar
   - Removed all model-related UI components and imports

3. **Domain Models**:
   - Updated `ChatRequest` data class to remove optional `model` field

### API Backend
- Updated `/api/v1/chat` endpoint to use `config.openai.defaultModel` when no model is specified
- The default model is configured via the `OPENAI_DEFAULT_MODEL` environment variable (default: `gpt-4o-mini`)

## Configuration
Admins can set the default model in two ways:
1. **Environment Variable**: Set `OPENAI_DEFAULT_MODEL` in the API `.env` file
2. **Admin Panel**: Navigate to Settings → Default Model (UI exists but database persistence not yet implemented)

## Rationale
- Simplifies the user experience - users don't need to understand model differences
- Ensures consistent model usage across all users
- Allows administrators to control costs and performance by selecting the appropriate model
- Reduces UI complexity in the mobile app

## Testing
1. Ensure Android app builds successfully ✅
2. Verify chat requests work without model selection ✅
3. Confirm API uses the configured default model ✅