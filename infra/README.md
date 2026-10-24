# Infra

Docker Compose configurations for infrastructure services.

## Services

### 1. PostgreSQL (`postgres/`)
- **Image**: `postgres:18.6-alpine3.24`
- **Port**: `5432`
- **Volume**: `postgres_data` -> `/var/lib/postgresql`
- **Default Credentials**:
  - User: `postgres`
  - Password: `postgrespassword`
  - Database: `postgresdb`

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
  - Access Key: `rustfsadmin`
  - Secret Key: `rustfsadmin`

Start service:
```bash
docker compose -f rustfs/docker-compose.yml up -d
```
