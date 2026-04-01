# Card Collection MVP (Initial Scaffold)

This repository contains a local-first scaffold for a self-hosted trading card collection MVP.

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

## Docker Setup Included

- `docker-compose.yml` with 3 services:
  - `web` on `http://localhost:3000`
  - `analyzer` on `http://localhost:8000`
  - `db` (PostgreSQL 16) on `localhost:5432`
- Service Dockerfiles:
  - `infra/docker/Dockerfile.web`
  - `infra/docker/Dockerfile.analyzer`
- Host-mounted image storage:
  - `./storage` on host mounted to `${STORAGE_ROOT}` in `web` and `analyzer`
- Environment variable loading from `.env`
- Health checks for `db`, `analyzer`, and `web`

## Startup Instructions

1. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

2. (Optional) Review/edit `.env` values.

3. Build and start everything:

   ```bash
   docker compose up --build
   ```

4. Verify services:

   - Web app: http://localhost:3000
   - Analyzer health: http://localhost:8000/health
   - PostgreSQL: `localhost:5432`

5. Stop services:

   ```bash
   docker compose down
   ```

## AI pre-grade + Pricing API notes

### Wizard API route

- Add-card wizard submits to `POST /api/cards/create-with-images`.
- The route stores images and runs AI pre-grade estimation.

### Environment variables

Set these in `.env`:

- `ANALYZER_URL` (required fallback analyzer service URL)
- `OPENAI_API_KEY` (optional, enables vision-model JSON grading)
- `OPENAI_GRADING_MODEL` (optional, default `gpt-4.1-mini`)

### Testing: grading is no longer hardcoded

1. Upload at least two very different cards/images in the wizard.
2. Confirm `estimatedGradeRange`, `confidence`, `detectedIssues`, and subscores differ between runs.
3. Verify API response includes `fallbackUsed` so you can tell if fallback logic was used.
4. Temporarily unset `ANALYZER_URL` and `OPENAI_API_KEY` to verify the route returns a grading error state (no fake 7.5-9 defaults).

## Notes

- PostgreSQL data is persisted in Docker volume `postgres_data`.
- Card image files are persisted on disk under `./storage`.
- `web` waits for healthy `db` and `analyzer` before starting.
- API docs are available at `GET /api/docs` (Swagger UI) backed by `GET /api/openapi`.
- Manual pricing snapshots can be uploaded with `POST /api/price-snapshots`.
