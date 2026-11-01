FROM golang:1.27-alpine AS builder

WORKDIR /build

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o cdn-server ./cmd/server

FROM alpine:3.24

ARG VERSION
ARG GIT_COMMIT

LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}"

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /build/cdn-server /app/cdn-server

EXPOSE 8080

ENTRYPOINT ["/app/cdn-server"]
