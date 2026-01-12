# Blockchain Public Procurement System

A decentralized public procurement system built on Ethereum that manages the complete lifecycle of public tenders using smart contracts with commit-reveal bidding and milestone-based payments.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Deployment](#deployment)
- [CLI Tool](#cli-tool)
- [Security Analysis](#security-analysis)
- [Gas Analysis](#gas-analysis)
- [Project Structure](#project-structure)

## 🎯 Overview

This project implements a transparent and secure public procurement system on the Ethereum blockchain. It features:

- **Commit-Reveal Bidding**: Prevents front-running attacks by hiding bid amounts during submission
- **Milestone-Based Payments**: Releases funds incrementally as work progresses
- **Auditor Oversight**: Independent auditor approves milestone completions
- **Complete Auditability**: All actions recorded on-chain via events

### Contract Versions

1. **PublicProcurement.sol** (Vulnerable): Contains intentional security flaws for educational purposes
   - Reentrancy vulnerability in milestone payments
   - Timestamp manipulation possible
   - Unsafe ETH transfers

2. **PublicProcurementSecure.sol** (Secure): Production-ready with industry best practices
   - OpenZeppelin ReentrancyGuard
   - Checks-Effects-Interactions pattern
   - Pull payment pattern
   - Dual timestamp/block validation

## ✨ Features

### Tender Lifecycle

1. **Creation**: Owner creates tender with budget, deadlines, and auditor
2. **Bidding (Commit)**: Bidders submit encrypted bid commitments
3. **Revealing**: Bidders reveal their actual bid amounts
4. **Winner Selection**: Lowest valid bid wins automatically
5. **Milestone Payments**: Auditor approves work and releases payments
6. **Completion**: Tender marked complete after all milestones

### Security Features

- **Front-Running Prevention**: Commit-reveal scheme hides bids until reveal phase
- **Reentrancy Protection**: OpenZeppelin guards (secure version)
- **Access Control**: Owner and auditor role enforcement
- **Timestamp Safety**: Dual validation with block numbers (secure version)
- **Pull Payments**: Winners withdraw funds manually (secure version)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Off-Chain Layer                       │
├─────────────────────────────────────────────────────────────┤
│  CLI Tool  │  Web Interface  │  Event Listeners  │  Users   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Web3.js / Ethers.js
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      Blockchain Layer                        │
├─────────────────────────────────────────────────────────────┤
│  Smart Contracts:                                            │
│  ├─ PublicProcurement (Vulnerable)                          │
│  └─ PublicProcurementSecure (Production)                    │
│                                                              │
│  State Storage:                                              │
│  ├─ Tenders (mapping)                                       │
│  ├─ Bids (nested mapping)                                   │
│  └─ Milestone Status                                        │
│                                                              │
│  Events:                                                     │
│  ├─ TenderCreated, BidSubmitted, BidRevealed                │
│  ├─ WinnerSelected, MilestoneCompleted                      │
│  └─ TenderCompleted, TenderCancelled                        │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- MetaMask or similar Web3 wallet (for testnet deployment)

## 🚀 Installation

```bash
# Clone the repository
git clone <repository-url>
cd projet_blockchain

# Install dependencies
npm install --legacy-peer-deps

# Create environment file
cp .env.example .env

# Edit .env with your configuration
# SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
# PRIVATE_KEY=your_private_key_here
# ETHERSCAN_API_KEY=your_etherscan_api_key
```

## 💻 Usage

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
# Run all tests
npm test

# Run security tests only
npm run test:security

# Run with gas reporting
npm run test:gas
```

### Deploy Contracts

```bash
# Deploy to local Hardhat network
npm run deploy:local

# Deploy to Sepolia testnet
npm run deploy:sepolia
```

## 🧪 Testing

### Test Coverage

The project includes comprehensive tests covering:

- **Happy Path**: Complete tender workflow from creation to completion
- **Edge Cases**: Deadline boundaries, tie bids, budget limits
- **Error Cases**: Invalid reveals, late submissions, unauthorized access
- **Security**: Reentrancy attacks, front-running prevention, access control

### Running Tests

```bash
# All tests with detailed output
npx hardhat test

# Specific test file
npx hardhat test test/PublicProcurement.test.js

# With gas reporting
REPORT_GAS=true npx hardhat test

# With coverage
npx hardhat coverage
```

### Example Test Output

```
PublicProcurement - Complete Workflow
  Phase 1: Tender Creation
    ✓ Should create a tender successfully
    ✓ Should only allow owner to create tender
    ✓ Should reject zero budget
  Phase 2: Bid Submission (Commit)
    ✓ Should submit bid commitment successfully
    ✓ Should prevent double submission
    ✓ Should reject submission after deadline
  ...
```

## 🌐 Deployment

### Local Deployment

```bash
# Start local Hardhat node
npx hardhat node

# In another terminal, deploy
npm run deploy:local
```

### Testnet Deployment (Sepolia)

1. Get Sepolia ETH from faucet: https://sepoliafaucet.com/
2. Configure `.env` with your RPC URL and private key
3. Deploy:

```bash
npm run deploy:sepolia
```

4. Verify contracts on Etherscan:

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

### Deployment Output

```
🚀 Starting deployment...

Deploying contracts with account: 0x1234...
Account balance: 1.5 ETH

📝 Deploying PublicProcurement (Vulnerable Version)...
✅ PublicProcurement deployed to: 0xabcd...

📝 Deploying PublicProcurementSecure (Secure Version)...
✅ PublicProcurementSecure deployed to: 0xef01...

📄 Deployment info saved to: sepolia-1234567890.json
```

## 🛠️ CLI Tool

The CLI provides a complete interface for interacting with the contracts.

### Configuration

```bash
# Configure CLI
node scripts/cli.js config \
  --rpc http://127.0.0.1:8545 \
  --contract 0xYourContractAddress \
  --key 0xYourPrivateKey
```

### Tender Management

```bash
# Create a tender
node scripts/cli.js create-tender \
  -d "Road Construction Project" \
  -b 12 \
  -a 0xAuditorAddress

# Get tender info
node scripts/cli.js get-tender -i 1

# List all tenders
node scripts/cli.js list-tenders
```

### Bidding

```bash
# Submit a bid (saves nonce locally)
node scripts/cli.js submit-bid -i 1 -a 8

# View saved bids
node scripts/cli.js my-bids

# Reveal a bid
node scripts/cli.js reveal-bid -i 1 -a 8 -n 0x1234...

# Check bid status
node scripts/cli.js get-bid -i 1 -b 0xBidderAddress
```

### Winner Selection & Milestones

```bash
# Select winner (after reveal deadline)
node scripts/cli.js select-winner -i 1

# Approve milestone (auditor only)
node scripts/cli.js approve-milestone -i 1 -m 1 -p 4

# Check milestone status
node scripts/cli.js milestone-status -i 1
```

### Utilities

```bash
# Verify a commitment hash
node scripts/cli.js verify-hash \
  -a 8 \
  -n 0x1234... \
  -b 0xBidderAddress

# Get all events for a tender
node scripts/cli.js get-events -i 1
```

## 🔒 Security Analysis

### Vulnerabilities (PublicProcurement.sol)

#### 1. Reentrancy Attack

**Location**: `approveMilestone()` function

**Vulnerability**:
```solidity
// VULNERABLE: Transfer before state update
payable(tender.winner).transfer(paymentAmount);

// State updated AFTER transfer
milestonesCompleted[_tenderId][_milestoneNumber] = true;
tender.currentMilestone = _milestoneNumber;
```

**Exploit**: Malicious winner contract can call back into `approveMilestone()` before state updates.

**Fix (Secure Version)**:
```solidity
// Update state FIRST (Checks-Effects-Interactions)
milestonesCompleted[_tenderId][_milestoneNumber] = true;
tender.currentMilestone = _milestoneNumber;

// Add to pending withdrawals (pull payment)
pendingWithdrawals[tender.winner] += paymentAmount;

// Protected by nonReentrant modifier
```

#### 2. Timestamp Manipulation

**Vulnerability**: Only uses `block.timestamp` for deadlines
- Miners can manipulate within ~15 second window

**Fix**: Dual validation with both timestamp and block number

#### 3. Unsafe Transfers

**Vulnerability**: No return value check on `.transfer()`

**Fix**: Use `.call{value: amount}("")` with success check

### Front-Running Prevention

The commit-reveal scheme prevents front-running:

1. **Commit Phase**: Only hash is visible on-chain
2. **Reveal Phase**: Actual amounts revealed after commit deadline
3. **Integrity**: Hash verification ensures no manipulation

## ⛽ Gas Analysis

### Operation Costs

| Operation | Vulnerable | Secure | Overhead |
|-----------|-----------|--------|----------|
| Create Tender | ~250,000 | ~280,000 | +12% |
| Submit Bid | ~85,000 | ~85,000 | 0% |
| Reveal Bid | ~65,000 | ~68,000 | +4.6% |
| Select Winner (3 bids) | ~95,000 | ~98,000 | +3.2% |
| Approve Milestone | ~75,000 | ~85,000 | +13.3% |

### Optimizations Implemented

1. **Events over Storage**: Historical data stored in events (cheaper)
2. **Mapping over Arrays**: O(1) access for tenders and bids
3. **Variable Packing**: Grouped small variables in storage slots
4. **Short-Circuit Evaluation**: Ordered conditions by likelihood

### Gas Reporting

```bash
# Enable gas reporting
REPORT_GAS=true npm test

# Output saved to gas-report.txt
```

## 📁 Project Structure

```
projet_blockchain/
├── contracts/
│   ├── PublicProcurement.sol          # Vulnerable version
│   └── PublicProcurementSecure.sol    # Secure version
├── scripts/
│   ├── deploy.js                      # Deployment script
│   └── cli.js                         # CLI tool
├── test/
│   ├── PublicProcurement.test.js      # Main tests
│   └── security.test.js               # Security tests
├── docs/
│   ├── technical_report.pdf           # 8-page technical report
│   ├── architecture_diagram.png       # System architecture
│   ├── state_machine.png              # State transitions
│   └── gas_analysis.xlsx              # Gas measurements
├── tasks/
│   ├── task1_forensics.pdf            # Transaction analysis
│   └── task2_ai_vulnerability.md      # AI vulnerability detection
├── deployments/                       # Deployment records
├── hardhat.config.js                  # Hardhat configuration
├── package.json                       # Dependencies
├── .env.example                       # Environment template
└── README.md                          # This file
```

## 📊 Demo Scenario

Complete workflow example:

```bash
# 1. Deploy contracts
npm run deploy:local

# 2. Configure CLI
node scripts/cli.js config --rpc http://127.0.0.1:8545 --contract 0x... --key 0x...

# 3. Create tender (Owner)
node scripts/cli.js create-tender -d "Bridge Construction" -b 12 -a 0xAuditor...

# 4. Submit bids (3 bidders)
# Bidder 1: 8 ETH
node scripts/cli.js submit-bid -i 1 -a 8

# Bidder 2: 11 ETH  
node scripts/cli.js submit-bid -i 1 -a 11

# Bidder 3: 10 ETH
node scripts/cli.js submit-bid -i 1 -a 10

# 5. Wait for submission deadline (or manipulate time in tests)

# 6. Reveal bids
node scripts/cli.js reveal-bid -i 1 -a 8 -n <nonce1>
node scripts/cli.js reveal-bid -i 1 -a 11 -n <nonce2>
node scripts/cli.js reveal-bid -i 1 -a 10 -n <nonce3>

# 7. Select winner (8 ETH wins)
node scripts/cli.js select-winner -i 1

# 8. Approve milestones (Auditor)
node scripts/cli.js approve-milestone -i 1 -m 1 -p 4
node scripts/cli.js approve-milestone -i 1 -m 2 -p 4

# 9. Check completion
node scripts/cli.js get-tender -i 1
```

## 🤝 Contributing

This is an academic project. For questions or suggestions, please open an issue.

## 📄 License

MIT License

## 👨‍💻 Author

Academic Project - 2025

## 🔗 Resources

- [Solidity Documentation](https://docs.soliditylang.org/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Ethereum Development](https://ethereum.org/en/developers/)

## ⚠️ Disclaimer

The vulnerable contract version is for educational purposes only. Never deploy it to mainnet or use it with real funds. Always use the secure version in production.
