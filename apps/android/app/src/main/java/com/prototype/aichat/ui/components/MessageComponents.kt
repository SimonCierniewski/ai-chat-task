package com.prototype.aichat.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.MessageMetadata
import com.prototype.aichat.domain.models.MessageRole
import java.text.SimpleDateFormat
import java.util.*

/**
 * Message bubble with usage panel for completed assistant messages
 */
@Composable
fun MessageBubbleWithUsage(
    message: ChatMessage,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth()
    ) {
        // Message bubble
        MessageBubble(message = message)
        
        // Usage panel for assistant messages with metadata
        if (message.role == MessageRole.ASSISTANT && message.metadata != null) {
            Spacer(modifier = Modifier.height(4.dp))
            UsagePanel(
                metadata = message.metadata!!,
                modifier = Modifier.padding(start = 8.dp)
            )
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
 * Usage panel showing tokens, cost, and performance metrics
 */
@OptIn(ExperimentalAnimationApi::class)
@Composable
fun UsagePanel(
    metadata: MessageMetadata,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = true,
        enter = fadeIn() + expandVertically(),
        modifier = modifier
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
            ),
            shape = RoundedCornerShape(8.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                // Tokens In
                metadata.tokensIn?.let { tokens ->
                    UsageMetric(
                        icon = Icons.Default.Input,
                        label = "In",
                        value = tokens.toString(),
                        contentDescription = "$tokens input tokens"
                    )
                }
                
                // Tokens Out
                metadata.tokensOut?.let { tokens ->
                    UsageMetric(
                        icon = Icons.Default.Output,
                        label = "Out",
                        value = tokens.toString(),
                        contentDescription = "$tokens output tokens"
                    )
                }
                
                // Cost
                metadata.costUsd?.let { cost ->
                    UsageMetric(
                        icon = Icons.Default.AttachMoney,
                        label = "Cost",
                        value = String.format("%.4f", cost),
                        contentDescription = String.format("Cost: $%.4f", cost)
                    )
                }
                
                // TTFT
                metadata.ttftMs?.let { ttft ->
                    UsageMetric(
                        icon = Icons.Default.Speed,
                        label = "TTFT",
                        value = "${ttft}ms",
                        contentDescription = "Time to first token: ${ttft} milliseconds"
                    )
                }
                
                // Model
                metadata.model?.let { model ->
                    UsageMetric(
                        icon = Icons.Default.Memory,
                        label = "Model",
                        value = model.substringAfterLast("-"),
                        contentDescription = "Model: $model"
                    )
                }
            }
        }
    }
}

/**
 * Single usage metric display
 */
@Composable
private fun UsageMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    contentDescription: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(horizontal = 4.dp)
            .semantics { this.contentDescription = contentDescription }
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
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