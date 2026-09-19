"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueService = exports.QueueService = void 0;
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const VideoJob_1 = require("../models/VideoJob");
const SocketService_1 = require("./SocketService");
class QueueService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!QueueService.instance) {
            QueueService.instance = new QueueService();
        }
        return QueueService.instance;
    }
    async addProcessingJob(job) {
        try {
            // Update job status to queued
            job.status = 'queued';
            job.progress = 0;
            await job.save();
            SocketService_1.socketService.emitJobProgress(job._id.toString(), {
                progress: 0,
                stage: 'Queued',
                status: 'queued',
                message: 'Job submitted to processing queue',
            });
            // Prepare target output filename
            const ext = path_1.default.extname(job.originalPath) || '.mp4';
            const outputFilename = `processed_${job._id}${ext}`;
            const outputPath = path_1.default.join(env_1.config.processedDir, outputFilename);
            const callbackUrl = `http://127.0.0.1:${env_1.config.port}/api/videos/webhook/progress`;
            const requestPayload = {
                job_id: job._id.toString(),
                video_path: job.originalPath,
                output_path: outputPath,
                processing_type: job.processingType,
                masks: job.masks,
                options: {
                    blur_strength: job.options?.blurStrength || 21,
                    feather_amount: job.options?.featherAmount || 5,
                    inpainting_method: job.options?.inpaintingMethod || 'telea',
                    inpaint_radius: job.options?.inpaintRadius || 5,
                    crop_region: job.options?.cropRegion,
                },
                callback_url: callbackUrl,
            };
            // Dispatch to Python processing service
            const response = await axios_1.default.post(`${env_1.config.pythonServiceUrl}/process`, requestPayload, {
                timeout: 10000,
            });
            if (response.status === 200 || response.status === 202) {
                job.status = 'processing';
                job.processedPath = outputPath;
                await job.save();
                SocketService_1.socketService.emitJobProgress(job._id.toString(), {
                    progress: 5,
                    stage: 'Started',
                    status: 'processing',
                    message: 'Python processing service started job',
                });
            }
            else {
                throw new Error(`Python service returned status code ${response.status}`);
            }
        }
        catch (err) {
            console.error(`Error queuing job ${job._id}:`, err?.message || err);
            job.status = 'failed';
            job.errorMessage = err?.message || 'Failed to submit job to processing service';
            await job.save();
            SocketService_1.socketService.emitJobProgress(job._id.toString(), {
                progress: 0,
                stage: 'Failed',
                status: 'failed',
                message: job.errorMessage,
            });
        }
    }
    async handleProgressCallback(payload) {
        const { jobId, progress, stage, status, message } = payload;
        const job = await VideoJob_1.VideoJob.findById(jobId);
        if (!job)
            return;
        job.progress = Math.min(100, Math.max(0, progress));
        if (status === 'completed') {
            job.status = 'completed';
            job.progress = 100;
            job.completedAt = new Date();
        }
        else if (status === 'failed') {
            job.status = 'failed';
            job.errorMessage = message || 'Processing failed';
        }
        else if (status === 'processing') {
            job.status = 'processing';
        }
        await job.save();
        SocketService_1.socketService.emitJobProgress(jobId, {
            progress: job.progress,
            stage,
            status: job.status,
            message,
        });
    }
}
exports.QueueService = QueueService;
exports.queueService = QueueService.getInstance();
