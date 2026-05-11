<p align="center">
  <img src="arts/logo-v2.png" alt="Shannon logo" width="200px" height="200px" />
</p>

# MW Cast

**MW Cast** is a high-performance live media streaming platform. Hosts can start streams, share unique URLs, and interact with viewers via real-time chat. It supports low-latency video delivery using RTMP ingestion, multi-resolution HLS/WebRTC playback, and scalable WebSocket chat backed by Kafka.

---

## Architecture & Tech Stack

MW Cast is a full-stack application orchestrated via Docker Compose.

### Backend (`/backend`)
A high-performance API service built in Rust.

| Concern | Library |
|---|---|
| Web framework | Actix-web 4 |
| Async runtime | Tokio |
| Database driver | SQLx 0.8 (PostgreSQL) |
| Migrations | SQLx migrate |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| OAuth | Google OAuth 2.0 (PKCE flow) |
| Message broker | rdkafka (Kafka KRaft) |
| WebSocket | actix-ws |
| Validation | validator |
| Logging | tracing + tracing-appender |

### Infrastructure (Docker Compose)

| Service | Purpose |
|---|---|
| PostgreSQL | Relational data — users, streams |
| Kafka (KRaft) | Chat message queue, one topic per stream |
| MediaMTX | RTMP ingestion, HLS & WebRTC playback, multi-resolution transcoding |
| Caddy | Reverse proxy — routes `/api/*`, `/hls/*`, `/webrtc/*`, and frontend |
| Frontend | React app (proxied via Caddy on port 80) |

---

## Project Structure

```text
mwcast/
├── backend/
│   ├── src/
│   │   ├── handlers/          # HTTP + WebSocket request handlers
│   │   │   ├── auth.rs        # Register, login, Google OAuth, /me
│   │   │   ├── streams.rs     # Start, stop, list, metadata, join
│   │   │   ├── chat.rs        # WebSocket chat with Kafka fan-out
│   │   │   └── health.rs      # Health check
│   │   ├── models/            # Rust structs (User, Stream, request/response types)
│   │   ├── repository/        # SQLx database queries
│   │   ├── chat.rs            # In-memory DashMap of active WebSocket sessions
│   │   ├── config.rs          # Environment-based configuration
│   │   ├── db.rs              # Connection pool setup
│   │   ├── error.rs           # Unified AppError → HTTP response mapping
│   │   ├── extractors.rs      # ValidatedJson extractor
│   │   ├── jwt.rs             # Token creation and verification (HS256, 7-day expiry)
│   │   ├── kafka.rs           # Producer, consumer, admin client helpers
│   │   ├── logger.rs          # Rolling file + stdout logging
│   │   ├── response.rs        # Typed ApiResponse wrapper
│   │   └── routes.rs          # Route registration under /api/v1
│   ├── migrations/            # SQLx migration files
│   ├── Cargo.toml
│   └── Dockerfile
├── caddy/
│   └── Caddyfile              # Reverse proxy configuration
├── data/
│   └── postgres/              # Persistent PostgreSQL data volume
├── .env.example               # Environment variable template
└── README.md
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | Health check |

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register with email + password |
| `POST` | `/auth/login` | No | Login, returns JWT |
| `GET` | `/auth/me` | Bearer | Get current user profile |
| `GET` | `/auth/google` | No | Get Google OAuth redirect URL |
| `GET` | `/auth/google/callback` | No | OAuth callback — redirects to frontend with token |

**Register request:**
```json
{
  "email": "user@example.com",
  "display_name": "Jane",
  "password": "min8chars"
}
```

**Auth response:**
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "Jane",
      "avatar_url": null
    }
  }
}
```

JWT tokens are signed with HS256 and expire after **7 days**.

---

### Streams

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/streams` | No | List all streams |
| `POST` | `/streams/start` | Bearer | Start a new stream |
| `POST` | `/streams/stop` | Bearer (host only) | Stop a running stream |
| `GET` | `/streams/{stream_id}` | No | Get stream metadata |
| `GET` | `/streams/{stream_id}/join` | No | Get viewer playback URLs + chat room ID |

**Start stream request:**
```json
{ "title": "My Stream" }
```

**Start stream response:**
```json
{
  "success": true,
  "data": {
    "stream_id": "uuid",
    "url": "http://<host>/watch/<stream_id>"
  }
}
```

**Join stream response** (multi-resolution HLS + WebRTC):
```json
{
  "success": true,
  "data": {
    "hls_url":      "http://<host>:8888/live/<stream_id>/index.m3u8",
    "hls_720p_url": "http://<host>:8888/live/<stream_id>_720p/index.m3u8",
    "hls_480p_url": "http://<host>:8888/live/<stream_id>_480p/index.m3u8",
    "hls_360p_url": "http://<host>:8888/live/<stream_id>_360p/index.m3u8",
    "hls_240p_url": "http://<host>:8888/live/<stream_id>_240p/index.m3u8",
    "hls_144p_url": "http://<host>:8888/live/<stream_id>_144p/index.m3u8",
    "webrtc_url":   "http://<host>:8889/live/<stream_id>",
    "chat_room_id": "uuid",
    "title": "My Stream",
    "username": "Jane"
  }
}
```

> The media host is derived from the incoming `Host` header, so remote clients automatically receive URLs pointing to the correct server.

---

### WebSocket Chat

```
GET /api/v1/ws/chat/{chat_room_id}?user_id=<uuid>&username=<name>
```

- Upgrades to a WebSocket connection.
- `user_id` and `username` are optional query params — guests are assigned a random ID and a `guest_XXXXXXXX` username.
- The stream must be `live` to connect.
- A Kafka topic (`chat.<stream_id>`) is created when the stream starts and deleted when it stops.
- One Kafka consumer per room fans messages out to all connected clients.

**Incoming message (client → server):**
```json
{
  "type": "chat",
  "message": "Hello!"
}
```

**Broadcast message (server → all clients):**
```json
{
  "type": "chat",
  "message": "Hello!",
  "user_id": "uuid",
  "username": "Jane",
  "timestamp": "2026-04-24T12:00:00Z"
}
```

**System events** (`host_state`, `request_host_state`, `system`) are broadcast in-memory and bypass Kafka for lower latency.

**Join notification** (sent to existing clients when someone connects):
```json
{
  "type": "system",
  "event": "join",
  "username": "Jane"
}
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | VARCHAR(255) UNIQUE | |
| `display_name` | VARCHAR(255) | |
| `password_hash` | VARCHAR(255) | NULL for Google-only accounts |
| `google_id` | VARCHAR(255) UNIQUE | NULL for email/password accounts |
| `avatar_url` | VARCHAR(512) | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `streams`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `host_id` | UUID FK → users | SET NULL on user delete |
| `host_name` | VARCHAR(255) | Denormalized at creation time |
| `title` | VARCHAR(255) | |
| `status` | VARCHAR(50) | `live` or `stopped` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

## Getting Started

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

## Media Streaming

MW Cast uses [MediaMTX](https://github.com/bluenviron/mediamtx) for media routing.

| Protocol | URL | Direction |
|---|---|---|
| RTMP ingestion | `rtmp://localhost:1935/live/<stream_id>` | Host → server |
| HLS playback | `http://localhost:8888/live/<stream_id>/index.m3u8` | Server → viewer |
| WebRTC playback | `http://localhost:8889/live/<stream_id>` | Server → viewer |

Multi-resolution HLS variants (720p, 480p, 360p, 240p, 144p) are served as separate paths when transcoding is configured in `mediamtx.yml`.

---

## Logging

Logs are written to `backend/logs/mwcast.log.<date>` with daily rotation, and also streamed to stdout. Log level is controlled by the `RUST_LOG` environment variable (default: `info`).

---

## Demonstration

https://drive.google.com/file/d/13hWg86fdDvJqCmBK2X7VM3o-X04reut6/view?usp=sharing
