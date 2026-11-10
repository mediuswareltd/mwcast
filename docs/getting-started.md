# Getting started

Run **MW Cast** on your machine.

## 1. Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Rust](https://www.rust-lang.org/tools/install) — only needed for local backend development
- [Node.js](https://nodejs.org/) (v18+) — only needed for local frontend development

### 1. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set the required values:

```env
# Backend
DATABASE_URL=postgres://mwcast:mwcast@localhost:5432/mwcast
JWT_SECRET=your_strong_secret_here
API_BASE_URL=http://localhost:8080
FRONTEND_URL=http://localhost

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Kafka
KAFKA_BROKERS=localhost:9092

# Media server
MEDIA_SERVER_URL=rtmp://localhost:1935
```

### 2. Start the full stack

```bash
docker-compose up -d
```

This starts PostgreSQL, Kafka, MediaMTX, the Rust backend, and Caddy. SQLx migrations run automatically on backend startup.

The application is available at `http://localhost` (proxied by Caddy).

### 3. Run the backend locally (optional)

```bash
cd backend
cargo run
```

The API will be available at `http://localhost:8080`.

To run migrations manually:
```bash
cargo install sqlx-cli
sqlx migrate run --database-url postgres://mwcast:mwcast@localhost:5432/mwcast
```

---

## 2. Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Rust](https://www.rust-lang.org/tools/install) — only needed for local backend development
- [Node.js](https://nodejs.org/) (v18+) — only needed for local frontend development

### 1. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set the required values:

```env
# Backend
DATABASE_URL=postgres://mwcast:mwcast@localhost:5432/mwcast
JWT_SECRET=your_strong_secret_here
API_BASE_URL=http://localhost:8080
FRONTEND_URL=http://localhost

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Kafka
KAFKA_BROKERS=localhost:9092

# Media server
MEDIA_SERVER_URL=rtmp://localhost:1935
```

### 2. Start the full stack

```bash
docker-compose up -d
```

This starts PostgreSQL, Kafka, MediaMTX, the Rust backend, and Caddy. SQLx migrations run automatically on backend startup.

The application is available at `http://localhost` (proxied by Caddy).

### 3. Run the backend locally (optional)

```bash
cd backend
cargo run
```

The API will be available at `http://localhost:8080`.

To run migrations manually:
```bash
cargo install sqlx-cli
sqlx migrate run --database-url postgres://mwcast:mwcast@localhost:5432/mwcast
```

---

## Next

- Full detail: [Guide](/guide)
- Source: [github.com/mediuswareltd/mwcast](https://github.com/mediuswareltd/mwcast)
