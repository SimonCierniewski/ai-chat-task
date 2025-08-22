package com.prototype.aichat.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
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
 * Chat screen without navigation controls (for use with bottom navigation)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreenWithoutNav(
    chatViewModel: ChatViewModel,
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
    
    Scaffold(
        topBar = {
            ChatTopBarSimple(
                sessionTitle = uiState.sessionTitle,
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
                ChatScrollToBottomFab(
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

/**
 * Simplified top bar for chat screen (without session navigation)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatTopBarSimple(
    sessionTitle: String,
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit
) {
    var showOptionsMenu by remember { mutableStateOf(false) }
    
    TopAppBar(
        title = { Text(sessionTitle) },
        actions = {
            // More options menu
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
                                Text("Logout")
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

/**
 * Scroll to bottom floating action button for chat
 */
@Composable
private fun ChatScrollToBottomFab(onClick: () -> Unit) {
    SmallFloatingActionButton(
        onClick = onClick,
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer
    ) {
        Icon(
            Icons.Default.KeyboardArrowDown,
            contentDescription = "Scroll to bottom"
        )
    }
}