# WebView 应用 ProGuard 规则
# 不混淆应用代码
-keep class com.dronespray.calculator.** { *; }
# 保留 JavaScript 接口（如果未来添加）
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# 保留 WebView 相关类
-keep class android.webkit.** { *; }
-keep class org.chromium.** { *; }
