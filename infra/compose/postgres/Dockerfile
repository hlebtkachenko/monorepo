FROM postgres:18@sha256:22c89fe0d0f507606260237fd55e51f6137f58b2d5bcf6152242b96d9fe8f9a4

LABEL org.opencontainers.image.title="workspace-postgres"
LABEL org.opencontainers.image.description="PostgreSQL 18 + pgvector + pgaudit for workspace local dev"

# pgvector: vector similarity search
# pgaudit: statement-level audit logging (matches prod RDS setting log_statement)
# Uses Debian-based postgres:18 because alpine apk does not yet package
# postgresql18-pgaudit or postgresql18-pgvector (as of Postgres 18 release).
# Both postgresql-18-pgvector and postgresql-18-pgaudit are available in the
# PGDG apt repo bundled into the official postgres:18 image.
RUN apt-get update && \
    apt-get install -y postgresql-18-pgvector postgresql-18-pgaudit && \
    rm -rf /var/lib/apt/lists/*

# pgaudit shared_preload_libraries is set in docker-compose.dev.yml via
# command args, not here, so the image stays generic and the compose file
# owns the runtime config.
