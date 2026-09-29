# Node 22: o toolchain do frontend exige >= 20.19 e o backend acompanha a mesma
# linha para que as duas imagens fiquem previsíveis.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci instala exatamente o que está no lock; --omit=dev deixa fora tudo que
# só serve para desenvolvimento.
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# Dentro do container a rede já é isolada pelo Docker, e o nginx é quem publica
# a porta, então aqui o servidor precisa aceitar conexões da rede do compose.
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATA_DIR=/data

WORKDIR /app

# tini como PID 1 para que SIGTERM chegue ao Node e o desligamento seja limpo.
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# O volume de dados pertence ao usuário sem privilégio que roda o processo.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
