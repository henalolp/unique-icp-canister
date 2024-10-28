# Digital Asset Registry Canister - Deployment and Testing Guide

This guide provides instructions for deploying and testing the Digital Asset Registry canister on the Internet Computer.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Deployment](#deployment)
- [Testing](#testing)
- [API Documentation](#api-documentation)

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v16 or later)
- DFX (latest version)
- Git
- VS Code (recommended) or any preferred IDE

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Vincent-Omondi/unique-icp-canister.git
cd digital-asset-registry
```

2. Install dependencies:
```bash
npm install
```

3. Create a new dfx project:
```bash
dfx new digital-asset-registry
cd digital-asset-registry
```

4. Replace the generated files with the repository files.

## Deployment

1. Start the local Internet Computer replica:
```bash
dfx start --clean --background
```

2. Deploy the canister locally:
```bash
dfx deploy
```

3. To deploy to the IC mainnet:
```bash
dfx deploy --network ic
```

Note: Make sure you have sufficient cycles in your wallet for mainnet deployment.

## Testing

### Using dfx Command Line

1. Register a new digital asset:
```bash
dfx canister call digital_asset_registry register_asset '(
  record {
    title = "Sample Digital Art";
    description = "A beautiful digital artwork";
    assetType = "IMAGE";
    creatorId = "creator123";
    contentHash = "QmX4u5...";
    metadata = record {
      fileFormat = "PNG";
      fileSize = 1024;
      dimensions = "1920x1080";
      additionalTags = vec {"art", "digital"};
    }
  }
)'
```

2. Retrieve an asset:
```bash
dfx canister call digital_asset_registry get_asset '(
  "asset-id-here"
)'
```

3. Transfer an asset:
```bash
dfx canister call digital_asset_registry transfer_asset '(
  "asset-id-here",
  "new-owner-id",
  "FULL"
)'
```

### Using HTTP Requests

You can also test the canister using HTTP requests. Here are some examples using curl:

1. Register a new asset:
```bash
curl -X POST http://localhost:4943/assets \
-H "Content-Type: application/json" \
-d '{
  "title": "Sample Digital Art",
  "description": "A beautiful digital artwork",
  "assetType": "IMAGE",
  "creatorId": "creator123",
  "contentHash": "QmX4u5...",
  "metadata": {
    "fileFormat": "PNG",
    "fileSize": 1024,
    "dimensions": "1920x1080",
    "additionalTags": ["art", "digital"]
  }
}'
```

2. Get asset by ID:
```bash
curl http://localhost:4943/assets/[asset-id]
```

3. Get creator's assets:
```bash
curl http://localhost:4943/creators/[creator-id]/assets
```

4. Transfer asset:
```bash
curl -X POST http://localhost:4943/assets/[asset-id]/transfer \
-H "Content-Type: application/json" \
-d '{
  "toId": "new-owner-id",
  "transferType": "FULL"
}'
```

## API Documentation

### Endpoints

#### POST /assets
Creates a new digital asset registration.

Request body:
```json
{
  "title": string,
  "description": string,
  "assetType": "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "CODE",
  "creatorId": string,
  "contentHash": string,
  "metadata": {
    "fileFormat": string,
    "fileSize": number,
    "dimensions": string?,
    "duration": number?,
    "additionalTags": string[]
  }
}
```

#### GET /assets/:id
Retrieves a specific asset by ID.

#### GET /creators/:creatorId/assets
Retrieves all assets owned by a specific creator.

#### POST /assets/:id/transfer
Transfers asset ownership or licenses.

Request body:
```json
{
  "toId": string,
  "transferType": "FULL" | "LICENSE"
}
```

#### PUT /assets/:id/metadata
Updates asset metadata.

#### POST /assets/:id/revoke
Revokes an asset.

## Error Handling

The canister includes comprehensive error handling. All endpoints return appropriate HTTP status codes:
- 200: Success
- 400: Bad Request (with error message)
- 404: Not Found
- 500: Internal Server Error

## Security Considerations

1. Always verify content hashes before registration
2. Implement proper access control in production
3. Validate all input data
4. Monitor transfer history for suspicious activity

## Monitoring and Maintenance

1. Check canister status:
```bash
dfx canister status digital_asset_registry
```

2. Update canister:
```bash
dfx canister install digital_asset_registry --mode upgrade
```

3. Monitor cycles:
```bash
dfx canister status digital_asset_registry --network ic
```