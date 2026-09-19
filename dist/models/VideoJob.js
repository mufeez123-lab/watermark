"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoJob = void 0;
const mongoose_1 = require("mongoose");
const maskRegionSchema = new mongoose_1.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
});
const videoJobSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFilename: { type: String, required: true },
    originalPath: { type: String, required: true },
    processedPath: { type: String },
    thumbnailPath: { type: String },
    status: {
        type: String,
        enum: ['uploaded', 'queued', 'processing', 'completed', 'failed'],
        default: 'uploaded',
        index: true,
    },
    processingType: {
        type: String,
        enum: ['ai_remove', 'blur', 'crop'],
        default: 'ai_remove',
    },
    masks: { type: [maskRegionSchema], default: [] },
    options: { type: mongoose_1.Schema.Types.Mixed },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    duration: { type: Number },
    fileSize: { type: Number, required: true },
    errorMessage: { type: String },
    completedAt: { type: Date },
}, {
    timestamps: true,
});
exports.VideoJob = (0, mongoose_1.model)('VideoJob', videoJobSchema);
