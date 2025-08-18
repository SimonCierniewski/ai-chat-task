package com.prototype.aichat

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.prototype.aichat.data.AuthState
import com.prototype.aichat.ui.screens.LoginScreen
import com.prototype.aichat.ui.screens.SessionScreen
import com.prototype.aichat.ui.theme.AIChatTheme
import com.prototype.aichat.viewmodel.AuthViewModel
import kotlinx.coroutines.launch

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
                    val authState by authViewModel.authState.collectAsState()
                    
                    when (val state = authState) {
                        is AuthState.Authenticated -> {
                            SessionScreen(
                                authState = state,
                                onSignOut = {
                                    lifecycleScope.launch {
                                        authViewModel.signOut()
                                    }
                                }
                            )
                        }
                        else -> {
                            LoginScreen(
                                authState = authState,
                                onSignIn = { email ->
                                    lifecycleScope.launch {
                                        authViewModel.signInWithEmail(email)
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleIntent(it) }
    }
    
    private fun handleIntent(intent: Intent) {
        // Check if this is a deep link callback
        val data = intent.data
        if (data != null && 
            data.scheme == BuildConfig.APP_DEEPLINK_SCHEME && 
            data.host == BuildConfig.APP_DEEPLINK_HOST) {
            
            // Handle the deep link
            lifecycleScope.launch {
                authViewModel.handleDeepLink(data.toString())
            }
        }
    }
}