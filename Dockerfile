FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY openapi ./openapi
COPY .env.example ./
RUN npm run build

# No secrets here: DB_PASSWORD_FILE and the secret file are provided at run time
# (environment variable and a mounted file), never baked into the image.
EXPOSE 3000
CMD ["node", "dist/main.js"]
