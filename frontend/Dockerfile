FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

ARG VERSION
ARG GIT_COMMIT

LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/braingain/browser /usr/share/nginx/html

EXPOSE 80
