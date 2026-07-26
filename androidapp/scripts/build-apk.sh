#!/bin/bash
# ============================================================
#   一键构建 APK 脚本（Linux/Mac）
#   功能：检查环境 → 同步 Web → 生成 wrapper → 构建 APK → 拷贝输出
# ============================================================
set -e

# scripts/ 上一级是 androidapp/，再上一级是项目根目录
cd "$(dirname "$0")/../.."
PROJECT_ROOT="$(pwd)"
APP_DIR="$PROJECT_ROOT/androidapp"
OUTPUT_DIR="$APP_DIR/build-output"
GRADLE_VERSION="8.5"

# 颜色
G="\033[32m"; Y="\033[33m"; R="\033[31m"; B="\033[34m"; N="\033[0m"
log()  { echo -e "${G}[✓]${N} $1"; }
warn() { echo -e "${Y}[!]${N} $1"; }
err()  { echo -e "${R}[✗]${N} $1"; }
info() { echo -e "${B}[i]${N} $1"; }

echo "============================================================"
echo "  无人机打药计算器 - APK 构建脚本"
echo "============================================================"
echo ""

# ---------- 1. 检查环境 ----------
info "检查构建环境..."

HAS_JAVA=0
HAS_SDK=0
HAS_GRADLE=0
USE_WRAPPER=0

# Java
if command -v java &> /dev/null; then
  JAVA_VERSION=$(java -version 2>&1 | head -1 | awk -F\" '{print $2}')
  if [[ "$JAVA_VERSION" =~ ^17 ]] || [[ "$JAVA_VERSION" =~ ^2[0-9] ]]; then
    log "Java $JAVA_VERSION"
    HAS_JAVA=1
  else
    warn "Java 版本 $JAVA_VERSION（建议 17+）"
    HAS_JAVA=1
  fi
fi

# Android SDK
ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$ANDROID_HOME" ] && [ -d "$HOME/Android/Sdk" ]; then
  ANDROID_HOME="$HOME/Android/Sdk"
elif [ -z "$ANDROID_HOME" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  ANDROID_HOME="$HOME/Library/Android/sdk"
fi
if [ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME/platforms" ]; then
  log "Android SDK: $ANDROID_HOME"
  HAS_SDK=1
  export ANDROID_HOME
else
  warn "未检测到 Android SDK"
fi

# Gradle
if command -v gradle &> /dev/null; then
  GRADLE_VER=$(gradle --version 2>&1 | grep "Gradle " | awk '{print $NF}')
  log "Gradle $GRADLE_VER"
  HAS_GRADLE=1
fi

# Gradle Wrapper jar
if [ -f "$APP_DIR/gradle/wrapper/gradle-wrapper.jar" ]; then
  USE_WRAPPER=1
  log "Gradle Wrapper jar 已存在"
fi

# ---------- 2. 环境缺失时给出指引 ----------
if [ $HAS_JAVA -eq 0 ]; then
  err "未找到 Java JDK 17。请安装："
  echo "  Mac:   brew install openjdk@17"
  echo "  Linux: sudo apt install openjdk-17-jdk"
  echo "  下载:  https://adoptium.net/temurin/releases/"
  exit 1
fi

if [ $HAS_SDK -eq 0 ]; then
  err "未找到 Android SDK。请按以下方式安装："
  echo "  方式 1: 安装 Android Studio，首次启动会自动下载 SDK"
  echo "  方式 2: 仅安装 command-line tools:"
  echo "    https://developer.android.com/studio#command-line-tools-only"
  echo "  安装后设置环境变量 ANDROID_HOME 指向 SDK 目录"
  echo "  并执行: sdkmanager 'platforms;android-34' 'build-tools;34.0.0'"
  exit 1
fi

# ---------- 3. 同步 Web 文件 ----------
info "同步 Web 文件到 androidapp..."
bash "$APP_DIR/scripts/sync-web.sh" --quiet || bash "$APP_DIR/scripts/sync-web.sh"

# ---------- 4. 生成 Gradle Wrapper ----------
if [ $USE_WRAPPER -eq 0 ]; then
  if [ $HAS_GRADLE -eq 1 ]; then
    info "使用本机 Gradle 生成 wrapper..."
    cd "$APP_DIR"
    gradle wrapper --gradle-version $GRADLE_VERSION --distribution-type bin
    log "Wrapper 已生成"
  else
    info "下载 gradle-wrapper.jar..."
    cd "$APP_DIR/gradle/wrapper"
    URL="https://raw.githubusercontent.com/gradle/gradle/v$GRADLE_VERSION/gradle/wrapper/gradle-wrapper.jar"
    if command -v curl &> /dev/null; then
      curl -fsSL -o gradle-wrapper.jar "$URL" || true
    elif command -v wget &> /dev/null; then
      wget -q -O gradle-wrapper.jar "$URL" || true
    fi
    if [ -f gradle-wrapper.jar ] && [ $(stat -c%s gradle-wrapper.jar 2>/dev/null || stat -f%z gradle-wrapper.jar) -gt 1000 ]; then
      log "gradle-wrapper.jar 已下载"
    else
      err "无法下载 gradle-wrapper.jar"
      echo "请手动下载并放到: $APP_DIR/gradle/wrapper/gradle-wrapper.jar"
      echo "或安装本机 Gradle: brew install gradle (Mac) / sdk install gradle (Linux)"
      exit 1
    fi
    cd "$APP_DIR"
  fi
fi

# ---------- 5. 创建 gradlew 脚本 ----------
if [ ! -f "$APP_DIR/gradlew" ]; then
  info "生成 gradlew 脚本..."
  cat > "$APP_DIR/gradlew" << 'GRADLEW'
#!/bin/sh
# 简化版 gradlew（首次使用 Android Studio 会自动完整生成）
DIR="$(cd "$(dirname "$0")" && pwd)"
exec java -classpath "$DIR/gradle/wrapper/gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain "$@"
GRADLEW
  chmod +x "$APP_DIR/gradlew"
fi

# ---------- 6. 构建 ----------
info "开始构建 APK..."
cd "$APP_DIR"

BUILD_TYPE="${1:-debug}"
info "构建类型: $BUILD_TYPE"

if [ -x "./gradlew" ]; then
  ./gradlew clean assemble$BUILD_TYPE --no-daemon --console=plain
else
  gradle clean assemble$BUILD_TYPE --no-daemon --console=plain
fi

# ---------- 7. 拷贝输出 ----------
mkdir -p "$OUTPUT_DIR"
APK_NAME="app-${BUILD_TYPE}.apk"
SRC_APK="$APP_DIR/app/build/outputs/apk/${BUILD_TYPE}/${APK_NAME}"
FINAL_NAME="drone-spray-calculator-${BUILD_TYPE}.apk"

if [ -f "$SRC_APK" ]; then
  cp "$SRC_APK" "$OUTPUT_DIR/$FINAL_NAME"
  log "✅ 构建成功！"
  echo ""
  echo "  APK 位置: $OUTPUT_DIR/$FINAL_NAME"
  ls -lh "$OUTPUT_DIR/$FINAL_NAME" | awk '{print "  文件大小:", $5}'
  echo ""
  echo "  安装到手机："
  echo "    adb install $OUTPUT_DIR/$FINAL_NAME"
  echo ""
  if [ "$BUILD_TYPE" = "release" ]; then
    warn "Release APK 需要签名才能在真机安装。"
    echo "  详见 androidapp/README.md 中的「签名」章节"
  fi
else
  err "构建失败：未找到 APK"
  exit 1
fi
