# کف‌خواب ریسینگ — WebView جاوا ندارد؛ ProGuard تقریباً غیرفعال است.
-keep class com.kafkhab.racing.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
