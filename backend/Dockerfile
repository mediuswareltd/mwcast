# Build stage
FROM rust:1.91-slim-bookworm AS builder

WORKDIR /app

# Install dependencies needed for SQLx and rdkafka (SASL/ZLIB/CURL)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libz-dev \
    libcurl4-openssl-dev \
    libsasl2-dev \
    zlib1g-dev \
    cmake \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy the source code
COPY . .

# Build the application
RUN cargo build --release

# Final runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    libz1 \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from the builder stage
COPY --from=builder /app/target/release/backend /app/backend

# Copy the migrations
COPY --from=builder /app/migrations /app/migrations

# Expose the API port
EXPOSE 8080

# Command to run the application
CMD ["./backend"]
