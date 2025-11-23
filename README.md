# Lumina

**Preserve your memories forever on the blockchain, encrypted and sealed until conditions are met.**

Lumina is a decentralized platform for creating time-locked memory capsules. Upload photos, videos, or voice recordings, encrypt them, and set unlock conditions. Your memories are stored on-chain as NFTs and sealed until time passes, manual unlock, or inheritance conditions are met.

## Features

- **Encrypted Storage**: Memories are encrypted using Lit Protocol before being stored on Walrus decentralized storage
- **Time-Locked Capsules**: Set a future date when your memory will unlock
- **Manual Unlock**: Instant access to your memories anytime
- **Inheritance**: Configure inheritance policies so loved ones can access your memories if you become inactive
- **NFT Minting**: Each memory is minted as an NFT on Sui blockchain, providing permanent ownership
- **Multiple Input Methods**: Upload files, record voice, or capture video directly
- **Progress Tracking**: Visual progress bars show how close time-locked memories are to unlocking

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Blockchain**: Sui Network
- **Storage**: Walrus (decentralized storage)
- **Encryption**: Lit Protocol (threshold encryption)
- **Database**: MySQL
- **Smart Contracts**: Move language on Sui

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8+
- Sui CLI (for blockchain interactions)
- Wallet with Sui testnet tokens

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Lumina
```

2. Install dependencies:
```bash
npm install
cd frontend && npm install
cd ../backend && npm install
```

3. Set up environment variables:
```bash
# Backend
cp backend/lit.env.sample backend/.env
cp backend/seal.env.sample backend/.env

# Frontend
cp frontend/lit.env.sample frontend/.env
```

4. Configure your `.env` files with:
   - Sui network RPC endpoints
   - Walrus storage credentials
   - Lit Protocol keys
   - MySQL database connection
   - API keys

5. Set up the database:
```bash
cd backend
npm run setup-db
```

6. Start the development servers:
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

## Project Structure

```
Lumina/
├── frontend/          # React frontend application
├── backend/           # Node.js backend API
├── move/             # Sui Move smart contracts
├── zk-circuits/      # Zero-knowledge proof circuits
└── scripts/          # Deployment and utility scripts
```

## Usage

1. **Connect Wallet**: Connect your Sui wallet to the application
2. **Add Memory**: Click "Add Memory" tab and upload your file
3. **Set Unlock Condition**: Choose time-locked or manual unlock
4. **Seal Capsule**: Your memory is encrypted and sealed on-chain
5. **View Progress**: Track time-locked memories in "My Vault"
6. **Unlock**: Access your memories when conditions are met

## Development

### Backend API

The backend provides RESTful APIs for:
- Capsule upload and encryption
- NFT minting
- Unlock condition management
- Inheritance policy configuration
- Memory retrieval and decryption

### Smart Contracts

Move contracts handle:
- Capsule NFT minting
- Time-lock policies
- Inheritance policies
- Unlock verification

## License

[Your License Here]

## Contributing

[Contributing guidelines]

## Support

[Support information]

