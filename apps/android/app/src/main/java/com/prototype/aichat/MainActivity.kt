package com.prototype.aichat

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.ui.navigation.AppNavigation
import com.prototype.aichat.ui.navigation.Screen
import com.prototype.aichat.ui.theme.AIChatTheme
import com.prototype.aichat.viewmodel.AuthViewModel
import io.github.jan.supabase.gotrue.handleDeeplinks

class MainActivity : ComponentActivity() {
    
    private val authViewModel: AuthViewModel by viewModels()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Handle deep link if app was opened via auth callback
        handleIntent(intent)
        
        setContent {
            AIChatTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    val authState by authViewModel.uiState.collectAsState()
                    
                    // Navigate based on auth state
                    LaunchedEffect(authState.isAuthenticated) {
                        if (authState.isAuthenticated) {
                            navController.navigate(Screen.Chat.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }
                    
                    AppNavigation(
                        navController = navController,
                        startDestination = Screen.Splash.route
                    )
                }
            }
        }
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent) // Update the intent
        intent?.let { handleIntent(it) }
    }
    
    private fun handleIntent(intent: Intent) {
        SupabaseAuthClient.handleDeeplinks(intent)
    }
}
