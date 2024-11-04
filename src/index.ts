import { v4 as uuidv4 } from 'uuid';
import { Server, StableBTreeMap, ic, Query, Update } from 'azle';
import express from 'express';

class DigitalAsset {
    id: string;
    title: string;
    description: string;
    assetType: AssetType;
    creatorId: string;
    contentHash: string;
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

const assetStorage = StableBTreeMap<string, DigitalAsset>(0);
const creatorAssets = StableBTreeMap<string, string[]>(1);
const assetTransfers = StableBTreeMap<string, Transfer[]>(2);

export default Server(() => {
    const app = express();
    app.use(express.json());

    // Utility for consistent error response
    function sendErrorResponse(res, status, message) {
        res.status(status).json({ error: message });
    }

    // Helper to get current date in correct format
    function getCurrentDate(): Date {
        const timestamp = Number(ic.time());
        return new Date(timestamp / 1_000_000);
    }

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

            assetStorage.insert(assetId, asset);
            updateCreatorAssetsList(req.body.creatorId, assetId);

            res.json(asset);
        } catch (error) {
            sendErrorResponse(res, 400, error.message);
        }
    });

    // Get asset by ID
    app.get("/assets/:id", (req, res) => {
        const assetOpt = assetStorage.get(req.params.id);
        if ("None" in assetOpt) {
            return sendErrorResponse(res, 404, "Asset not found");
        }
        res.json(assetOpt.Some);
    });

    // Get all assets by creator ID
    app.get("/creators/:creatorId/assets", (req, res) => {
        const creatorAssetsOpt = creatorAssets.get(req.params.creatorId);
        if ("None" in creatorAssetsOpt) {
            res.json([]);
        } else {
            const assets = creatorAssetsOpt.Some
                .map(assetId => assetStorage.get(assetId).Some)
                .filter(asset => asset !== null);
            res.json(assets);
        }
    });

    // Transfer asset ownership with ownership check
    app.post("/assets/:id/transfer", (req, res) => {
        try {
            const { toId, transferType } = req.body;
            const assetOpt = assetStorage.get(req.params.id);

            if ("None" in assetOpt) {
                throw new Error("Asset not found");
            }

            const asset = assetOpt.Some;
            if (asset.creatorId !== req.user.id) {  // Assuming req.user.id is authenticated user
                return sendErrorResponse(res, 403, "Unauthorized transfer attempt");
            }
            if (asset.status !== AssetStatus.ACTIVE) {
                return sendErrorResponse(res, 400, "Asset is not available for transfer");
            }

            const transfer: Transfer = {
                id: uuidv4(),
                fromId: asset.creatorId,
                toId: toId,
                transferDate: getCurrentDate(),
                transferType: transferType
            };

            const updatedAsset = {
                ...asset,
                transferHistory: [...asset.transferHistory, transfer],
                status: transferType === TransferType.FULL ? AssetStatus.TRANSFERRED : AssetStatus.ACTIVE,
                lastModified: getCurrentDate()
            };

            if (transferType === TransferType.FULL) {
                updateCreatorAssetsListOnTransfer(asset.creatorId, toId, asset.id);
            }

            assetStorage.insert(asset.id, updatedAsset);
            res.json(updatedAsset);
        } catch (error) {
            sendErrorResponse(res, 400, error.message);
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
                metadata: { ...asset.metadata, ...req.body },
                lastModified: getCurrentDate()
            };

            assetStorage.insert(asset.id, updatedAsset);
            res.json(updatedAsset);
        } catch (error) {
            sendErrorResponse(res, 400, error.message);
        }
    });

    // Revoke asset with ownership check
    app.post("/assets/:id/revoke", (req, res) => {
        try {
            const assetOpt = assetStorage.get(req.params.id);
            if ("None" in assetOpt) {
                throw new Error("Asset not found");
            }

            const asset = assetOpt.Some;
            if (asset.creatorId !== req.user.id) {
                return sendErrorResponse(res, 403, "Unauthorized revocation attempt");
            }
            if (asset.status === AssetStatus.REVOKED) {
                return sendErrorResponse(res, 400, "Asset is already revoked");
            }

            const updatedAsset = {
                ...asset,
                status: AssetStatus.REVOKED,
                lastModified: getCurrentDate()
            };

            assetStorage.insert(asset.id, updatedAsset);
            res.json(updatedAsset);
        } catch (error) {
            sendErrorResponse(res, 400, error.message);
        }
    });

    return app.listen();
});

// Helper Functions

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
    // Sanitize fields as necessary for security
}

function updateCreatorAssetsList(creatorId: string, assetId: string): void {
    const creatorAssetList = creatorAssets.get(creatorId);
    if ("None" in creatorAssetList) {
        creatorAssets.insert(creatorId, [assetId]);
    } else {
        creatorAssets.insert(creatorId, [...creatorAssetList.Some, assetId]);
    }
}

function updateCreatorAssetsListOnTransfer(oldCreatorId: string, newCreatorId: string, assetId: string): void {
    const oldCreatorAssets = creatorAssets.get(oldCreatorId).Some;
    creatorAssets.insert(
        oldCreatorId,
        oldCreatorAssets.filter(id => id !== assetId)
    );

    const newCreatorAssetsOpt = creatorAssets.get(newCreatorId);
    if ("None" in newCreatorAssetsOpt) {
        creatorAssets.insert(newCreatorId, [assetId]);
    } else {
        creatorAssets.insert(newCreatorId, [...newCreatorAssetsOpt.Some, assetId]);
    }
}
