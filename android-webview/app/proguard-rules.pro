# 默认 ProGuard 规则
# WebView 应用通常无需混淆
-keep class com.dronespray.calculator.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
