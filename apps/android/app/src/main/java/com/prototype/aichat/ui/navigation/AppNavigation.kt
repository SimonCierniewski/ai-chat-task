package com.prototype.aichat.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.prototype.aichat.BuildConfig
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.ui.screens.DiagnosticsScreen
import com.prototype.aichat.ui.screens.LoginScreen
import com.prototype.aichat.ui.screens.MainScreen
import com.prototype.aichat.ui.screens.SessionScreen
import com.prototype.aichat.ui.screens.SplashScreen
import io.github.jan.supabase.gotrue.user.UserSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

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
                onNavigateToMain = {
                    navController.navigate(Screen.Main.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                }
            )
        }
        
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.Main.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }
        
        composable(Screen.Main.route) {
            MainScreen(
                onNavigateToDiagnostics = {
                    // Only available in debug builds
                    if (BuildConfig.DEBUG) {
                        navController.navigate(Screen.Diagnostics.route)
                    }
                },
                onLogout = {
                    // Sign out from Supabase first, then navigate to login
                    CoroutineScope(Dispatchers.Main).launch {
                        try {
                            SupabaseAuthClient.signOut()
                        } catch (e: Exception) {
                            // Even if sign out fails, navigate to login
                        }
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }
            )
        }
        
        composable(Screen.Session.route) {
            val session = SupabaseAuthClient.getCurrentSession()
            if (session != null) {
                SessionScreen(
                    session = session,
                    onSignOut = {
                        // Sign out from Supabase first, then navigate to login
                        CoroutineScope(Dispatchers.Main).launch {
                            try {
                                SupabaseAuthClient.signOut()
                            } catch (e: Exception) {
                                // Even if sign out fails, navigate to login
                            }
                            navController.navigate(Screen.Login.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }
                )
            }
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
    object Main : Screen("main")  // Main screen with bottom navigation
    object Session : Screen("session")
    
    // Dev-only screen
    object Diagnostics : Screen("diagnostics")
}
