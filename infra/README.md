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
