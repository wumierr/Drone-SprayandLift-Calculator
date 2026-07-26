# ============================================================
#  Dockerfile — 无人机打药计算器（纯静态站点）
#
#  构建（在项目根目录执行，注意 -f 指向本文件）:
#    docker build -f deploy/Dockerfile -t drone-spray-calculator .
#
#  运行:
#    docker run -d --name drone-spray -p 8080:80 --restart unless-stopped drone-spray-calculator
#    访问 http://服务器IP:8080
#
#  说明: 多阶段构建，第一阶段用 busybox 挑出要发布的文件（等价于 build-web），
#        第二阶段用 nginx:alpine 提供服务。最终镜像约 50MB。
# ============================================================

# ---------- Stage 1: 收集静态文件 ----------
FROM busybox:1.36 AS collector

WORKDIR /src
COPY index.html manifest.json sw.js ./
COPY drone-spray-calculator-standalone.html ./
COPY css/    ./css/
COPY js/     ./js/
COPY assets/ ./assets/

# ---------- Stage 2: nginx 提供服务 ----------
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="drone-spray-calculator" \
      org.opencontainers.image.description="无人机打药计算器 - 纯静态 PWA" \
      org.opencontainers.image.licenses="MIT"

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=collector /src /usr/share/nginx/html

# 容器内不需要 root 权限写文件
RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
