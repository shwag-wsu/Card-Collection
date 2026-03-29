# Card Collection MVP (Initial Scaffold)

This repository contains a clean, local-first scaffold for a self-hosted trading card collection MVP.

## Tech Stack

- **Web app:** Next.js + TypeScript (`apps/web`)
- **Analyzer service:** FastAPI (`apps/analyzer`)
- **Database:** PostgreSQL 16
- **Orchestration:** Docker Compose
- **Image storage:** Local filesystem mounted from `./storage`

## Repository Structure

```text
apps/
  web/
  analyzer/
infra/
  docker/
storage/
  originals/
  processed/
  thumbnails/
docker-compose.yml
.env.example
README.md
```

## Included in This Initial Setup

- Docker Compose with `web`, `analyzer`, and `db` services.
- Next.js TypeScript app scaffold with a basic landing page.
- FastAPI analyzer scaffold with:
  - `GET /health`
  - `POST /analyze/normalize`
  - `POST /analyze/quality`
  - `POST /analyze/card-images`
- Local storage directory scaffold with `.gitkeep` placeholders.

## Quick Start

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Build and start services:

   ```bash
   docker compose up --build
   ```

3. Open locally:

   - Web: http://localhost:3000
   - Analyzer health: http://localhost:8000/health
   - PostgreSQL: localhost:5432

## Notes

- This is intentionally a **minimal scaffold**.
- Advanced features (CRUD, uploads, migrations, pricing providers, ROI workflows, etc.) are not implemented yet.
- Data persistence:
  - PostgreSQL data persists in Docker volume `postgres_data`.
  - Image files persist in host directory `./storage`.
