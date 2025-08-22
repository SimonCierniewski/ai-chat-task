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
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.viewmodel.compose.viewModel
import com.prototype.aichat.viewmodel.ChatViewModel
import com.prototype.aichat.viewmodel.SessionsViewModel

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
    
    // ViewModels shared across tabs
    val chatViewModel: ChatViewModel = viewModel()
    val sessionsViewModel: SessionsViewModel = viewModel()
    
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
                            if (currentDestination?.route == "history") {
                                Icons.Filled.History
                            } else {
                                Icons.Outlined.History
                            },
                            contentDescription = "History"
                        )
                    },
                    label = { Text("History") },
                    selected = currentDestination?.route == "history",
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
                        onLogout = onLogout
                    )
                }
                
                // Chat with existing session
                composable("chat/{sessionId}") { backStackEntry ->
                    val sessionId = backStackEntry.arguments?.getString("sessionId")
                    ChatScreenContent(
                        sessionId = sessionId,
                        chatViewModel = chatViewModel,
                        onNavigateToDiagnostics = onNavigateToDiagnostics,
                        onLogout = onLogout
                    )
                }
                
                // History tab - shows list of sessions
                composable("history") {
                    SessionsListScreen(
                        sessionsViewModel = sessionsViewModel,
                        onSessionClick = { session ->
                            // Navigate to chat with the selected session
                            navController.navigate("chat/${session.id}")
                        }
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