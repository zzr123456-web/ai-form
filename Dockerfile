# AI 辅助论坛 · 生产环境 Dockerfile
# Zeabur 双保险：优先识别 zbpack.json，存在 Dockerfile 时兜底使用此文件构建

# ---------- 构建阶段：安装依赖 + 构建前端 ----------
FROM node:20-alpine AS build

WORKDIR /app

# 先拷贝 package 再装依赖，利用 Docker layer 缓存
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# 拷贝源码并执行 Vite 构建（产出 dist/ 目录）
COPY . .
RUN npm run build

# ---------- 运行阶段：仅保留运行时依赖 + server.js + dist/ ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# 运行时依赖（pg、dotenv、ioredis、jsonwebtoken、bcryptjs）
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 从构建阶段拷贝构建产物与后端代码
COPY --from=build /app/dist ./dist
COPY server.js ./
COPY db ./db
COPY utils ./utils
COPY scripts ./scripts

# 生产环境监听 0.0.0.0，端口通过 PORT 环境变量覆盖（Zeabur 自动注入）
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 8787

CMD ["npm", "start"]
