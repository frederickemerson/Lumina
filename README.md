# 🌟 Lumina

> **Preserve your memories forever on the blockchain, encrypted and sealed until conditions are met.**

[![Built on Sui](https://img.shields.io/badge/Built%20on-Sui-6fbcf0?style=flat-square)](https://sui.io)
[![Powered by Walrus](https://img.shields.io/badge/Powered%20by-Walrus-ff6b6b?style=flat-square)](https://walrus.space)
[![Seal Protocol](https://img.shields.io/badge/Encrypted%20with-Seal-00d4aa?style=flat-square)](https://seal.wal.app)

**Lumina** is a decentralized platform that lets you create time-locked memory capsules. Upload any file—photos, videos, audio, documents, or text—encrypt them with Seal Protocol, store them on Walrus decentralized storage, and mint them as NFTs on Sui. Your memories are sealed until time passes, conditions are met, or inheritance policies trigger.

## 🏆 Built for the Walrus Auto Hackathon

Lumina showcases the full power of the Walrus ecosystem:
- **Deep Walrus Integration**: Direct blob storage, relay optimization, and metadata management
- **Seal Protocol Encryption**: Threshold encryption for true privacy
- **Sui Blockchain**: Fast, scalable NFT minting and on-chain policies
- **Production-Ready**: Complete backend, frontend, and smart contracts

## ✨ Key Features

### 🔒 **True Privacy & Security**
- **Seal Protocol Encryption**: End-to-end threshold encryption before storage
- **Walrus Decentralized Storage**: Permanent, immutable blob storage
- **Zero-Knowledge Proofs**: Optional origin verification proving content authenticity
- **No Central Authority**: You control your memories—we can't access them

### ⏰ **Programmable Unlock Conditions**
- **Time-Locked**: Set a future date when your memory unlocks
- **Manual Unlock**: Instant access anytime you want
- **Multi-Party**: Shared ownership with quorum threshold (N-of-M approval)
- **Inheritance**: Automatically unlock for loved ones if you become inactive
- **Secret Phrase**: Public unlock with shareable secret phrases
- **Location-Based**: Unlock when you reach a specific location (coming soon)

### 🎨 **Rich Media Support**
- **All File Types**: Images, videos, audio, documents, archives, code—anything!
- **Voice Recording**: Built-in voice recorder for audio memories
- **Video Capture**: Direct video recording from browser
- **Combined Payloads**: Upload file + message + voice in one capsule
- **AI-Generated Haikus**: Beautiful AI descriptions for your memories

### 🖼️ **NFT Integration**
- **Automatic Minting**: Each memory becomes an NFT on Sui
- **Dynamic Metadata**: NFT metadata updates as memories unlock
- **Glow Intensity**: Visual representation of unlock progress
- **Soulbound Option**: Make NFTs non-transferable if desired
- **On-Chain Policies**: Time-lock and inheritance enforced on-chain

### 👨‍👩‍👧‍👦 **Social Features**
- **Contributions**: Multiple people can add to the same capsule
- **Inheritance Claims**: Heirs can claim memories when conditions are met
- **Public Sharing**: Share memories with secret phrases (no wallet required)
- **Provenance Tracking**: Complete audit trail of all access and changes

### 🎯 **Advanced Capabilities**
- **Dead Man's Switch**: Automatic release if check-ins are missed
- **AR Integration**: QR codes and AR anchors for physical-world connections
- **Provenance Service**: Immutable record of all capsule interactions
- **Batch Operations**: Efficient bulk unlock info retrieval
- **Progress Visualization**: Beautiful progress bars for time-locked memories

## 🛠️ Tech Stack

### **Frontend**
- **React 18** + **TypeScript** - Modern, type-safe UI
- **Vite** - Lightning-fast build tool
- **Sui Wallet Kit** - Seamless wallet integration
- **Canvas Animations** - Beautiful tentacle orb effects
- **React Router** - Client-side routing

### **Backend**
- **Node.js** + **Express** + **TypeScript** - Robust API server
- **MySQL** - Reliable data persistence
- **Seal Protocol SDK** - Threshold encryption
- **Walrus SDK** - Decentralized storage integration
- **Sui TypeScript SDK** - Blockchain interactions

### **Blockchain**
- **Sui Network** - Fast, scalable blockchain
- **Move Language** - Smart contracts for capsules, NFTs, and policies
- **On-Chain Policies** - Time-lock and inheritance enforcement

### **Storage & Encryption**
- **Walrus** - Decentralized blob storage with relay optimization
- **Seal Protocol** - Threshold encryption with access policies
- **Snappy Compression** - Efficient data compression

### **Advanced Features**
- **Zero-Knowledge Proofs** - Circom circuits for origin verification
- **Nautilus TEE** - Trusted execution environment for proof generation
- **AR Sync Service** - WebSocket service for AR anchor synchronization

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **MySQL** 8+ (or compatible database)
- **Sui CLI** (for blockchain interactions)
- **Wallet** with Sui testnet tokens

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd Lumina
```

2. **Install dependencies:**
```bash
# Root
npm install

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. **Set up environment variables:**

**Backend** (`backend/.env`):
```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=lumina

# Sui Network
SUI_NETWORK_URL=https://fullnode.testnet.sui.io:443
CAPSULE_PACKAGE_ID=your_package_id

# Walrus
WALRUS_NETWORK=testnet
WALRUS_SERVICE_KEYPAIR=your_keypair

# Seal Protocol
SEAL_API_URL=your_seal_api_url
SEAL_API_KEY=your_seal_api_key

# Server
PORT=3001
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:3001
```

4. **Initialize the database:**
```bash
cd backend
npm run setup-db
```

5. **Start development servers:**

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

6. **Open your browser:**
Navigate to `http://localhost:5173` and connect your Sui wallet!

## 📁 Project Structure

```
Lumina/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API clients and services
│   │   ├── contexts/       # React contexts
│   │   └── styles/         # Theme and styling
│   └── public/             # Static assets
│
├── backend/                 # Node.js backend API
│   ├── src/
│   │   ├── api/            # API routes
│   │   │   └── capsule/    # Modular capsule endpoints
│   │   ├── services/       # Business logic services
│   │   ├── middleware/     # Express middleware
│   │   ├── db/             # Database utilities
│   │   └── utils/          # Helper functions
│   └── nautilus-tee/       # TEE service for ZK proofs
│
├── move/                    # Sui Move smart contracts
│   ├── sources/
│   │   ├── capsule.move    # Capsule management
│   │   ├── capsule_nft.move # NFT minting
│   │   ├── vault.move      # User vaults
│   │   ├── seal_policy.move # Seal access policies
│   │   └── dead_man_switch.move # Dead man's switch
│   └── scripts/            # Deployment scripts
│
└── zk-circuits/            # Zero-knowledge proof circuits
    ├── origin_proof.circom # Origin verification circuit
    └── origin_proof_js/    # Circuit compilation artifacts
```

## 🎮 Usage Guide

### Creating a Memory Capsule

1. **Connect Wallet**: Click "Connect Wallet" and approve the connection
2. **Add Memory**: Navigate to "Add Memory" tab
3. **Upload File**: Choose a file, record voice, or capture video
4. **Add Details**: Enter description, optional message, and tags
5. **Set Unlock Condition**:
   - **Time-Locked**: Select a future date/time
   - **Manual**: Unlock anytime
   - **Multi-Party**: Add shared owners and quorum threshold
   - **Inheritance**: Configure fallback addresses and inactive period
6. **Seal Capsule**: Click "Create Capsule" and approve the transaction
7. **View NFT**: Your memory is now an NFT in "My Vault"

### Unlocking a Memory

1. **View Vault**: Navigate to "My Vault" to see all your memories
2. **Check Progress**: Time-locked memories show progress bars
3. **Unlock**: Click "View Memory" and then "Unlock Now"
4. **Decrypt**: Your memory is decrypted using Seal Protocol
5. **Enjoy**: View, download, or share your unlocked memory

### Sharing Memories

1. **Generate Secret Phrase**: In memory settings, generate a secret phrase
2. **Share Link**: Share the memory link with anyone
3. **Public Unlock**: Recipients can unlock using the secret phrase (no wallet needed)

### Inheritance Setup

1. **Configure Inheritance**: In memory settings, add fallback addresses
2. **Set Inactive Period**: Define days of inactivity before auto-transfer
3. **Enable Auto-Transfer**: Toggle automatic transfer when inactive
4. **Heirs Claim**: Designated heirs can claim memories when eligible

## 🔧 Development

### Backend API

The backend provides comprehensive REST APIs:

- `POST /api/capsule/upload` - Upload and encrypt a memory
- `GET /api/capsule/:capsuleId` - Get capsule metadata
- `POST /api/capsule/:capsuleId/unlock` - Unlock and decrypt a memory
- `GET /api/capsule/my-nfts` - List user's NFTs
- `POST /api/capsule/batch-unlock-info` - Batch unlock info retrieval
- `POST /api/capsule/:capsuleId/inheritance` - Configure inheritance
- `POST /api/capsule/:capsuleId/contributions` - Add contributions
- `POST /api/capsule/public/unlock` - Public unlock with secret phrase

### Smart Contracts

Move contracts on Sui handle:

- **Capsule Management**: Create, unlock, and manage capsules
- **NFT Minting**: Automatic NFT creation for each memory
- **Time-Lock Policies**: On-chain time-lock enforcement
- **Inheritance Policies**: Automatic transfer on conditions
- **Multi-Party Ownership**: Shared ownership with quorum voting
- **Dead Man's Switch**: Check-in based auto-release

### Walrus Integration

Lumina deeply integrates with Walrus:

- **Blob Storage**: All encrypted memories stored as Walrus blobs
- **Relay Optimization**: Uses Walrus upload relay for efficiency
- **Metadata Management**: Rich metadata stored with blobs
- **Hash Verification**: SHA-256 verification for data integrity
- **Retry Logic**: Robust retry mechanisms for reliability

### Seal Protocol Integration

- **Threshold Encryption**: Encrypts data before Walrus storage
- **Access Policies**: On-chain policies control decryption
- **seal_approve Function**: Move function enforces unlock conditions
- **Automatic Decryption**: Decrypts when conditions are met

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
cd backend
npm run test:e2e
```

## 📦 Building for Production

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend
npm run build

# The frontend build output is in frontend/dist/
# The backend build output is in backend/dist/
```

## 🚢 Deployment

### Backend Deployment

1. Set production environment variables
2. Build: `npm run build`
3. Start: `npm start` or use PM2/forever

### Frontend Deployment

1. Build: `npm run build`
2. Serve `dist/` with nginx, Vercel, or Netlify
3. Configure API URL in environment variables

### Smart Contract Deployment

```bash
cd move
sui client publish --gas-budget 100000000
```

## 🔐 Security Features

- **CSRF Protection**: Token-based CSRF protection
- **Input Sanitization**: All user input sanitized
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Magic Number Validation**: File type verification
- **Hash Verification**: Data integrity checks
- **Secure Headers**: Security headers middleware

## 📊 Architecture Highlights

- **Modular Design**: Clean separation of concerns
- **Type Safety**: Full TypeScript coverage
- **Error Handling**: Comprehensive error handling and logging
- **Caching**: Intelligent caching for performance
- **Batch Operations**: Efficient bulk operations
- **Provenance Tracking**: Immutable audit trails

## 🌐 API Documentation

### Authentication

Currently, authentication is optional for viewing memories. State-changing operations may require wallet signatures in the future.

### Rate Limiting

- Upload endpoints: 10 requests per minute
- Public unlock: 5 requests per minute
- Other endpoints: 100 requests per minute

### Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

- **Walrus** - Decentralized storage infrastructure
- **Seal Protocol** - Threshold encryption
- **Sui Foundation** - Blockchain infrastructure
- **Nautilus** - TEE infrastructure for ZK proofs

## 🔮 Future Works

### Short-Term (Next 3 Months)

- **Mobile App**: Native iOS and Android applications
- **Location-Based Unlock**: GPS-based unlock conditions
- **Biometric Unlock**: Face ID / Touch ID integration
- **Enhanced ZK Proofs**: Full origin verification with device attestation
- **Multi-Chain Support**: Extend to other blockchains
- **Social Features**: Comments, reactions, and sharing improvements
- **Batch Upload**: Upload multiple files at once
- **Folder Organization**: Organize memories into folders/collections

### Medium-Term (3-6 Months)

- **AI Memory Assistant**: AI-powered memory organization and search
- **Memory Timeline**: Visual timeline of all memories
- **Collaborative Capsules**: Real-time collaborative editing
- **Memory Analytics**: Insights and statistics about your memories
- **Export/Import**: Bulk export and import functionality
- **Advanced Search**: Full-text search across all memories
- **Memory Templates**: Pre-configured capsule templates
- **Integration APIs**: Webhooks and third-party integrations

### Long-Term (6+ Months)

- **Decentralized Identity**: Self-sovereign identity integration
- **Cross-Chain Bridge**: Bridge memories across blockchains
- **Memory Marketplace**: Buy/sell memory NFTs
- **Memory Staking**: Earn rewards for long-term storage
- **DAO Governance**: Community governance for platform decisions
- **Memory Insurance**: Insurance for lost or corrupted memories
- **Quantum-Resistant Encryption**: Post-quantum cryptography
- **Memory AI**: AI that learns from your memories to create new ones

### Research & Development

- **Homomorphic Encryption**: Compute on encrypted memories without decryption
- **Federated Learning**: Privacy-preserving AI training on memories
- **Memory Compression**: Advanced compression algorithms
- **Distributed Storage**: Redundant storage across multiple networks
- **Zero-Knowledge Search**: Search encrypted memories without revealing content
- **Memory Provenance**: Advanced provenance tracking with ZK proofs
- **Interoperability**: Standards for memory portability

## 📞 Support

- **Documentation**: [Link to docs]
- **Discord**: [Discord server]
- **Twitter**: [@LuminaApp]
- **Email**: support@lumina.app

## 🎯 Roadmap

See our [GitHub Projects](https://github.com/your-org/lumina/projects) for detailed roadmap and milestones.

---

**Built with ❤️ for the Walrus Auto Hackathon**

*Preserving memories, one blockchain at a time.*
