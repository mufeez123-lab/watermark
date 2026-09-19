"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const VideoJob_1 = require("../models/VideoJob");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const QueueService_1 = require("../services/QueueService");
const StorageService_1 = require("../services/StorageService");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
// 1. Upload Video
router.post('/upload', auth_1.authMiddleware, upload_1.uploadMiddleware.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided.' });
        }
        const userId = req.user._id;
        const originalFilename = req.file.originalname;
        const originalPath = req.file.path;
        const fileSize = req.file.size;
        // Optional: Generate thumbnail & probe duration
        const thumbnailFilename = `thumb-${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`;
        const thumbnailPath = path_1.default.join(env_1.config.thumbnailsDir, thumbnailFilename);
        let duration = 0;
        try {
            await new Promise((resolve) => {
                (0, fluent_ffmpeg_1.default)(originalPath)
                    .on('filenames', () => { })
                    .on('end', () => resolve())
                    .on('error', () => resolve())
                    .screenshots({
                    count: 1,
                    timestamps: ['50%'],
                    filename: thumbnailFilename,
                    folder: env_1.config.thumbnailsDir,
                    size: '320x180',
                });
            });
            duration = await new Promise((resolve) => {
                fluent_ffmpeg_1.default.ffprobe(originalPath, (err, metadata) => {
                    if (err || !metadata || !metadata.format)
                        return resolve(0);
                    resolve(metadata.format.duration || 0);
                });
            });
        }
        catch (e) {
            console.warn('Thumbnail or duration extraction fallback used:', e);
        }
        const job = await VideoJob_1.VideoJob.create({
            userId,
            originalFilename,
            originalPath,
            thumbnailPath: fs_1.default.existsSync(thumbnailPath) ? thumbnailPath : undefined,
            fileSize,
            duration: Math.round(duration),
            status: 'uploaded',
            progress: 0,
        });
        return res.status(201).json(job);
    }
    catch (error) {
        console.error('Upload video error:', error);
        return res.status(500).json({ error: error?.message || 'Failed to upload video.' });
    }
});
// 2. Get User Videos List
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const videos = await VideoJob_1.VideoJob.find({ userId }).sort({ createdAt: -1 });
        return res.json(videos);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch user videos.' });
    }
});
// 3. Get Video Details
router.get('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const job = await VideoJob_1.VideoJob.findOne({ _id: req.params.id, userId });
        if (!job) {
            return res.status(404).json({ error: 'Video not found or unauthorized access.' });
        }
        return res.json(job);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to fetch video job.' });
    }
});
// 4. Trigger Video Processing
router.post('/:id/process', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const { processingType, masks, options } = req.body;
        const job = await VideoJob_1.VideoJob.findOne({ _id: req.params.id, userId });
        if (!job) {
            return res.status(404).json({ error: 'Video job not found.' });
        }
        if (job.status === 'processing') {
            return res.status(400).json({ error: 'Video is already being processed.' });
        }
        job.processingType = processingType || 'ai_remove';
        job.masks = masks || [];
        job.options = options || {};
        await QueueService_1.queueService.addProcessingJob(job);
        return res.json({
            message: 'Processing started',
            jobId: job._id,
            status: job.status,
        });
    }
    catch (error) {
        console.error('Process error:', error);
        return res.status(500).json({ error: error?.message || 'Failed to start video processing.' });
    }
});
// 5. Get Job Status
router.get('/:id/status', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const job = await VideoJob_1.VideoJob.findOne({ _id: req.params.id, userId }).select('status progress errorMessage completedAt');
        if (!job) {
            return res.status(404).json({ error: 'Video job not found.' });
        }
        return res.json({
            status: job.status,
            progress: job.progress,
            errorMessage: job.errorMessage,
            completedAt: job.completedAt,
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to get job status.' });
    }
});
// 6. Cancel Processing Job
router.post('/:id/cancel', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const job = await VideoJob_1.VideoJob.findOne({ _id: req.params.id, userId });
        if (!job) {
            return res.status(404).json({ error: 'Video job not found.' });
        }
        if (job.status === 'processing' || job.status === 'queued') {
            job.status = 'failed';
            job.errorMessage = 'Job cancelled by user';
            await job.save();
        }
        return res.json({ message: 'Job cancelled successfully', job });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to cancel job.' });
    }
});
// 7. Delete Video
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const job = await VideoJob_1.VideoJob.findOne({ _id: req.params.id, userId });
        if (!job) {
            return res.status(404).json({ error: 'Video job not found.' });
        }
        // Clean up local files
        if (job.originalPath)
            await StorageService_1.storageService.deleteFile(job.originalPath);
        if (job.processedPath)
            await StorageService_1.storageService.deleteFile(job.processedPath);
        if (job.thumbnailPath)
            await StorageService_1.storageService.deleteFile(job.thumbnailPath);
        await VideoJob_1.VideoJob.deleteOne({ _id: job._id });
        return res.json({ message: 'Video deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to delete video.' });
    }
});
// 8. Download Processed Video
router.get('/:id/download', auth_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;
        const job = await VideoJob_1.VideoJob.findOne({ _id: req.params.id, userId });
        if (!job || job.status !== 'completed' || !job.processedPath || !fs_1.default.existsSync(job.processedPath)) {
            return res.status(404).json({ error: 'Processed video not available for download.' });
        }
        const downloadName = `no_watermark_${job.originalFilename}`;
        return res.download(job.processedPath, downloadName);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to download video.' });
    }
});
// 9. Webhook callback for Python progress updates
router.post('/webhook/progress', async (req, res) => {
    try {
        const { jobId, progress, stage, status, message } = req.body;
        if (!jobId) {
            return res.status(400).json({ error: 'jobId is required' });
        }
        await QueueService_1.queueService.handleProgressCallback({
            jobId,
            progress: Number(progress) || 0,
            stage: stage || 'processing',
            status: status || 'processing',
            message,
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: 'Failed to process progress webhook' });
    }
});
// 10. Safe Media Streamer Endpoint (Original, Processed, Thumbnail)
router.get('/media/:category/:filename', async (req, res) => {
    try {
        const { category, filename } = req.params;
        if (!['uploads', 'processed', 'thumbnails'].includes(category)) {
            return res.status(400).json({ error: 'Invalid media category' });
        }
        const baseDir = category === 'uploads'
            ? env_1.config.uploadsDir
            : category === 'processed'
                ? env_1.config.processedDir
                : env_1.config.thumbnailsDir;
        const safePath = path_1.default.resolve(baseDir, path_1.default.basename(filename));
        if (!safePath.startsWith(baseDir)) {
            return res.status(403).json({ error: 'Forbidden path traversal access.' });
        }
        if (!fs_1.default.existsSync(safePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const stat = fs_1.default.statSync(safePath);
        const range = req.headers.range;
        if (range && category !== 'thumbnails') {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunksize = end - start + 1;
            const file = fs_1.default.createReadStream(safePath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        }
        else {
            const mimeType = category === 'thumbnails' ? 'image/jpeg' : 'video/mp4';
            res.writeHead(200, {
                'Content-Length': stat.size,
                'Content-Type': mimeType,
            });
            fs_1.default.createReadStream(safePath).pipe(res);
        }
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to stream media.' });
    }
});
exports.default = router;
