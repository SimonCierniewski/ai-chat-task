package com.prototype.aichat.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.MessageRole
import com.prototype.aichat.domain.models.StreamingState
import kotlinx.coroutines.launch

/**
 * Main chat screen with SSE streaming support
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onNavigateToSession: () -> Unit,
    onLogout: () -> Unit
) {
    var messageText by remember { mutableStateOf("") }
    var useMemory by remember { mutableStateOf(true) }
    var messages by remember { mutableStateOf(listOf<ChatMessage>()) }
    var streamingState by remember { mutableStateOf<StreamingState>(StreamingState.Idle) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI Chat") },
                actions = {
                    IconButton(onClick = { useMemory = !useMemory }) {
                        Icon(
                            imageVector = if (useMemory) Icons.Default.Memory else Icons.Default.MemoryOutlined,
                            contentDescription = "Toggle Memory",
                            tint = if (useMemory) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }
                    IconButton(onClick = onNavigateToSession) {
                        Icon(Icons.Default.History, contentDescription = "Sessions")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout")
                    }
                }
            )
        },
        bottomBar = {
            ChatInputBar(
                messageText = messageText,
                onMessageChange = { messageText = it },
                onSendMessage = {
                    if (messageText.isNotBlank() && streamingState is StreamingState.Idle) {
                        // Add user message
                        messages = messages + ChatMessage(
                            content = messageText,
                            role = MessageRole.USER,
                            sessionId = "current"
                        )
                        
                        // TODO: Send message via ViewModel
                        messageText = ""
                        
                        // Scroll to bottom
                        scope.launch {
                            listState.animateScrollToItem(messages.size - 1)
                        }
                    }
                },
                isStreaming = streamingState !is StreamingState.Idle,
                useMemory = useMemory
            )
        }
    ) { paddingValues ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(messages) { message ->
                MessageBubble(message = message)
            }
            
            // Show streaming indicator
            if (streamingState is StreamingState.Streaming) {
                item {
                    StreamingIndicator()
                }
            }
        }
    }
}

@Composable
fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == MessageRole.USER
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Card(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .padding(horizontal = 8.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) 
                    MaterialTheme.colorScheme.primaryContainer 
                else 
                    MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyMedium
                )
                
                message.metadata?.let { metadata ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = buildString {
                            metadata.tokensIn?.let { append("↑$it ") }
                            metadata.tokensOut?.let { append("↓$it ") }
                            metadata.costUsd?.let { append("${'$'}%.4f".format(it)) }
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
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
    useMemory: Boolean
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
                modifier = Modifier.weight(1f),
                placeholder = { Text("Type a message...") },
                maxLines = 3,
                enabled = !isStreaming
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            FilledIconButton(
                onClick = onSendMessage,
                enabled = messageText.isNotBlank() && !isStreaming
            ) {
                Icon(
                    imageVector = if (isStreaming) Icons.Default.Stop else Icons.Default.Send,
                    contentDescription = "Send"
                )
            }
        }
    }
}

@Composable
fun StreamingIndicator() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "AI is thinking...",
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}