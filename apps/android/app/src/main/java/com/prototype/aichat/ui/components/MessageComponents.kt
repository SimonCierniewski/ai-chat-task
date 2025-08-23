package com.prototype.aichat.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.MessageRole
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Message bubble wrapper (simplified without usage panel)
 */
@Composable
fun MessageBubbleWithUsage(
    message: ChatMessage,
    modifier: Modifier = Modifier
) {
    // Just render the message bubble without usage info
    MessageBubble(
        message = message,
        modifier = modifier
    )
}

/**
 * Message bubble with streaming indicator
 */
@Composable
fun MessageBubbleWithStreaming(
    message: ChatMessage,
    isStreaming: Boolean,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        MessageBubble(
            message = message
        )
        // Show streaming cursor if this message is being streamed
        if (isStreaming && message.role == MessageRole.ASSISTANT) {
            StreamingCursor()
        }
    }
}

/**
 * Single message bubble
 */
@Composable
fun MessageBubble(
    message: ChatMessage,
    modifier: Modifier = Modifier
) {
    val isUser = message.role == MessageRole.USER
    val isError = message.role == MessageRole.SYSTEM
    
    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = when (message.role) {
                    MessageRole.USER -> "Your message: ${message.content}"
                    MessageRole.ASSISTANT -> "AI response: ${message.content}"
                    MessageRole.SYSTEM -> "System message: ${message.content}"
                }
            },
        horizontalArrangement = when {
            isUser -> Arrangement.End
            isError -> Arrangement.Center
            else -> Arrangement.Start
        }
    ) {
        Card(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .padding(horizontal = if (isError) 0.dp else 8.dp),
            shape = RoundedCornerShape(
                topStart = 12.dp,
                topEnd = 12.dp,
                bottomStart = if (isUser) 12.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 12.dp
            ),
            colors = CardDefaults.cardColors(
                containerColor = when {
                    isError -> MaterialTheme.colorScheme.errorContainer
                    isUser -> MaterialTheme.colorScheme.primaryContainer
                    else -> MaterialTheme.colorScheme.surfaceVariant
                }
            )
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                // Message content
                if (message.content.isNotEmpty()) {
                    SelectionContainer {
                        Text(
                            text = message.content,
                            style = MaterialTheme.typography.bodyMedium,
                            color = when {
                                isError -> MaterialTheme.colorScheme.onErrorContainer
                                isUser -> MaterialTheme.colorScheme.onPrimaryContainer
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            }
                        )
                    }
                }
                
                // Timestamp
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = formatTimestamp(message.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = when {
                        isError -> MaterialTheme.colorScheme.onErrorContainer
                        isUser -> MaterialTheme.colorScheme.onPrimaryContainer
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }.copy(alpha = 0.7f),
                    modifier = Modifier.align(Alignment.End)
                )
            }
        }
    }
}


/**
 * Simple streaming cursor (blinking underscore)
 */
@Composable
fun StreamingCursor(
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition()
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(500),
            repeatMode = RepeatMode.Reverse
        )
    )
    
    Text(
        text = "▌",
        modifier = modifier
            .alpha(alpha)
            .padding(start = 2.dp),
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.primary
    )
}

/**
 * Streaming indicator with animated dots
 */
@Composable
fun StreamingIndicator(
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition()
    
    val dot1Alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse
        )
    )
    
    val dot2Alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, delayMillis = 200),
            repeatMode = RepeatMode.Reverse
        )
    )
    
    val dot3Alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, delayMillis = 400),
            repeatMode = RepeatMode.Reverse
        )
    )
    
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
        shape = RoundedCornerShape(
            topStart = 12.dp,
            topEnd = 12.dp,
            bottomStart = 4.dp,
            bottomEnd = 12.dp
        )
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .semantics { contentDescription = "AI is thinking" },
            horizontalArrangement = Arrangement.Start,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "AI is thinking",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            Row {
                Dot(alpha = dot1Alpha)
                Dot(alpha = dot2Alpha)
                Dot(alpha = dot3Alpha)
            }
        }
    }
}

@Composable
private fun Dot(alpha: Float) {
    Text(
        text = "•",
        style = MaterialTheme.typography.headlineSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.alpha(alpha)
    )
}

/**
 * Streaming text renderer with cursor effect
 */
@Composable
fun StreamingText(
    text: String,
    isStreaming: Boolean,
    modifier: Modifier = Modifier
) {
    val cursorVisible by rememberUpdatedState(isStreaming)
    val cursorAlpha by animateFloatAsState(
        targetValue = if (cursorVisible) 1f else 0f,
        animationSpec = if (cursorVisible) {
            infiniteRepeatable(
                animation = tween(500),
                repeatMode = RepeatMode.Reverse
            )
        } else {
            tween(0)
        }
    )
    
    Row(modifier = modifier) {
        SelectionContainer {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyMedium
            )
        }
        
        if (isStreaming) {
            Text(
                text = "▊",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.alpha(cursorAlpha)
            )
        }
    }
}

/**
 * Format timestamp to readable time
 */
private fun formatTimestamp(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    
    return when {
        diff < 60_000 -> "just now"
        diff < 3_600_000 -> "${diff / 60_000}m ago"
        diff < 86_400_000 -> {
            SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timestamp))
        }
        else -> {
            SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault()).format(Date(timestamp))
        }
    }
}
