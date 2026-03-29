# Self-Hosted Trading Card Collection MVP Spec

## Goal

Build a self-hosted web application for a local network that lets a user:

* add trading cards manually or from uploaded images
* store front/back card images locally
* track collection cost and estimated market value
* generate a pre-grade estimate for PSA-style grading
* estimate grading cost and ROI
* run fully on Docker in a local environment

This MVP should be designed so Codex can implement it incrementally.

---

## Product Summary

### Primary user flow

1. User opens the app on the local network.
2. User adds a card by entering details or uploading images.
3. App stores the card and images locally.
4. App optionally runs image analysis to produce a pre-grade estimate.
5. App shows raw value, graded value ranges, grading cost, and ROI scenarios.
6. User can browse and update the collection over time.

### MVP principles

* self-hosted only
* local-first storage
* Docker-based deployment
* minimal external dependencies
* works even without paid APIs
* pricing providers must be pluggable
* pre-grade is advisory only, never authoritative

---

## Architecture

### Services

Use Docker Compose with these services:

1. **web**

   * Next.js app
   * UI + API routes for core CRUD
   * handles authentication if enabled later

2. **db**

   * PostgreSQL
   * stores normalized card, collection, pricing, grading, and ROI data

3. **analyzer**

   * Python FastAPI service
   * image processing
   * card image normalization
   * quality checks
   * pre-grade scoring logic

4. **worker**

   * optional background job service
   * can be implemented later
   * handles long-running image analysis, price refreshes, and batch jobs

5. **ollama** (optional in MVP, enabled by profile)

   * local LLM helper for metadata cleanup and explanation text
   * not required for the first working version

### Storage strategy

* PostgreSQL for structured data
* local filesystem for image files
* mounted Docker volumes for persistence

### Network strategy

* expose only the web service to LAN users
* keep db and analyzer internal to Docker network
* app reachable via:

  * `http://<local-ip>:3000`
  * optional reverse proxy later for `http://cardvault.local`

---

## Suggested Repo Structure

```text
card-collection-app/
  apps/
    web/
      app/
      components/
      lib/
      pages/
      public/
      styles/
      package.json
    analyzer/
      app/
        main.py
        routes/
        services/
        models/
        utils/
      requirements.txt
  packages/
    shared/
      types/
      constants/
  infra/
    docker/
      Dockerfile.web
      Dockerfile.analyzer
    scripts/
      init-db.sql
  storage/
    originals/
    processed/
    thumbnails/
  docs/
    api.md
    schema.md
    roadmap.md
  docker-compose.yml
  .env.example
  README.md
```

---

## MVP Feature Set

### 1. Collection management

User can:

* create a collection item
* enter card metadata manually
* upload front image
* upload back image
* store purchase price and notes
* set quantity and ownership status
* edit and delete items
* browse collection in a table/grid
* search by player, set, year, card number, or game

### 2. Image storage

System can:

* save uploaded original images locally
* create normalized versions for analysis
* create thumbnails for fast UI display
* associate image paths to collection items

### 3. Pre-grade estimation

System can:

* run a local image-analysis pass on front/back images
* output quality flags:

  * blur
  * glare
  * skew/perspective issue
  * crop quality
* estimate component scores:

  * centering
  * corners
  * edges
  * surface
* map component scores to an estimated grade band, for example:

  * likely 7–8
  * likely 8–9
* store result history with model version

### 4. Pricing and comps

System can:

* accept manual raw and graded price entries
* store price snapshots over time
* support pluggable providers later:

  * manual
  * eBay
  * TCGplayer
  * PSA
  * CSV import

For MVP, manual pricing is enough to keep the project fully local and free.

### 5. Grading ROI calculator

System can:

* enter estimated grading fee
* enter shipping and insurance cost
* use predicted grade band
* calculate ROI scenarios for raw, grade 8, grade 9, grade 10
* estimate break-even point

---

## Non-Goals for MVP

These should not block the first release:

* automatic card identification from OCR or image matching
* multi-user support with roles
* cloud sync
* advanced auth/SSO
* auction scraping pipeline
* slab cert validation automation
* full machine-learning grade model
* mobile app

---

## Database Schema

### Table: `cards`

Canonical card definition.

Fields:

* `id` UUID PK
* `game` TEXT NOT NULL
* `sport` TEXT NULL
* `year` INT NULL
* `manufacturer` TEXT NULL
* `set_name` TEXT NOT NULL
* `subset_name` TEXT NULL
* `player_name` TEXT NULL
* `character_name` TEXT NULL
* `card_number` TEXT NULL
* `parallel` TEXT NULL
* `variation` TEXT NULL
* `language` TEXT NULL
* `notes` TEXT NULL
* `created_at` TIMESTAMP NOT NULL
* `updated_at` TIMESTAMP NOT NULL

Constraints/indexes:

* index on `(game, set_name)`
* index on `player_name`
* index on `character_name`
* index on `(year, card_number)`

### Table: `collection_items`

User-owned card entries.

Fields:

* `id` UUID PK
* `card_id` UUID FK -> `cards.id`
* `quantity` INT NOT NULL DEFAULT 1
* `purchase_price` NUMERIC(12,2) NULL
* `purchase_date` DATE NULL
* `estimated_raw_value` NUMERIC(12,2) NULL
* `ownership_status` TEXT NOT NULL DEFAULT 'owned'
* `storage_box` TEXT NULL
* `notes` TEXT NULL
* `front_image_path` TEXT NULL
* `back_image_path` TEXT NULL
* `front_thumb_path` TEXT NULL
* `back_thumb_path` TEXT NULL
* `created_at` TIMESTAMP NOT NULL
* `updated_at` TIMESTAMP NOT NULL

Indexes:

* index on `card_id`
* index on `ownership_status`

### Table: `price_snapshots`

Historical value observations.

Fields:

* `id` UUID PK
* `collection_item_id` UUID FK -> `collection_items.id`
* `provider` TEXT NOT NULL
* `currency` TEXT NOT NULL DEFAULT 'USD'
* `raw_low` NUMERIC(12,2) NULL
* `raw_mid` NUMERIC(12,2) NULL
* `raw_high` NUMERIC(12,2) NULL
* `grade_8_value` NUMERIC(12,2) NULL
* `grade_9_value` NUMERIC(12,2) NULL
* `grade_10_value` NUMERIC(12,2) NULL
* `confidence` NUMERIC(5,2) NULL
* `source_note` TEXT NULL
* `captured_at` TIMESTAMP NOT NULL

Indexes:

* index on `collection_item_id`
* index on `provider`
* index on `captured_at`

### Table: `grade_estimates`

Image-analysis output and pre-grade result.

Fields:

* `id` UUID PK
* `collection_item_id` UUID FK -> `collection_items.id`
* `analyzer_version` TEXT NOT NULL
* `image_quality_score` NUMERIC(5,2) NULL
* `blur_flag` BOOLEAN NOT NULL DEFAULT FALSE
* `glare_flag` BOOLEAN NOT NULL DEFAULT FALSE
* `skew_flag` BOOLEAN NOT NULL DEFAULT FALSE
* `centering_score` NUMERIC(5,2) NULL
* `corners_score` NUMERIC(5,2) NULL
* `edges_score` NUMERIC(5,2) NULL
* `surface_score` NUMERIC(5,2) NULL
* `predicted_grade_low` NUMERIC(4,1) NULL
* `predicted_grade_high` NUMERIC(4,1) NULL
* `confidence` NUMERIC(5,2) NULL
* `summary` TEXT NULL
* `created_at` TIMESTAMP NOT NULL

Indexes:

* index on `collection_item_id`
* index on `created_at`

### Table: `grading_quotes`

Grading cost input and snapshots.

Fields:

* `id` UUID PK
* `collection_item_id` UUID FK -> `collection_items.id`
* `grader` TEXT NOT NULL DEFAULT 'PSA'
* `service_level` TEXT NOT NULL
* `declared_value` NUMERIC(12,2) NULL
* `grading_fee` NUMERIC(12,2) NOT NULL
* `shipping_to_grader` NUMERIC(12,2) NULL
* `return_shipping` NUMERIC(12,2) NULL
* `insurance_cost` NUMERIC(12,2) NULL
* `other_costs` NUMERIC(12,2) NULL
* `total_cost` NUMERIC(12,2) NOT NULL
* `created_at` TIMESTAMP NOT NULL

### Table: `roi_scenarios`

Derived ROI outcomes.

Fields:

* `id` UUID PK
* `collection_item_id` UUID FK -> `collection_items.id`
* `grade_label` TEXT NOT NULL
* `expected_sale_price` NUMERIC(12,2) NOT NULL
* `grading_cost` NUMERIC(12,2) NOT NULL
* `selling_fee_pct` NUMERIC(5,2) NULL
* `selling_fee_amount` NUMERIC(12,2) NULL
* `net_after_fees` NUMERIC(12,2) NOT NULL
* `profit_vs_raw_sale` NUMERIC(12,2) NULL
* `profit_vs_total_cost_basis` NUMERIC(12,2) NULL
* `calculated_at` TIMESTAMP NOT NULL

---

## File Storage Layout

Use a mounted host directory such as `./storage`.

```text
storage/
  originals/
    <collection_item_id>/front.jpg
    <collection_item_id>/back.jpg
  processed/
    <collection_item_id>/front_normalized.jpg
    <collection_item_id>/back_normalized.jpg
    <collection_item_id>/analysis_overlay_front.jpg
    <collection_item_id>/analysis_overlay_back.jpg
  thumbnails/
    <collection_item_id>/front_thumb.jpg
    <collection_item_id>/back_thumb.jpg
```

Rules:

* do not store blobs directly in Postgres
* store file paths in DB
* generate stable filenames
* support image replacement with version-safe overwrite behavior later

---

## API Design

### Web app API responsibilities

The Next.js app can own most CRUD endpoints.

#### `POST /api/cards`

Create a canonical card.

#### `GET /api/cards`

Search cards.

#### `POST /api/collection-items`

Create a collection item.

#### `GET /api/collection-items`

List collection items with filters.

Supported query params:

* `q`
* `game`
* `player`
* `year`
* `owned_status`
* `page`
* `pageSize`

#### `GET /api/collection-items/:id`

Fetch card detail view.

#### `PATCH /api/collection-items/:id`

Update collection item fields.

#### `DELETE /api/collection-items/:id`

Delete collection item and optionally related files.

#### `POST /api/collection-items/:id/images`

Upload front/back images.

* accepts multipart form-data
* stores originals
* generates thumbnails
* optionally triggers analyzer

#### `POST /api/collection-items/:id/price-snapshots`

Create manual price snapshot.

#### `GET /api/collection-items/:id/price-snapshots`

List price history.

#### `POST /api/collection-items/:id/grading-quotes`

Create grading quote.

#### `GET /api/collection-items/:id/roi`

Return computed ROI scenarios using latest price snapshot and grading quote.

### Analyzer service API responsibilities

#### `POST /analyze/card-images`

Input:

* collection item id
* front image path
* back image path

Output:

* image quality flags
* normalized image paths
* component scores
* predicted grade range
* summary text

#### `POST /analyze/normalize`

Normalize/crop card images only.

#### `POST /analyze/quality`

Return blur/glare/skew/crop quality metrics only.

#### `GET /health`

Health endpoint.

---

## Pre-Grade Logic (MVP)

### Strategy

Use a rules-based scoring pipeline first.

### Steps

1. Validate input image quality.
2. Detect card contour and perspective.
3. Normalize card to a standard rectangle.
4. Estimate centering by measuring border symmetry where possible.
5. Inspect corners for whitening or deformation.
6. Inspect edges for visible chipping/whitening.
7. Inspect surface for obvious glare, scratches, print lines, or dirt where visible.
8. Produce component scores from 1 to 10.
9. Map scores to an estimated overall grade band.

### Example output payload

```json
{
  "image_quality_score": 84.2,
  "blur_flag": false,
  "glare_flag": true,
  "skew_flag": false,
  "centering_score": 8.5,
  "corners_score": 7.5,
  "edges_score": 8.0,
  "surface_score": 7.0,
  "predicted_grade_low": 7.0,
  "predicted_grade_high": 8.0,
  "confidence": 0.63,
  "summary": "Visible glare reduces certainty. Corners show mild whitening. Centering appears above average."
}
```

### Important product language

The UI must label this as:

* `AI Pre-Grade Estimate`
* `Not an official PSA grade`

---

## ROI Calculation Logic

### Inputs

* latest raw price snapshot
* graded value assumptions
* grading quote total cost
* optional selling fee percent
* purchase cost basis

### Outputs

For each grade scenario:

* expected sale price
* fees
* grading cost
* net proceeds
* profit versus raw sale
* profit versus total cost basis

### Formula examples

* `selling_fee_amount = expected_sale_price * selling_fee_pct`
* `net_after_fees = expected_sale_price - selling_fee_amount - grading_cost`
* `profit_vs_total_cost_basis = net_after_fees - purchase_price`

### Default scenarios

* raw sale
* PSA 8
* PSA 9
* PSA 10

Later enhancement:

* weighted expected value using grade probability distribution

---

## Frontend Pages

### 1. Dashboard

Shows:

* total cards
* total cost basis
* latest estimated collection value
* cards missing price data
* cards missing images
* cards pending analysis

### 2. Collection List

Shows table/grid with:

* thumbnail
* card title
* set/year
* raw estimate
* predicted grade band
* ROI indicator
* last updated

Features:

* search
* filters
* sort by value, year, player, recently updated

### 3. Add Card Page

Sections:

* game/sport
* year
* set
* player/character
* card number
* parallel/variation
* purchase details
* front/back upload

### 4. Card Detail Page

Blocks:

* Card summary
* Your item details
* Images
* Pre-grade estimate
* Price history
* Grading quote
* ROI calculator

### 5. Price Entry Page or Modal

Allows manual raw/graded price entry.

### 6. Settings Page

For MVP:

* storage path status
* analyzer health
* optional provider toggles
* default selling fee percent
* default grading cost assumptions

---

## UI Component Plan

Core components:

* `CollectionTable`
* `CollectionFilters`
* `CardForm`
* `ImageUploader`
* `ImagePreview`
* `GradeEstimateCard`
* `PriceSnapshotCard`
* `GradingQuoteForm`
* `RoiScenarioTable`
* `ValueBadge`
* `StatusPill`

---

## Docker Compose Plan

### Services overview

* `web`
* `db`
* `analyzer`

### Volumes

* `postgres_data`
* `./storage:/app/storage`

### Environment variables

#### Web

* `DATABASE_URL`
* `ANALYZER_URL`
* `STORAGE_ROOT`
* `NEXT_PUBLIC_APP_NAME`

#### Analyzer

* `STORAGE_ROOT`
* `LOG_LEVEL`

#### DB

* `POSTGRES_DB`
* `POSTGRES_USER`
* `POSTGRES_PASSWORD`

### Example compose outline

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: cards
      POSTGRES_USER: cards
      POSTGRES_PASSWORD: change_me
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  analyzer:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.analyzer
    restart: unless-stopped
    environment:
      STORAGE_ROOT: /app/storage
    volumes:
      - ./storage:/app/storage
    ports:
      - "8000:8000"

  web:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.web
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://cards:change_me@db:5432/cards
      ANALYZER_URL: http://analyzer:8000
      STORAGE_ROOT: /app/storage
    depends_on:
      - db
      - analyzer
    volumes:
      - ./storage:/app/storage
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

Note: exposing Postgres to the host is optional. Remove that port in a more locked-down setup.

---

## Recommended Tech Choices

### Web

* Next.js 14+
* TypeScript
* App Router
* Tailwind CSS
* server actions or route handlers
* React Hook Form + Zod
* Prisma or Drizzle ORM

Recommendation: **Prisma** for faster MVP delivery.

### Analyzer

* FastAPI
* OpenCV
* Pillow
* NumPy
* scikit-image as needed

### Database

* PostgreSQL 16

### Jobs

For MVP, avoid a separate queue. Run analysis synchronously after upload if fast enough.
If it becomes slow, add a worker later.

---

## Implementation Order for Codex

### Milestone 1: Foundation

* initialize monorepo or single repo
* set up Docker Compose
* add Postgres
* create Next.js app
* create FastAPI analyzer skeleton
* add health checks
* verify local network access

### Milestone 2: Database and CRUD

* define schema
* run migrations
* build card and collection item CRUD
* build collection list page
* build card detail page

### Milestone 3: Image Uploads

* implement front/back image upload
* save originals to disk
* generate thumbnails
* show previews in UI

### Milestone 4: Analyzer MVP

* implement normalize endpoint
* implement quality checks
* implement basic centering/corner/edge/surface scoring
* store grade estimate result
* render grade estimate UI

### Milestone 5: Pricing + ROI

* manual price snapshot entry
* grading quote entry
* ROI scenario calculation endpoint
* ROI display table/cards

### Milestone 6: Polish

* search and filters
* dashboard summary
* better validation
* error handling
* empty states

---

## Acceptance Criteria for MVP

### Functional

* user can create, edit, view, and delete collection items
* user can upload front/back images for a card
* images persist across container restarts
* analyzer can run and store a grade estimate
* user can enter manual price data
* user can enter grading cost data
* app can show ROI scenarios
* app works on local network from another device

### Operational

* app starts with one Docker Compose command
* persistent data survives restart
* no paid services required
* no cloud account required

---

## Risks and Mitigations

### Risk: grading estimates are inaccurate

Mitigation:

* position as advisory only
* store confidence score
* show quality warnings
* show component breakdown instead of only final score

### Risk: image quality is inconsistent

Mitigation:

* add upload guidance
* add blur/glare/skew flags
* allow retake flow

### Risk: pricing data is incomplete

Mitigation:

* manual pricing first
* snapshot model supports later provider integration

### Risk: canonical card records become messy

Mitigation:

* keep `cards` separate from `collection_items`
* avoid over-automating card identity in MVP

---

## Future Extensions

* OCR and image-based card identification
* CSV bulk import
* eBay/TCGplayer/PSA connectors
* batch grading submission planner
* grade probability distributions
* portfolio charts
* alerts for value movement
* user auth and multi-user mode
* reverse proxy with TLS on LAN

---

## Codex Build Prompt

Use this as the starting implementation instruction.

```text
Build a self-hosted trading card collection MVP using Next.js, TypeScript, PostgreSQL, FastAPI, Docker Compose, and local filesystem storage.

Requirements:
- local-network accessible web UI
- CRUD for canonical cards and collection items
- front/back image upload stored on local disk
- thumbnail generation
- PostgreSQL persistence
- FastAPI analyzer service with endpoints for normalize, quality check, and pre-grade estimate
- UI pages: dashboard, collection list, add card, card detail, settings
- manual price snapshot entry
- grading quote entry
- ROI scenario calculation and display
- use a clean, modular folder structure
- include Dockerfiles and docker-compose.yml
- include DB migrations and seed/dev setup
- use advisory language for grade estimate
- design pricing providers as pluggable, but implement manual provider first

Prefer pragmatic MVP decisions over overengineering.
```

---

## First Tasks for Codex

1. Create repository structure.
2. Add Docker Compose with `web`, `db`, and `analyzer`.
3. Scaffold Next.js and FastAPI apps.
4. Add initial schema and migrations.
5. Implement collection item CRUD.
6. Implement image upload and thumbnail generation.
7. Implement analyzer stub returning mock pre-grade data.
8. Build card detail page showing images, price entry, quote entry, and ROI section.
9. Replace mock analyzer with real OpenCV logic.

---

## Definition of Done for First Usable Release

A user on the local network can open the app in a browser, add a card, upload front/back images, save price data, run a pre-grade estimate, enter grading costs, and view ROI results without using any external paid service.
