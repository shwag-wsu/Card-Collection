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
  overlays/
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
- The route stores images and runs analyzer-first AI pre-grade estimation.
- `gradingStatus` now returns one of: `estimated`, `fallback_estimated`, `needs_retake`, `failed`.

### Environment variables

Set these in `.env`:

- `ANALYZER_URL` should be `http://analyzer:8000` for Docker-internal service calls.
- `OPENAI_API_KEY` (optional, enables vision-model JSON grading)
- `OPENAI_GRADING_MODEL` (optional, default `gpt-4.1-mini`)
- `OPENAI_TIMEOUT_MS` (optional, default `15000`)
- `OPENAI_MAX_RETRIES` (optional, default `2`)

### Local debugging flow for grading reliability

1. Start stack in background:

   ```bash
   docker compose up --build -d
   ```

2. Validate wiring:

   ```bash
   docker compose exec web printenv ANALYZER_URL
   docker compose exec analyzer printenv STORAGE_ROOT
   ```

3. Verify analyzer accessibility from web container:

   ```bash
   docker compose exec web sh -lc "wget -qO- http://analyzer:8000/health"
   ```

4. Upload a card and confirm generated assets:

   - Originals under `storage/originals`
   - Processed under `storage/processed`
   - Overlays under `storage/overlays`
   - Served paths under `/api/images/processed/<file>` and `/api/images/overlays/<file>`

5. Check grading observability:

   ```bash
   docker compose exec web npx prisma studio
   ```

   Inspect `GradingRun` rows for request IDs, provider/model, status, fallback usage, errors, and latency.

6. Apply DB schema updates locally:

   ```bash
   docker compose exec web npx prisma migrate deploy
   ```

### Testing reminders

1. Upload at least two different cards/images.
2. Confirm `estimatedGradeRange`, `confidence`, `detectedIssues`, `retakeGuidance`, and subscores differ between runs.
3. Validate fallback by simulating OpenAI unavailability while analyzer remains reachable.
4. Ensure card creation still succeeds when grading status is `failed`.

## Notes

- PostgreSQL data is persisted in Docker volume `postgres_data`.
- Card image files are persisted on disk under `./storage`.
- `web` waits for healthy `db` and `analyzer` before starting.
- API docs are available at `GET /api/docs` (Swagger UI) backed by `GET /api/openapi`.
- Manual pricing snapshots can be uploaded with `POST /api/price-snapshots`.
