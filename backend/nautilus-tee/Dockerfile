# Nautilus TEE Server Dockerfile
# Builds AWS Nitro Enclave image for secure off-chain computation

FROM public.ecr.aws/docker/library/rust:1.75-slim as builder

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy source
COPY Cargo.toml Cargo.lock ./
COPY src ./src

# Build release
RUN cargo build --release

# Final stage - minimal image for Nitro Enclave
FROM public.ecr.aws/docker/library/debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binary
COPY --from=builder /app/target/release/nautilus-tee-server /app/nautilus-tee-server

# Expose port (Nitro Enclave uses VSOCK, but we expose HTTP for local testing)
EXPOSE 8080

# Run server
CMD ["/app/nautilus-tee-server"]

