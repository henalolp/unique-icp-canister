// cannister code goes here
import { v4 as uuidv4 } from 'uuid';
import { Server, StableBTreeMap, ic, Query, Update } from 'azle';
import express from 'express';

// Define the main types for our digital asset registry
class DigitalAsset {
    id: string;
    title: string;
    description: string;
    assetType: AssetType;
    creatorId: string;
    contentHash: string;  // Hash of the digital content
    registrationDate: Date;
    lastModified: Date;
    transferHistory: Transfer[];
    status: AssetStatus;
    metadata: AssetMetadata;
}

enum AssetType {
    IMAGE = "IMAGE",
    AUDIO = "AUDIO",
    VIDEO = "VIDEO",
    DOCUMENT = "DOCUMENT",
    CODE = "CODE"
}

enum AssetStatus {
    ACTIVE = "ACTIVE",
    TRANSFERRED = "TRANSFERRED",
    REVOKED = "REVOKED"
}

class Transfer {
    id: string;
    fromId: string;
    toId: string;
    transferDate: Date;
    transferType: TransferType;
}

enum TransferType {
    FULL = "FULL",
    LICENSE = "LICENSE"
}

class AssetMetadata {
    fileFormat: string;
    fileSize: number;
    dimensions?: string;
    duration?: number;
    additionalTags: string[];
}

// Storage for different aspects of the registry
const assetStorage = StableBTreeMap<string, DigitalAsset>(0);
const creatorAssets = StableBTreeMap<string, string[]>(1);  // Creator ID to Asset IDs mapping
const assetTransfers = StableBTreeMap<string, Transfer[]>(2);

export default Server(() => {
    const app = express();
    app.use(express.json());

    // Register a new digital asset
    app.post("/assets", (req, res) => {
        try {
            validateAssetRegistration(req.body);
            
            const assetId = uuidv4();
            const asset: DigitalAsset = {
                id: assetId,
                title: req.body.title,
                description: req.body.description,
                assetType: req.body.assetType,
                creatorId: req.body.creatorId,
                contentHash: req.body.contentHash,
                registrationDate: getCurrentDate(),
                lastModified: getCurrentDate(),
                transferHistory: [],
                status: AssetStatus.ACTIVE,
                metadata: req.body.metadata
            };

            // Store the asset
            assetStorage.insert(assetId, asset);

            // Update creator's asset list
            const creatorAssetList = creatorAssets.get(req.body.creatorId);
            if ("None" in creatorAssetList) {
                creatorAssets.insert(req.body.creatorId, [assetId]);
            } else {
                creatorAssets.insert(req.body.creatorId, [...creatorAssetList.Some, assetId]);
            }

            res.json(asset);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Get asset by ID
    app.get("/assets/:id", (req, res) => {
        const assetOpt = assetStorage.get(req.params.id);
        if ("None" in assetOpt) {
            res.status(404).json({ error: "Asset not found" });
        } else {
            res.json(assetOpt.Some);
        }
    });

    // Get all assets by creator ID
    app.get("/creators/:creatorId/assets", (req, res) => {
        const creatorAssetsOpt = creatorAssets.get(req.params.creatorId);
        if ("None" in creatorAssetsOpt) {
            res.json([]);
        } else {
            const assets = creatorAssetsOpt.Some.map(assetId => {
                const asset = assetStorage.get(assetId);
                return "None" in asset ? null : asset.Some;
            }).filter(asset => asset !== null);
            res.json(assets);
        }
    });

    // Transfer asset ownership
    app.post("/assets/:id/transfer", (req, res) => {
        try {
            const { toId, transferType } = req.body;
            const assetOpt = assetStorage.get(req.params.id);

            if ("None" in assetOpt) {
                throw new Error("Asset not found");
            }

            const asset = assetOpt.Some;
            if (asset.status !== AssetStatus.ACTIVE) {
                throw new Error("Asset is not available for transfer");
            }

            // Create transfer record
            const transfer: Transfer = {
                id: uuidv4(),
                fromId: asset.creatorId,
                toId: toId,
                transferDate: getCurrentDate(),
                transferType: transferType
            };

            // Update asset
            const updatedAsset = {
                ...asset,
                transferHistory: [...asset.transferHistory, transfer],
                status: transferType === TransferType.FULL ? AssetStatus.TRANSFERRED : AssetStatus.ACTIVE,
                lastModified: getCurrentDate()
            };

            // If full transfer, update creator mappings
            if (transferType === TransferType.FULL) {
                // Remove from old creator's list
                const oldCreatorAssets = creatorAssets.get(asset.creatorId).Some;
                creatorAssets.insert(
                    asset.creatorId,
                    oldCreatorAssets.filter(id => id !== asset.id)
                );

                // Add to new creator's list
                const newCreatorAssetsOpt = creatorAssets.get(toId);
                if ("None" in newCreatorAssetsOpt) {
                    creatorAssets.insert(toId, [asset.id]);
                } else {
                    creatorAssets.insert(toId, [...newCreatorAssetsOpt.Some, asset.id]);
                }
            }

            assetStorage.insert(asset.id, updatedAsset);
            res.json(updatedAsset);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Update asset metadata
    app.put("/assets/:id/metadata", (req, res) => {
        try {
            const assetOpt = assetStorage.get(req.params.id);
            if ("None" in assetOpt) {
                throw new Error("Asset not found");
            }

            const asset = assetOpt.Some;
            const updatedAsset = {
                ...asset,
                metadata: {
                    ...asset.metadata,
                    ...req.body
                },
                lastModified: getCurrentDate()
            };

            assetStorage.insert(asset.id, updatedAsset);
            res.json(updatedAsset);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    // Revoke asset
    app.post("/assets/:id/revoke", (req, res) => {
        try {
            const assetOpt = assetStorage.get(req.params.id);
            if ("None" in assetOpt) {
                throw new Error("Asset not found");
            }

            const asset = assetOpt.Some;
            if (asset.status === AssetStatus.REVOKED) {
                throw new Error("Asset is already revoked");
            }

            const updatedAsset = {
                ...asset,
                status: AssetStatus.REVOKED,
                lastModified: getCurrentDate()
            };

            assetStorage.insert(asset.id, updatedAsset);
            res.json(updatedAsset);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    return app.listen();
});

// Utility Functions
function getCurrentDate(): Date {
    const timestamp = new Number(ic.time());
    return new Date(timestamp.valueOf() / 1000_000);
}

function validateAssetRegistration(data: any): void {
    if (!data.title || typeof data.title !== 'string') {
        throw new Error("Invalid title");
    }
    if (!data.creatorId || typeof data.creatorId !== 'string') {
        throw new Error("Invalid creator ID");
    }
    if (!data.contentHash || typeof data.contentHash !== 'string') {
        throw new Error("Invalid content hash");
    }
    if (!Object.values(AssetType).includes(data.assetType)) {
        throw new Error("Invalid asset type");
    }
    if (!data.metadata || typeof data.metadata !== 'object') {
        throw new Error("Invalid metadata");
    }
}