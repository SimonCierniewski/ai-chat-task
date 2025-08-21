package com.prototype.aichat.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.prototype.aichat.BuildConfig
import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.viewmodel.DiagnosticsViewModel
import kotlinx.coroutines.launch

/**
 * Diagnostics screen for development builds only
 * Shows build info, configuration, and recent logs
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiagnosticsScreen(
    onNavigateBack: () -> Unit,
    viewModel: DiagnosticsViewModel = viewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val coroutineScope = rememberCoroutineScope()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Diagnostics (Dev Only)") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    titleContentColor = MaterialTheme.colorScheme.onErrorContainer
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Build Information Card
            DiagnosticsCard(
                title = "Build Information",
                content = {
                    DiagnosticItem("Build Variant", BuildConfig.BUILD_TYPE)
                    DiagnosticItem("Flavor", BuildConfig.FLAVOR)
                    DiagnosticItem("Version Name", BuildConfig.VERSION_NAME)
                    DiagnosticItem("Version Code", BuildConfig.VERSION_CODE.toString())
                    DiagnosticItem("Application ID", BuildConfig.APPLICATION_ID)
                    DiagnosticItem("Debug Mode", BuildConfig.DEBUG.toString())
                }
            )
            
            // Configuration Card
            DiagnosticsCard(
                title = "Configuration",
                content = {
                    DiagnosticItem("API Base URL", AppConfig.API_BASE_URL)
                    DiagnosticItem("Supabase URL", AppConfig.SUPABASE_URL)
                    DiagnosticItem("Deep Link Scheme", AppConfig.DEEPLINK_SCHEME)
                    DiagnosticItem("Deep Link Host", AppConfig.DEEPLINK_HOST)
                }
            )
            
            // User Session Card
            DiagnosticsCard(
                title = "User Session",
                content = {
                    DiagnosticItem("User ID", uiState.userId ?: "Not logged in")
                    DiagnosticItem("Email", uiState.userEmail ?: "Not logged in")
                    DiagnosticItem("Session Active", uiState.hasActiveSession.toString())
                    DiagnosticItem("Token Expiry", uiState.tokenExpiry ?: "N/A")
                }
            )
            
            // Performance Metrics Card
            DiagnosticsCard(
                title = "Performance Metrics",
                content = {
                    DiagnosticItem("Last TTFT", uiState.lastTTFT?.let { "${it}ms" } ?: "N/A")
                    DiagnosticItem("Last SSE Status", uiState.lastSSEStatus ?: "No streams yet")
                    DiagnosticItem("Active Connections", uiState.activeConnections.toString())
                    DiagnosticItem("Memory Used", uiState.memoryUsed)
                }
            )
            
            // Recent Logs Card with Copy Button
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Recent Logs",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        
                        IconButton(
                            onClick = {
                                copyLogsToClipboard(context, uiState.recentLogs)
                                Toast.makeText(context, "Logs copied to clipboard", Toast.LENGTH_SHORT).show()
                            }
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = "Copy logs",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.surface,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = uiState.recentLogs.ifEmpty { "No logs available" },
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(8.dp)
                        )
                    }
                }
            }
            
            // Actions Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Actions",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { 
                                coroutineScope.launch {
                                    viewModel.clearLogs()
                                    Toast.makeText(context, "Logs cleared", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Clear Logs")
                        }
                        
                        Button(
                            onClick = { 
                                coroutineScope.launch {
                                    viewModel.refreshMetrics()
                                    Toast.makeText(context, "Metrics refreshed", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Refresh")
                        }
                    }
                    
                    OutlinedButton(
                        onClick = { 
                            coroutineScope.launch {
                                viewModel.testSSEConnection()
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Test SSE Connection")
                    }
                }
            }
            
            // Warning Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Text(
                    text = "⚠️ This screen is only available in development builds and should not be accessible in production.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(16.dp)
                )
            }
        }
    }
}

@Composable
private fun DiagnosticsCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            content()
        }
    }
}

@Composable
private fun DiagnosticItem(
    label: String,
    value: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            fontFamily = FontFamily.Monospace
        )
    }
}

private fun copyLogsToClipboard(context: Context, logs: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText("Diagnostics Logs", logs)
    clipboard.setPrimaryClip(clip)
}