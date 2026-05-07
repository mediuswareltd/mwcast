# MW Cast

**MW Cast** is a high-performance live media streaming platform. It features a complete architecture for broadcasting, real-time video streaming, and live chat, consisting of a modern React frontend, a robust Rust backend API, and scalable media and messaging infrastructure.

##  Architecture & Tech Stack

MW Cast is structured as a full-stack application with microservices orchestrated via Docker Compose:

### Frontend (`/frontend`)
A modern, responsive user interface.
- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS, Framer Motion
- **Routing:** React Router

### Backend API (`/backend`)
A high-performance back-end service to manage users, streams, chat, and application state.
- **Language:** Rust
- **Web Framework:** Actix-web
- **Database ORM/Driver:** SQLx
- **Async Runtime:** Tokio
- **Message Broker Client:** rdkafka (Kafka)

### Infrastructure (Docker Compose)
The necessary services for data persistence, live media, and real-time messaging:
- **Database:** PostgreSQL (Stores relational data, user configurations, and metadata)
- **Media Server:** MediaMTX (A ready-to-use routing server for RTMP, WebRTC, HLS, etc.)
- **Message Queue:** Kafka (KRaft mode, for high-throughput messaging, events, and potentially live chat)

---

##  Project Structure

```text
mwcast/
├── backend/               # Rust API Source Code
│   ├── src/               # Rust source code
│   ├── migrations/        # SQLx database migrations
│   ├── Cargo.toml         # Rust dependencies
│   └── Dockerfile         # Docker build for the backend API
├── frontend/              # React App Source Code
│   ├── src/               # UI components, pages, hooks, etc.
│   ├── package.json       # Node dependencies
│   └── vite.config.js     # Vite configuration
├── data/                  # Docker mapped data volumes (e.g., PostgreSQL data)
├── docker-compose.yml     # Infrastructure orchestration config
├── mediamtx.yml           # MediaMTX configuration file
├── .env.example           # Example environment variables
└── README.md              # Project documentation (this file)
```

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your system:
- [Docker](https://www.docker.com/) and Docker Compose
- [Rust](https://www.rust-lang.org/tools/install) (cargo, rustc) - *Optional, if running backend locally*
- [Node.js](https://nodejs.org/) (v16+) and npm/yarn - *For running the frontend natively*

---

##  Getting Started

### 1. Setup Environment Variables
Clone the `.env.example` file to create your own local `.env` configuration.
```bash
cp .env.example .env
```
*(Review and customize values such as passwords or external URLs as needed.)*

### 2. Start the Backend Infrastructure
The project comes with a `docker-compose.yml` file to spin up PostgreSQL, Kafka, MediaMTX, and the Rust backend API.

Run the following format to deploy the stack:
```bash
docker-compose up -d
```
*Note: The backend service will build the Rust binary and connect to Postgres, Kafka, and MediaMTX. Migrations should automatically run (or consult the `/backend` README for `sqlx-cli` commands).*

### 3. Start the Frontend
The frontend needs to run via Node.js locally for active development.

```bash
cd frontend
npm install
npm run dev
```

The React app will typically be available at `http://localhost:5173` (or as configured by Vite). It will communicate with the backend API listening on `http://localhost:8080`.

---

##  Media Streaming Details
MW Cast heavily leverages MediaMTX for video data routing. 

- **RTMP Ingestion:** `rtmp://localhost:1935` (Broadcasters push streams here)
- **WebRTC/HLS Playback:** Viewed by the clients in the frontend through the ports configured in `docker-compose.yml` (`8888` for HLS, `8889` for WebRTC).
