plugins { id("com.android.application") }

// Public URL only. Never put SETUP_KEY, APP_SECRET, a subscription link or a bot token in an APK.
val workerOrigin = (System.getenv("MADAR_WORKER_ORIGIN") ?: "").trim().trimEnd('/')
if (workerOrigin.isNotEmpty()) {
    require(workerOrigin.matches(Regex("https://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?", RegexOption.IGNORE_CASE))) {
        "MADAR_WORKER_ORIGIN must be a public HTTPS origin without a path or credentials"
    }
}

android {
    namespace = "com.madar.companion"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.madar.companion"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "DEFAULT_WORKER_ORIGIN", "\"$workerOrigin\"")
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
