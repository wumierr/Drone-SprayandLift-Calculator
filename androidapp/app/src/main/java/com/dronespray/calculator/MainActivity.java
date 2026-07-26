package com.dronespray.calculator;

import android.annotation.SuppressLint;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * 无人机打药计算器 - 主 Activity
 *
 * 移动端深度优化：
 * - 全屏沉浸式，状态栏与主题色融合
 * - JavaScript + DOM Storage + 数据库全部启用
 * - 文件访问、缓存策略完整配置
 * - 输入框获焦时自动调整视窗，避免被键盘遮挡
 * - 返回键先回退网页历史，再退出
 * - 横竖屏切换不重建 Activity（避免状态丢失）
 * - 防 WebView 长按选择菜单
 * - 跟随系统深色模式（通过 prefers-color-scheme）
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String START_URL = "file:///android_asset/www/index.html";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 沉浸式边到边布局
        setupImmersiveMode();

        // 创建 WebView 容器
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        configureWebView();

        // 返回键处理：先回退网页历史，再退出应用
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        // 加载首页
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    /**
     * 沉浸式：内容延伸到状态栏后方
     */
    private void setupImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // 状态栏图标颜色随主题
        applySystemBarAppearance();
    }

    /**
     * 根据系统深色模式切换状态栏图标颜色
     */
    private void applySystemBarAppearance() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller == null) return;
        boolean isDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        // 浅色背景 → 深色图标；深色背景 → 浅色图标
        controller.setAppearanceLightStatusBars(!isDark);
        controller.setAppearanceLightNavigationBars(!isDark);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    /**
     * WebView 全量配置
     */
    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings s = webView.getSettings();
        // JS 执行
        s.setJavaScriptEnabled(true);
        // LocalStorage / SessionStorage / IndexedDB
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // 文件访问（assets 内 file:// 必需）
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // 缩放（保留用户缩放能力，无障碍需要）
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        // 自适应屏幕
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING);
        // 缓存
        // 注：setAppCacheEnabled/setAppCachePath 对应的 Application Cache 标准已废弃，
        // 相关 API 在 API 33 中被移除（compileSdk 34 下不存在）。离线能力由页面自带的
        // Service Worker（sw.js）负责，此处仅保留标准 HTTP 缓存策略。
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // 编码
        s.setDefaultTextEncodingName("UTF-8");
        // 禁止 WebView 复制粘贴长按菜单（让 Web 自己处理）
        webView.setOnLongClickListener(v -> true);
        webView.setHapticFeedbackEnabled(false);
        // 关闭硬件加速过度绘制（部分机型有闪烁问题）
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // 在 WebView 内打开所有链接
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                // 注入 safe-area 兼容性补丁（旧版 WebView 不支持 env()）
                injectSafeAreaPatch(view);
            }
        });

        // 支持全屏视频、alert、prompt 等
        webView.setWebChromeClient(new WebChromeClient());

        // 让 WebView 自身处理 WindowInsets，避免内容被状态栏遮挡
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            int top = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
            int bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
            v.setPadding(0, top, 0, bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }

    /**
     * 注入 safe-area 补丁：用实际状态栏高度设置 CSS 变量
     */
    private void injectSafeAreaPatch(WebView view) {
        int top = 0, bottom = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            top = getWindowManager().getCurrentWindowMetrics().getWindowInsets()
                    .getInsets(android.view.WindowInsets.Type.statusBars()).top;
            bottom = getWindowManager().getCurrentWindowMetrics().getWindowInsets()
                    .getInsets(android.view.WindowInsets.Type.navigationBars()).bottom;
        }
        // px 转 dip（WebView 用的是 CSS px，约等于 dip）
        float density = getResources().getDisplayMetrics().density;
        int topCss = Math.round(top / density);
        int botCss = Math.round(bottom / density);
        String js = "(function(){"
                + "var s=document.documentElement.style;"
                + "s.setProperty('--safe-top','" + topCss + "px');"
                + "s.setProperty('--safe-bottom','" + botCss + "px');"
                + "})();";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            view.evaluateJavascript(js, null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        applySystemBarAppearance();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            rootRemoveWebView();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void rootRemoveWebView() {
        try {
            ((FrameLayout) webView.getParent()).removeView(webView);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // 跟随系统深色模式
        applySystemBarAppearance();
    }
}
