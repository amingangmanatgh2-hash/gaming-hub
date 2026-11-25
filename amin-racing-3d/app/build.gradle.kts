import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: provided through environment variables (CI secrets) or a
// local keystore.properties file. When neither exists, the release build is
// signed with the standard debug key so that it is still installable.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(env: String, prop: String): String? =
    System.getenv(env)?.takeIf { it.isNotBlank() } ?: keystoreProps.getProperty(prop)?.takeIf { it.isNotBlank() }

val releaseStoreFile: File? = run {
    val b64 = System.getenv("AMIN_KEYSTORE_BASE64")
    if (!b64.isNullOrBlank()) {
        val out = layout.buildDirectory.file("signing/release.p12").get().asFile
        out.parentFile.mkdirs()
        out.writeBytes(Base64.getMimeDecoder().decode(b64))
        out
    } else {
        keystoreProps.getProperty("storeFile")?.let { rootProject.file(it) }?.takeIf { it.exists() }
    }
}
val hasReleaseKey = releaseStoreFile != null && signingValue("AMIN_KEYSTORE_PASSWORD", "storePassword") != null

android {
    namespace = "com.amin.racing3d"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.amin.racing3d"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        resourceConfigurations += listOf("fa", "en")
    }

    signingConfigs {
        // Shared, non-secret debug key committed to the repo so that every CI build of the
        // debug APK carries the same signature (installable as an update over older builds).
        getByName("debug") {
            storeFile = rootProject.file("signing/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
            storeType = "pkcs12"
        }
        if (hasReleaseKey) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = signingValue("AMIN_KEYSTORE_PASSWORD", "storePassword")
                keyAlias = signingValue("AMIN_KEY_ALIAS", "keyAlias") ?: "amin"
                keyPassword = signingValue("AMIN_KEY_PASSWORD", "keyPassword")
                    ?: signingValue("AMIN_KEYSTORE_PASSWORD", "storePassword")
                storeType = if (releaseStoreFile!!.name.endsWith(".p12")) "pkcs12" else null
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
    packaging {
        resources.excludes += listOf("META-INF/*.kotlin_module", "kotlin/**", "DebugProbesKt.bin")
    }
}

dependencies {
    // Intentionally no third-party libraries: the game is pure Kotlin + Android
    // framework + OpenGL ES 3.0. Only the Kotlin standard library is bundled.
}
