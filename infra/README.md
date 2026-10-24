# Infra

Docker Compose configurations for infrastructure services.

## Services

### 1. PostgreSQL (`postgres/`)
- **Image**: `postgres:18.6-alpine3.24`
- **Port**: `5432`
- **Volume**: `postgres_data` -> `/var/lib/postgresql`
- **Default Credentials**:
  - User: `braingain`
  - Password: `braingain`
  - Database: `braingain`
- **Internal URL**: `postgresql://braingain:braingain@postgres:5432/braingain`

Start service:
```bash
docker compose -f postgres/docker-compose.yml up -d
```

### 2. RustFS (`rustfs/`)
- **Image**: `rustfs/rustfs:1.0.3`
- **Ports**:
  - `9000`: S3 API
  - `9001`: Web Console
- **Volume**: `rustfs_data` -> `/data`
- **Default Credentials**:
  - Access Key: `braingain`
  - Secret Key: `braingain-secret`
- **Bucket**: `braingain` (auto-created on startup via `s3-init`)

Start service:
```bash
docker compose -f rustfs/docker-compose.yml up -d
```

### 3. Glances (`glances/`)
- **Image**: `nicolargo/glances:latest-full`
- **Port**:
  - `61208`: Web UI
- **Volume**:
  - `/var/run/docker.sock` -> `/var/run/docker.sock:ro`
- **PID**: `host`
- **Web UI URL**: `http://localhost:61208`

Start service:
```bash
docker compose -f glances/docker-compose.yml up -d
```

### 4. Piper TTS (`piper/`)
- **Image**: `braingain/piper:1.8.0-<voice>` (built locally from `piper/Dockerfile`, `piper-tts[http]==1.8.0`)
- **Port**:
  - `5000`: HTTP API
- **Voice**: `en_US-hfc_female-medium` (baked into the image; to change it, update the `VOICE` build arg and the image tag in `piper/docker-compose.yml`)
- **Internal URL**: `http://piper:5000`

Synthesize speech (returns WAV):
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"text": "Hello"}' -o out.wav http://localhost:5000/synthesize
```

Start service:
```bash
docker compose -f piper/docker-compose.yml up -d --build
```
