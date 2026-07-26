# Gradle Wrapper 说明

## ⚠️ 重要：首次使用前需生成 Gradle Wrapper

本仓库未包含 `gradle-wrapper.jar`（二进制文件不上传 GitHub）。首次使用前请按以下步骤生成：

### 方法 A：通过 Android Studio 自动生成（推荐）
1. 用 Android Studio 打开 `android-webview/` 目录
2. Android Studio 会自动检测并下载所需 Gradle
3. 等待 Gradle Sync 完成即可，无需手动操作

### 方法 B：通过本机 Gradle 命令生成
如果已安装 Gradle 8.x：
```bash
cd android-webview
gradle wrapper --gradle-version 8.5
```

### 方法 C：从其他 Android 项目复制
任何 Android Studio 项目都会有 `gradle/wrapper/gradle-wrapper.jar`，复制过来即可。

---

## 验证

执行 `./gradlew assembleDebug`（Mac/Linux）或 `gradlew.bat assembleDebug`（Windows）应能成功生成 APK。

如果提示 "Could not find or load main class org.gradle.wrapper.GradleWrapperMain"，说明 jar 缺失，按上述方法生成。
