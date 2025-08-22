package com.prototype.aichat.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.prototype.aichat.BuildConfig
import com.prototype.aichat.data.AuthState
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.ui.screens.ChatScreen
import com.prototype.aichat.ui.screens.DiagnosticsScreen
import com.prototype.aichat.ui.screens.HistoryScreen
import com.prototype.aichat.ui.screens.LoginScreen
import com.prototype.aichat.ui.screens.SessionScreen
import com.prototype.aichat.ui.screens.SessionsScreen
import com.prototype.aichat.ui.screens.SplashScreen
import io.github.jan.supabase.gotrue.user.UserSession

/**
 * Main navigation graph for the app
 */
@Composable
fun AppNavigation(
    navController: NavHostController = rememberNavController(),
    startDestination: String = Screen.Splash.route
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Splash.route) {
            SplashScreen(
                onNavigateToLogin = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                },
                onNavigateToChat = {
                    navController.navigate(Screen.Chat.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                }
            )
        }
        
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.Chat.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }
        
        composable(
            route = Screen.Chat.routeWithArgs,
            arguments = listOf(
                navArgument(Screen.Chat.sessionIdArg) {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString(Screen.Chat.sessionIdArg)
            ChatScreen(
                sessionId = sessionId,
                onNavigateToSessions = {
                    navController.navigate(Screen.Sessions.route)
                },
                onNavigateToSession = {
                    navController.navigate(Screen.Session.route)
                },
                onNavigateToDiagnostics = {
                    // Only available in debug builds
                    if (BuildConfig.DEBUG) {
                        navController.navigate(Screen.Diagnostics.route)
                    }
                },
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        
        composable(Screen.Sessions.route) {
            SessionsScreen(
                onNavigateToChat = { sessionId ->
                    navController.navigate(Screen.Chat.createRoute(sessionId)) {
                        popUpTo(Screen.Sessions.route) { inclusive = true }
                    }
                },
                onNavigateToHistory = { sessionId ->
                    navController.navigate(Screen.History.createRoute(sessionId))
                },
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
        
        composable(
            route = Screen.History.routeWithArgs,
            arguments = listOf(
                navArgument(Screen.History.sessionIdArg) {
                    type = NavType.StringType
                }
            )
        ) { backStackEntry ->
            val sessionId = backStackEntry.arguments?.getString(Screen.History.sessionIdArg) ?: return@composable
            HistoryScreen(
                sessionId = sessionId,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onContinueChat = {
                    navController.navigate(Screen.Chat.createRoute(sessionId)) {
                        popUpTo(Screen.Sessions.route)
                    }
                }
            )
        }
        
        composable(Screen.Session.route) {
            SessionScreen(
                authState = AuthState.Authenticated(
                    session = SupabaseAuthClient.getCurrentSession()!!
                ),
                onSignOut = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
        
        // Diagnostics screen - only available in debug builds
        if (BuildConfig.DEBUG) {
            composable(Screen.Diagnostics.route) {
                DiagnosticsScreen(
                    onNavigateBack = {
                        navController.popBackStack()
                    }
                )
            }
        }
    }
}

/**
 * Screen definitions for navigation
 */
sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Login : Screen("login")
    
    object Chat : Screen("chat") {
        const val sessionIdArg = "sessionId"
        val routeWithArgs = "$route?$sessionIdArg={$sessionIdArg}"
        
        fun createRoute(sessionId: String? = null): String {
            return if (sessionId != null) {
                "$route?$sessionIdArg=$sessionId"
            } else {
                route
            }
        }
    }
    
    object Sessions : Screen("sessions")
    
    object History : Screen("history") {
        const val sessionIdArg = "sessionId"
        val routeWithArgs = "$route/{$sessionIdArg}"
        
        fun createRoute(sessionId: String): String {
            return "$route/$sessionId"
        }
    }
    
    object Session : Screen("session")
    
    // Dev-only screen
    object Diagnostics : Screen("diagnostics")
}
