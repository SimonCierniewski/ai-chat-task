package com.prototype.aichat.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.prototype.aichat.BuildConfig
import com.prototype.aichat.domain.models.StreamingState
import com.prototype.aichat.ui.components.*
import com.prototype.aichat.viewmodel.ChatViewModel
import kotlinx.coroutines.launch

/**
 * Chat screen with a back button for viewing history sessions
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreenWithBackButton(
    chatViewModel: ChatViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit
) {
    val uiState by chatViewModel.uiState.collectAsStateWithLifecycle()
    val messages by chatViewModel.messages.collectAsStateWithLifecycle()
    val streamingState by chatViewModel.streamingState.collectAsStateWithLifecycle()
    
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current
    
    // Track if user has scrolled up
    var userScrolled by remember { mutableStateOf(false) }
    
    // Auto-scroll to bottom when new messages arrive (unless user has scrolled)
    LaunchedEffect(messages.size) {
        if (!userScrolled && messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }
    
    // Detect user scroll
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            userScrolled = true
        }
    }
    
    var showMenu by remember { mutableStateOf(false) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Column {
                        Text(
                            text = uiState.sessionTitle ?: "Session History",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "${messages.size} messages",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Go back to sessions list"
                        }
                    ) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    // Menu button
                    Box {
                        IconButton(
                            onClick = { showMenu = true },
                            modifier = Modifier.semantics {
                                contentDescription = "More options"
                            }
                        ) {
                            Icon(Icons.Default.MoreVert, contentDescription = null)
                        }
                        
                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { showMenu = false }
                        ) {
                            if (BuildConfig.DEBUG) {
                                DropdownMenuItem(
                                    text = { Text("Diagnostics") },
                                    onClick = {
                                        showMenu = false
                                        onNavigateToDiagnostics()
                                    },
                                    leadingIcon = {
                                        Icon(Icons.Default.BugReport, contentDescription = null)
                                    }
                                )
                            }
                            
                            DropdownMenuItem(
                                text = { Text("Sign Out") },
                                onClick = {
                                    showMenu = false
                                    onLogout()
                                },
                                leadingIcon = {
                                    Icon(Icons.Default.Logout, contentDescription = null)
                                }
                            )
                        }
                    }
                }
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
            // Show loading indicator when no messages and not initialized
            if (messages.isEmpty() && !uiState.isInitialized) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Loading session...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                MessageList(
                    messages = messages,
                    listState = listState,
                    isStreaming = streamingState is StreamingState.Streaming
                )
            }
            
            // Error snackbar
            uiState.error?.let { error ->
                Box(
                    modifier = Modifier.align(Alignment.BottomCenter)
                ) {
                    ErrorSnackbar(
                        error = error,
                        onDismiss = { chatViewModel.clearError() },
                        onRetry = if (uiState.lastRequest != null) {
                            { chatViewModel.retryLastMessage() }
                        } else null
                    )
                }
            }
            
            // Scroll to bottom FAB
            AnimatedVisibility(
                visible = userScrolled,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(16.dp)
            ) {
                SmallFloatingActionButton(
                    onClick = {
                        scope.launch {
                            listState.animateScrollToItem(messages.size - 1)
                            userScrolled = false
                        }
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Scroll to bottom"
                    }
                ) {
                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
                }
            }
        }
    }
}