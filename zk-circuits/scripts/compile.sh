#!/bin/bash

# Compile ZK circuits for LUMINA
# This script compiles tax_proof, kyc_proof, and origin_proof circuits

set -e

echo "Compiling ZK circuits..."

# Compile tax proof circuit
echo "Compiling tax_proof.circom..."
circom tax_proof.circom --r1cs --wasm --sym

# Compile KYC proof circuit
echo "Compiling kyc_proof.circom..."
circom kyc_proof.circom --r1cs --wasm --sym

# Compile origin proof circuit
echo "Compiling origin_proof.circom..."
circom origin_proof.circom --r1cs --wasm --sym

echo "All circuits compiled successfully!"

