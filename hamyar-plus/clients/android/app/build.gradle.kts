plugins { id("com.android.application") }

// فقط نشانی عمومی سایت (برای همگام‌سازی آنلاین)؛ هیچ راز یا توکنی وارد APK نمی‌شود.
// بدون این متغیر هم اپ کاملاً لوکال/آفلاین کار می‌کند و نشانی از داخل اپ قابل تنظیم است.
val siteOrigin = (System.getenv("HAMYAR_SITE_ORIGIN") ?: "").trim().trimEnd('/')
if (siteOrigin.isNotEmpty()) {
    require(siteOrigin.matches(Regex("https://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?", RegexOption.IGNORE_CASE))) {
        "HAMYAR_SITE_ORIGIN must be a public HTTPS origin without a path or credentials"
    }
}

android {
    namespace = "com.hamyarplus.app"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "com.hamyarplus.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "DEFAULT_SITE_ORIGIN", "\"$siteOrigin\"")
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
