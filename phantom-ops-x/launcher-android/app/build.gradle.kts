plugins { id("com.android.application") }

// Public update channel base URL ONLY (serves update-manifest.json + bundle files).
// Never put secrets, credentials or tokens in an APK. Overridable at build time:
//   PHANTOM_UPDATE_BASE=https://your.host/phantom-ops-x/app
val updateBase = (System.getenv("PHANTOM_UPDATE_BASE")
    ?: "https://raw.githubusercontent.com/amingangmanatgh2-hash/gaming-hub/Main/phantom-ops-x/app").trim().trimEnd('/')

// Bundle the standalone game (../app) into the APK as assets/game so the
// launcher can provision it on-device and later swap verified updates.
val bundleGame = tasks.register<Copy>("bundleGame") {
    from(rootProject.projectDir.resolve("../app"))
    into(layout.projectDirectory.dir("src/main/assets/game"))
}

android {
    namespace = "com.phantomops.launcher"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.phantomops.launcher"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "UPDATE_BASE_URL", "\"$updateBase\"")
        buildConfigField("String", "BUNDLED_VERSION", "\"1.0.0\"")
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Serves the installed game bundle to the WebView over a virtual HTTPS
    // origin (correct MIME types for ES modules; stable localStorage origin).
    implementation("androidx.webkit:webkit:1.12.1")
}

tasks.named("preBuild") { dependsOn(bundleGame) }
