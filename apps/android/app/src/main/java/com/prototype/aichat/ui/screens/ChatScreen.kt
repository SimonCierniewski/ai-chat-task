package com.prototype.aichat.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.prototype.aichat.BuildConfig
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.StreamingState
import com.prototype.aichat.ui.components.MessageBubbleWithUsage
import com.prototype.aichat.ui.components.StreamingIndicator
import com.prototype.aichat.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

/**
 * Main chat screen with SSE streaming support
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    sessionId: String? = null,
    onNavigateToSessions: () -> Unit,
    onNavigateToSession: () -> Unit,
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit,
    chatViewModel: ChatViewModel = viewModel()
) {
    val uiState by chatViewModel.uiState.collectAsState()
    val messages by chatViewModel.messages.collectAsState()
    val streamingState by chatViewModel.streamingState.collectAsState()
    
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current
    
    // Auto-scroll behavior
    var userScrolled by remember { mutableStateOf(false) }
    
    // Detect user scroll
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            userScrolled = true
        }
    }
    
    // Auto-scroll on new messages if user hasn't scrolled up
    LaunchedEffect(messages.size) {
        if (!userScrolled && messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }
    
    // Reset auto-scroll when at bottom
    LaunchedEffect(listState.canScrollForward) {
        if (!listState.canScrollForward) {
            userScrolled = false
        }
    }
    
    Scaffold(
        topBar = {
            ChatTopBar(
                useMemory = uiState.useMemory,
                selectedModel = uiState.selectedModel,
                availableModels = uiState.availableModels,
                onToggleMemory = { chatViewModel.toggleMemory() },
                onSelectModel = { chatViewModel.selectModel(it) },
                onNavigateToSession = onNavigateToSession,
                onNavigateToDiagnostics = onNavigateToDiagnostics,
                onLogout = onLogout
            )
        },
        bottomBar = {
            ChatInputBar(
                messageText = uiState.currentInput,
                onMessageChange = { chatViewModel.updateInput(it) },
                onSendMessage = {
                    keyboardController?.hide()
                    chatViewModel.sendMessage(uiState.currentInput)
                    userScrolled = false // Reset to auto-scroll
                },
                isStreaming = uiState.isStreaming,
                onCancelStreaming = { chatViewModel.cancelStreaming() }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            MessageList(
                messages = messages,
                listState = listState,
                isStreaming = streamingState is StreamingState.Streaming
            )
            
            // Error snackbar
            uiState.error?.let { error ->
                ErrorSnackbar(
                    error = error,
                    onDismiss = { chatViewModel.clearError() },
                    onRetry = if (uiState.lastRequest != null) {
                        { chatViewModel.retryLastMessage() }
                    } else null
                )
            }
            
            // Scroll to bottom FAB when scrolled up
            AnimatedVisibility(
                visible = userScrolled && listState.canScrollForward,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            ) {
                ScrollToBottomFab(
                    onClick = {
                        scope.launch {
                            listState.animateScrollToItem(messages.size - 1)
                            userScrolled = false
                        }
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatTopBar(
    useMemory: Boolean,
    selectedModel: String,
    availableModels: List<String>,
    onToggleMemory: () -> Unit,
    onSelectModel: (String) -> Unit,
    onNavigateToSession: () -> Unit,
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit
) {
    var showModelMenu by remember { mutableStateOf(false) }
    
    TopAppBar(
        title = { Text("AI Chat") },
        actions = {
            // Memory toggle
            IconButton(
                onClick = onToggleMemory,
                modifier = Modifier.semantics {
                    contentDescription = if (useMemory) "Memory enabled" else "Memory disabled"
                }
            ) {
                Icon(
                    imageVector = if (useMemory) Icons.Default.Memory else Icons.Outlined.Memory,
                    contentDescription = null,
                    tint = if (useMemory) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Model selector
            Box {
                TextButton(
                    onClick = { showModelMenu = true },
                    modifier = Modifier.semantics {
                        contentDescription = "Select model: $selectedModel"
                    }
                ) {
                    Text(selectedModel.substringAfterLast("-"))
                    Icon(
                        Icons.Default.ArrowDropDown,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                }
                
                DropdownMenu(
                    expanded = showModelMenu,
                    onDismissRequest = { showModelMenu = false }
                ) {
                    availableModels.forEach { model ->
                        DropdownMenuItem(
                            text = { Text(model) },
                            onClick = {
                                onSelectModel(model)
                                showModelMenu = false
                            },
                            leadingIcon = if (model == selectedModel) {
                                { Icon(Icons.Default.Check, contentDescription = null) }
                            } else null
                        )
                    }
                }
            }
            
            // Session history
            IconButton(
                onClick = onNavigateToSession,
                modifier = Modifier.semantics {
                    contentDescription = "View session history"
                }
            ) {
                Icon(Icons.Default.History, contentDescription = null)
            }
            
            // More options menu
            var showOptionsMenu by remember { mutableStateOf(false) }
            
            Box {
                IconButton(
                    onClick = { showOptionsMenu = true },
                    modifier = Modifier.semantics {
                        contentDescription = "More options"
                    }
                ) {
                    Icon(Icons.Default.MoreVert, contentDescription = null)
                }
                
                DropdownMenu(
                    expanded = showOptionsMenu,
                    onDismissRequest = { showOptionsMenu = false }
                ) {
                    // Diagnostics (Dev only)
                    if (BuildConfig.DEBUG) {
                        DropdownMenuItem(
                            text = { 
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        Icons.Default.BugReport,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                    Text("Diagnostics (Dev)")
                                }
                            },
                            onClick = {
                                showOptionsMenu = false
                                onNavigateToDiagnostics()
                            }
                        )
                        
                        HorizontalDivider()
                    }
                    
                    // Logout
                    DropdownMenuItem(
                        text = { 
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Logout, contentDescription = null)
                                Text("Sign Out")
                            }
                        },
                        onClick = {
                            showOptionsMenu = false
                            onLogout()
                        }
                    )
                }
            }
        }
    )
}

@Composable
fun MessageList(
    messages: List<ChatMessage>,
    listState: LazyListState,
    isStreaming: Boolean
) {
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(
            items = messages,
            key = { it.id }
        ) { message ->
            MessageBubbleWithUsage(message = message)
        }
        
        // Streaming indicator
        if (isStreaming && messages.lastOrNull()?.content?.isEmpty() == true) {
            item {
                StreamingIndicator()
            }
        }
    }
}

@Composable
fun ChatInputBar(
    messageText: String,
    onMessageChange: (String) -> Unit,
    onSendMessage: () -> Unit,
    isStreaming: Boolean,
    onCancelStreaming: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shadowElevation = 8.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = messageText,
                onValueChange = onMessageChange,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Message input field" },
                placeholder = { Text("Type a message...") },
                maxLines = 3,
                enabled = !isStreaming,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(
                    onSend = { if (messageText.isNotBlank()) onSendMessage() }
                )
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            if (isStreaming) {
                // Cancel button during streaming
                FilledTonalIconButton(
                    onClick = onCancelStreaming,
                    modifier = Modifier.semantics {
                        contentDescription = "Cancel streaming"
                    }
                ) {
                    Icon(Icons.Default.Stop, contentDescription = null)
                }
            } else {
                // Send button
                FilledIconButton(
                    onClick = onSendMessage,
                    enabled = messageText.isNotBlank(),
                    modifier = Modifier.semantics {
                        contentDescription = "Send message"
                    }
                ) {
                    Icon(Icons.Default.Send, contentDescription = null)
                }
            }
        }
    }
}

@Composable
fun ScrollToBottomFab(onClick: () -> Unit) {
    SmallFloatingActionButton(
        onClick = onClick,
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        modifier = Modifier.semantics {
            contentDescription = "Scroll to bottom"
        }
    ) {
        Icon(
            Icons.Default.KeyboardArrowDown,
            contentDescription = null
        )
    }
}

@Composable
fun ErrorSnackbar(
    error: String,
    onDismiss: () -> Unit,
    onRetry: (() -> Unit)?
) {
    Snackbar(
        modifier = Modifier.padding(16.dp),
        action = {
            Row {
                if (onRetry != null) {
                    TextButton(onClick = onRetry) {
                        Text("Retry")
                    }
                }
                TextButton(onClick = onDismiss) {
                    Text("Dismiss")
                }
            }
        }
    ) {
        Text(error)
    }
}
