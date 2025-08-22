package com.prototype.aichat

import android.content.Intent
import android.os.Bundle
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
import com.prototype.aichat.ui.navigation.AppNavigation
import com.prototype.aichat.ui.navigation.Screen
import com.prototype.aichat.ui.theme.AIChatTheme
import com.prototype.aichat.viewmodel.AuthViewModel

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
        // Log all intent data for debugging
        android.util.Log.d("MainActivity", "handleIntent called")
        android.util.Log.d("MainActivity", "Intent action: ${intent.action}")
        android.util.Log.d("MainActivity", "Intent data: ${intent.data}")
        
        // Check if this is a deep link callback
        val data = intent.data
        if (data != null) {
            android.util.Log.d("MainActivity", "Data URI: $data")
            android.util.Log.d("MainActivity", "Scheme: ${data.scheme}")
            android.util.Log.d("MainActivity", "Host: ${data.host}")
            android.util.Log.d("MainActivity", "Fragment: ${data.fragment}")
            android.util.Log.d("MainActivity", "Query: ${data.query}")
            
            // Check both exact match and any auth-related deep link
            if ((data.scheme == AppConfig.DEEPLINK_SCHEME && data.host == AppConfig.DEEPLINK_HOST) ||
                (data.scheme == "aichat-dev" && data.host == "auth")) {
                
                android.util.Log.d("MainActivity", "Deep link matched! Processing...")
                
                // Handle the deep link - extract token and session info
                val url = data.toString()
                android.util.Log.d("MainActivity", "Full URL: $url")
                
                // Process magic link authentication
                authViewModel.handleDeepLink(url)
            } else {
                android.util.Log.d("MainActivity", "Deep link not matched. Expected: ${AppConfig.DEEPLINK_SCHEME}://${AppConfig.DEEPLINK_HOST}")
            }
        } else {
            android.util.Log.d("MainActivity", "No data URI in intent")
        }
    }
}