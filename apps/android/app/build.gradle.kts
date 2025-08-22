import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("kotlin-parcelize")
    id("kotlin-kapt")
}

// Load local properties for environment variables
val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localProperties.load(localPropertiesFile.inputStream())
}

android {
    namespace = "com.prototype.aichat"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.prototype.aichat"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    // Build Variants Configuration
    buildTypes {
        debug {
            isDebuggable = true
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-DEBUG"
        }
        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    // Product Flavors for dev/prod environments
    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            
            // Dev environment config
            buildConfigField("String", "FLAVOR", "\"dev\"")
            buildConfigField("String", "SUPABASE_URL", 
                "\"${localProperties.getProperty("dev.supabase.url", "https://placeholder.supabase.co")}\"")
            buildConfigField("String", "SUPABASE_ANON_KEY", 
                "\"${localProperties.getProperty("dev.supabase.anonKey", "placeholder")}\"")
            buildConfigField("String", "API_BASE_URL", 
                "\"${localProperties.getProperty("dev.api.baseUrl", "http://10.0.2.2:3000")}\"")
            buildConfigField("String", "APP_DEEPLINK_SCHEME", 
                "\"${localProperties.getProperty("dev.app.deeplink.scheme", "aichat-dev")}\"")
            buildConfigField("String", "APP_DEEPLINK_HOST", 
                "\"${localProperties.getProperty("dev.app.deeplink.host", "auth")}\"")
            
            // Manifest placeholders for deep links
            manifestPlaceholders["deeplinkScheme"] = localProperties.getProperty("dev.app.deeplink.scheme", "aichat-dev")
            manifestPlaceholders["deeplinkHost"] = localProperties.getProperty("dev.app.deeplink.host", "auth")
            
            // Network security config for dev
            manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config_dev"
        }
        
        create("prod") {
            dimension = "environment"
            
            // Production environment config
            buildConfigField("String", "FLAVOR", "\"prod\"")
            buildConfigField("String", "SUPABASE_URL", 
                "\"${localProperties.getProperty("prod.supabase.url", "https://placeholder.supabase.co")}\"")
            buildConfigField("String", "SUPABASE_ANON_KEY", 
                "\"${localProperties.getProperty("prod.supabase.anonKey", "placeholder")}\"")
            buildConfigField("String", "API_BASE_URL", 
                "\"${localProperties.getProperty("prod.api.baseUrl", "https://api.example.com")}\"")
            buildConfigField("String", "APP_DEEPLINK_SCHEME", 
                "\"${localProperties.getProperty("prod.app.deeplink.scheme", "aichat")}\"")
            buildConfigField("String", "APP_DEEPLINK_HOST", 
                "\"${localProperties.getProperty("prod.app.deeplink.host", "auth")}\"")
            
            // Manifest placeholders for deep links
            manifestPlaceholders["deeplinkScheme"] = localProperties.getProperty("prod.app.deeplink.scheme", "aichat")
            manifestPlaceholders["deeplinkHost"] = localProperties.getProperty("prod.app.deeplink.host", "auth")
            
            // Network security config for prod (default secure)
            manifestPlaceholders["networkSecurityConfig"] = "@xml/network_security_config_prod"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=kotlin.RequiresOptIn",
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-opt-in=kotlinx.coroutines.FlowPreview",
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api"
        )
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
    
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Core Android
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    
    // Compose BOM - manages all Compose library versions
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.runtime:runtime-livedata")
    implementation("androidx.compose.foundation:foundation")
    
    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.7")
    
    // Lifecycle & ViewModel
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    
    // Coroutines & Flow
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    
    // Supabase Client
    val supabaseVersion = "2.1.0"
    implementation("io.github.jan-tennert.supabase:gotrue-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:postgrest-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:realtime-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:storage-kt:$supabaseVersion")
    
    // Ktor client for Supabase
    val ktorVersion = "2.3.8"
    implementation("io.ktor:ktor-client-android:$ktorVersion")
    implementation("io.ktor:ktor-client-core:$ktorVersion")
    implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("io.ktor:ktor-utils:$ktorVersion")
    
    // OkHttp & SSE (Server-Sent Events)
    val okhttpVersion = "4.12.0"
    implementation("com.squareup.okhttp3:okhttp:$okhttpVersion")
    implementation("com.squareup.okhttp3:okhttp-sse:$okhttpVersion")
    implementation("com.squareup.okhttp3:logging-interceptor:$okhttpVersion")
    
    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
    
    // DataStore for preferences
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    
    // Room for local cache (optional but included)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    // Use kapt for Kotlin instead of annotationProcessor
    kapt("androidx.room:room-compiler:$roomVersion")
    
    // Dependency Injection (optional, using manual DI for now)
    // implementation("io.insert-koin:koin-androidx-compose:3.5.3")
    
    // Splash Screen API
    implementation("androidx.core:core-splashscreen:1.0.1")
    
    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.2.1")
    
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.02.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    
    // Debug tools
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}