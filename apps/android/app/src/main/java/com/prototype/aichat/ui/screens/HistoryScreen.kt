package com.prototype.aichat.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.HistoryToggleOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.prototype.aichat.domain.models.ChatSession
import com.prototype.aichat.ui.components.MessageBubbleWithUsage
import com.prototype.aichat.viewmodel.SessionsViewModel

/**
 * History screen showing transcript of a specific session
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    sessionId: String,
    onNavigateBack: () -> Unit,
    onContinueChat: () -> Unit,
    sessionsViewModel: SessionsViewModel = viewModel()
) {
    val messages by sessionsViewModel.currentSessionMessages.collectAsState()
    val currentSession by sessionsViewModel.currentSession.collectAsState()
    val uiState by sessionsViewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    
    // Pull to refresh state
    val pullToRefreshState = rememberPullToRefreshState()
    
    // Load session on first composition
    LaunchedEffect(sessionId) {
        sessionsViewModel.loadSession(sessionId)
    }
    
    // Handle refresh
    if (pullToRefreshState.isRefreshing) {
        LaunchedEffect(true) {
            sessionsViewModel.refreshCurrentSessionMessages()
        }
    }
    
    LaunchedEffect(uiState.isRefreshing) {
        if (!uiState.isRefreshing) {
            pullToRefreshState.endRefresh()
        }
    }
    
    // Auto-scroll to bottom on initial load
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty() && !listState.isScrollInProgress) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = currentSession?.title ?: "Session History",
                            style = MaterialTheme.typography.titleMedium
                        )
                        currentSession?.let { session ->
                            Text(
                                text = "${session.messageCount} messages",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Go back"
                        }
                    ) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    // Continue chat button
                    IconButton(
                        onClick = onContinueChat,
                        modifier = Modifier.semantics {
                            contentDescription = "Continue this chat"
                        }
                    ) {
                        Icon(Icons.Default.Chat, contentDescription = null)
                    }
                    
                    // Refresh button
                    IconButton(
                        onClick = { sessionsViewModel.refreshCurrentSessionMessages() },
                        modifier = Modifier.semantics {
                            contentDescription = "Refresh messages"
                        }
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                    }
                    
                    // Edit title
                    var showEditDialog by remember { mutableStateOf(false) }
                    IconButton(
                        onClick = { showEditDialog = true },
                        modifier = Modifier.semantics {
                            contentDescription = "Edit session title"
                        }
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = null)
                    }
                    
                    if (showEditDialog) {
                        EditTitleDialog(
                            currentTitle = currentSession?.title ?: "",
                            onDismiss = { showEditDialog = false },
                            onSave = { newTitle ->
                                currentSession?.let {
                                    sessionsViewModel.updateSessionTitle(it.id, newTitle)
                                }
                                showEditDialog = false
                            }
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onContinueChat,
                icon = { Icon(Icons.Default.Chat, contentDescription = null) },
                text = { Text("Continue Chat") },
                modifier = Modifier.semantics {
                    contentDescription = "Continue this chat session"
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .nestedScroll(pullToRefreshState.nestedScrollConnection)
        ) {
            when {
                uiState.isLoadingMessages -> {
                    // Loading state
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                
                messages.isEmpty() -> {
                    // Empty state
                    EmptyHistoryState()
                }
                
                else -> {
                    // Messages list
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Session info header
                        item {
                            SessionInfoHeader(
                                session = currentSession,
                                messageCount = messages.size
                            )
                        }
                        
                        // Messages
                        items(
                            items = messages,
                            key = { it.id }
                        ) { message ->
                            MessageBubbleWithUsage(
                                message = message,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                        
                        // Bottom spacing for FAB
                        item {
                            Spacer(modifier = Modifier.height(80.dp))
                        }
                    }
                }
            }
            
            // Pull to refresh indicator
            PullToRefreshContainer(
                state = pullToRefreshState,
                modifier = Modifier.align(Alignment.TopCenter)
            )
            
            // Error snackbar
            uiState.error?.let { error ->
                Snackbar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp),
                    action = {
                        TextButton(onClick = { sessionsViewModel.clearError() }) {
                            Text("Dismiss")
                        }
                    }
                ) {
                    Text(error)
                }
            }
        }
    }
}

@Composable
fun SessionInfoHeader(
    session: ChatSession?,
    messageCount: Int
) {
    if (session == null) return
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.3f)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "Session Information",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                InfoItem(
                    label = "Created",
                    value = formatTimestamp(session.createdAt)
                )
                
                InfoItem(
                    label = "Messages",
                    value = messageCount.toString()
                )
                
                InfoItem(
                    label = "Session ID",
                    value = session.id.take(8) + "..."
                )
            }
        }
    }
}

@Composable
private fun InfoItem(
    label: String,
    value: String
) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
fun EmptyHistoryState() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.HistoryToggleOff,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "No messages in this session",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Start a conversation to see messages here",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            textAlign = TextAlign.Center
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTitleDialog(
    currentTitle: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var title by remember { mutableStateOf(currentTitle) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Session Title") },
        text = {
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(title) },
                enabled = title.isNotBlank()
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

private fun formatTimestamp(timestamp: Long): String {
    val formatter = java.text.SimpleDateFormat("MMM dd, HH:mm", java.util.Locale.getDefault())
    return formatter.format(java.util.Date(timestamp))
}
