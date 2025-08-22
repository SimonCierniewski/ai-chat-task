package com.prototype.aichat.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.viewmodel.compose.viewModel
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.data.repository.SessionsRepository
import com.prototype.aichat.viewmodel.ChatViewModel
import com.prototype.aichat.viewmodel.SessionsViewModel
import kotlinx.coroutines.launch

/**
 * Main screen with bottom navigation containing Chat and History tabs
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    
    // Get current user ID to key ViewModels (ensures fresh state after login)
    val userId = remember { SupabaseAuthClient.getUserId() ?: "anonymous" }
    
    // Separate ViewModels for each tab to maintain independent state
    // Key by user ID to ensure ViewModels are recreated after logout/login
    val chatViewModel: ChatViewModel = viewModel(key = "chat_tab_$userId")
    val historyViewModel: ChatViewModel = viewModel(key = "history_tab_$userId")
    val sessionsViewModel: SessionsViewModel = viewModel(key = "sessions_$userId")
    
    // Enhanced logout handler that clears all cached data
    val handleLogout: () -> Unit = {
        scope.launch {
            try {
                // Clear local cache
                val sessionsRepository = SessionsRepository(context)
                sessionsRepository.clearCache()
            } catch (e: Exception) {
                // Continue even if cache clearing fails
            }
            // Call the original logout handler
            onLogout()
        }
        Unit
    }
    
    Scaffold(
        bottomBar = {
            NavigationBar {
                // Chat tab
                NavigationBarItem(
                    icon = {
                        Icon(
                            if (currentDestination?.route == "chat" || 
                                currentDestination?.route?.startsWith("chat/") == true) {
                                Icons.Filled.Chat
                            } else {
                                Icons.Outlined.Chat
                            },
                            contentDescription = "Chat"
                        )
                    },
                    label = { Text("Chat") },
                    selected = currentDestination?.route == "chat" || 
                              currentDestination?.route?.startsWith("chat/") == true,
                    onClick = {
                        navController.navigate("chat") {
                            popUpTo("chat") { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                )
                
                // History tab
                NavigationBarItem(
                    icon = {
                        Icon(
                            if (currentDestination?.route == "history" || 
                                currentDestination?.route?.startsWith("history/") == true) {
                                Icons.Filled.History
                            } else {
                                Icons.Outlined.History
                            },
                            contentDescription = "History"
                        )
                    },
                    label = { Text("History") },
                    selected = currentDestination?.route == "history" || 
                              currentDestination?.route?.startsWith("history/") == true,
                    onClick = {
                        navController.navigate("history") {
                            popUpTo("chat")
                            launchSingleTop = true
                        }
                    }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            NavHost(
                navController = navController,
                startDestination = "chat"
            ) {
                // Chat tab - new session
                composable("chat") {
                    ChatScreenContent(
                        sessionId = null, // New session
                        chatViewModel = chatViewModel,
                        onNavigateToDiagnostics = onNavigateToDiagnostics,
                        onLogout = handleLogout
                    )
                }
                
                // Chat with existing session
                composable("chat/{sessionId}") { backStackEntry ->
                    val sessionId = backStackEntry.arguments?.getString("sessionId")
                    ChatScreenContent(
                        sessionId = sessionId,
                        chatViewModel = chatViewModel,
                        onNavigateToDiagnostics = onNavigateToDiagnostics,
                        onLogout = handleLogout
                    )
                }
                
                // History tab - shows list of sessions
                composable("history") {
                    // Get the current session ID from the Chat tab's ViewModel
                    val chatUiState by chatViewModel.uiState.collectAsStateWithLifecycle()
                    
                    SessionsListScreen(
                        sessionsViewModel = sessionsViewModel,
                        excludeSessionId = chatUiState.sessionId, // Hide current chat session
                        onSessionClick = { session ->
                            // Navigate to history detail within History tab
                            navController.navigate("history/${session.id}")
                        }
                    )
                }
                
                // History tab - session detail view
                composable("history/{sessionId}") { backStackEntry ->
                    val sessionId = backStackEntry.arguments?.getString("sessionId")
                    HistoryDetailScreen(
                        sessionId = sessionId,
                        chatViewModel = historyViewModel,
                        sessionsViewModel = sessionsViewModel,
                        onNavigateBack = {
                            navController.navigate("history") {
                                popUpTo("history") { inclusive = true }
                            }
                        },
                        onNavigateToDiagnostics = onNavigateToDiagnostics,
                        onLogout = handleLogout
                    )
                }
            }
        }
    }
}

/**
 * Chat screen content that can be reused for both new and existing sessions
 */
@Composable
fun ChatScreenContent(
    sessionId: String?,
    chatViewModel: ChatViewModel,
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit
) {
    // Only handle explicit session loading for history navigation
    LaunchedEffect(sessionId) {
        if (sessionId != null) {
            // Only load if it's a different session
            chatViewModel.loadSession(sessionId)
        } else if (!chatViewModel.hasActiveSession()) {
            // Only start new session if we don't have one already
            chatViewModel.startNewSession()
        }
        // If sessionId is null and we have an active session, do nothing (preserve current chat)
    }
    
    // Use the existing ChatScreen but without navigation controls
    // (those are now handled by bottom navigation)
    ChatScreenWithoutNav(
        chatViewModel = chatViewModel,
        onNavigateToDiagnostics = onNavigateToDiagnostics,
        onLogout = onLogout
    )
}

/**
 * History detail screen showing a session from history
 */
@Composable
fun HistoryDetailScreen(
    sessionId: String?,
    chatViewModel: ChatViewModel,
    sessionsViewModel: SessionsViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToDiagnostics: () -> Unit,
    onLogout: () -> Unit
) {
    // Load the session when entering this screen
    LaunchedEffect(sessionId) {
        if (sessionId != null) {
            chatViewModel.loadSession(sessionId)
        }
    }
    
    // Show the chat interface with a back button
    ChatScreenWithBackButton(
        chatViewModel = chatViewModel,
        onNavigateBack = onNavigateBack,
        onNavigateToDiagnostics = onNavigateToDiagnostics,
        onLogout = onLogout
    )
}