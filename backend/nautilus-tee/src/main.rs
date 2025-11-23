/**
 * Nautilus TEE Server
 * Runs in AWS Nitro Enclave for secure off-chain computation
 * 
 * Handles:
 * - Biometric verification (privacy-preserving)
 * - Proof-of-life monitoring
 * - ZK proof generation (in enclave)
 * - Attestation generation (AWS-signed)
 */

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

mod attestation;
mod biometric;
mod liveness;
mod zk_proof;

use attestation::AttestationService;
use biometric::BiometricService;
use liveness::LivenessService;
use zk_proof::ZKProofService;

#[derive(Clone)]
struct AppState {
    attestation: Arc<AttestationService>,
    biometric: Arc<BiometricService>,
    liveness: Arc<LivenessService>,
    zk_proof: Arc<ZKProofService>,
}

#[derive(Deserialize)]
struct BiometricVerifyRequest {
    vault_id: String,
    biometric_data: String, // Base64 encoded
    method: String, // fingerprint, face, voice
}

#[derive(Serialize)]
struct BiometricVerifyResponse {
    verified: bool,
    attestation: attestation::Attestation,
    confidence: f64,
}

#[derive(Deserialize)]
struct LivenessCheckRequest {
    vault_id: String,
    user_address: String,
}

#[derive(Serialize)]
struct LivenessCheckResponse {
    alive: bool,
    last_seen: String,
    confidence: f64,
    attestation: Option<attestation::Attestation>,
}

#[derive(Deserialize)]
struct ZKProofRequest {
    vault_id: String,
    claim_type: String,
    claim_value: serde_json::Value,
    encrypted_data: String, // Base64 encoded encrypted blob
}

#[derive(Serialize)]
struct ZKProofResponse {
    proof: serde_json::Value,
    public_signals: Vec<String>,
    attestation: attestation::Attestation,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    info!("Starting Nautilus TEE Server");

    // Initialize services
    let attestation = Arc::new(AttestationService::new());
    let biometric = Arc::new(BiometricService::new());
    let liveness = Arc::new(LivenessService::new());
    let zk_proof = Arc::new(ZKProofService::new());

    let state = AppState {
        attestation,
        biometric,
        liveness,
        zk_proof,
    };

    // Build router
    let app = Router::new()
        .route("/health", get(health))
        .route("/biometric/verify", post(biometric_verify))
        .route("/liveness/check", post(liveness_check))
        .route("/zk/generate", post(zk_generate))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Listen on port 8080 (or VSOCK for Nitro Enclave)
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080")
        .await
        .expect("Failed to bind to port 8080");

    info!("Nautilus TEE Server listening on port 8080");

    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}

async fn health() -> StatusCode {
    StatusCode::OK
}

async fn biometric_verify(
    State(state): State<AppState>,
    Json(request): Json<BiometricVerifyRequest>,
) -> Result<Json<BiometricVerifyResponse>, StatusCode> {
    info!("Biometric verification request: vault_id={}", request.vault_id);

        // Decode biometric data
        let biometric_bytes = base64::engine::general_purpose::STANDARD
            .decode(&request.biometric_data)
            .map_err(|_| StatusCode::BAD_REQUEST)?;

    // Process biometric in enclave (privacy-preserving)
    let result = state
        .biometric
        .verify(&biometric_bytes, &request.method)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Generate attestation
    let attestation = state
        .attestation
        .generate(&request.vault_id, "biometric_verification")
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(BiometricVerifyResponse {
        verified: result.verified,
        attestation,
        confidence: result.confidence,
    }))
}

async fn liveness_check(
    State(state): State<AppState>,
    Json(request): Json<LivenessCheckRequest>,
) -> Result<Json<LivenessCheckResponse>, StatusCode> {
    info!("Liveness check request: vault_id={}", request.vault_id);

    let result = state
        .liveness
        .check(&request.vault_id, &request.user_address)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Generate attestation if alive
    let attestation = if result.alive {
        Some(
            state
                .attestation
                .generate(&request.vault_id, "liveness_check")
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        )
    } else {
        None
    };

    Ok(Json(LivenessCheckResponse {
        alive: result.alive,
        last_seen: result.last_seen,
        confidence: result.confidence,
        attestation,
    }))
}

async fn zk_generate(
    State(state): State<AppState>,
    Json(request): Json<ZKProofRequest>,
) -> Result<Json<ZKProofResponse>, StatusCode> {
    info!("ZK proof generation request: vault_id={}, claim_type={}", request.vault_id, request.claim_type);

    // Decode encrypted data
    let encrypted_bytes = base64::engine::general_purpose::STANDARD
        .decode(&request.encrypted_data)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    // Generate ZK proof in enclave (privacy-preserving - data never leaves enclave)
    let proof_result = state
        .zk_proof
        .generate(&request.claim_type, &request.claim_value, &encrypted_bytes)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Generate attestation
    let attestation = state
        .attestation
        .generate(&request.vault_id, "zk_proof_generation")
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ZKProofResponse {
        proof: proof_result.proof,
        public_signals: proof_result.public_signals,
        attestation,
    }))
}

