import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { VideoJob } from '../models/VideoJob';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';
import { queueService } from '../services/QueueService';
import { storageService } from '../services/StorageService';
import { config } from '../config/env';

const router = Router();

// 1. Upload Video
router.post('/upload', authMiddleware, uploadMiddleware.single('video'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const userId = req.user!._id;
    const originalFilename = req.file.originalname;
    const originalPath = req.file.path;
    const fileSize = req.file.size;

    // Optional: Generate thumbnail & probe duration
    const thumbnailFilename = `thumb-${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`;
    const thumbnailPath = path.join(config.thumbnailsDir, thumbnailFilename);

    let duration = 0;
    try {
      await new Promise<void>((resolve) => {
        ffmpeg(originalPath)
          .on('filenames', () => {})
          .on('end', () => resolve())
          .on('error', () => resolve())
          .screenshots({
            count: 1,
            timestamps: ['50%'],
            filename: thumbnailFilename,
            folder: config.thumbnailsDir,
            size: '320x180',
          });
      });

      duration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(originalPath, (err, metadata) => {
          if (err || !metadata || !metadata.format) return resolve(0);
          resolve(metadata.format.duration || 0);
        });
      });
    } catch (e) {
      console.warn('Thumbnail or duration extraction fallback used:', e);
    }

    const job = await VideoJob.create({
      userId,
      originalFilename,
      originalPath,
      thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : undefined,
      fileSize,
      duration: Math.round(duration),
      status: 'uploaded',
      progress: 0,
    });

    return res.status(201).json(job);
  } catch (error: any) {
    console.error('Upload video error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to upload video.' });
  }
});

// 2. Get User Videos List
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const videos = await VideoJob.find({ userId }).sort({ createdAt: -1 });
    return res.json(videos);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch user videos.' });
  }
});

// 3. Get Video Details
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const job = await VideoJob.findOne({ _id: req.params.id, userId });
    if (!job) {
      return res.status(404).json({ error: 'Video not found or unauthorized access.' });
    }
    return res.json(job);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch video job.' });
  }
});

// 4. Trigger Video Processing
router.post('/:id/process', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { processingType, masks, options } = req.body;

    const job = await VideoJob.findOne({ _id: req.params.id, userId });
    if (!job) {
      return res.status(404).json({ error: 'Video job not found.' });
    }

    if (job.status === 'processing') {
      return res.status(400).json({ error: 'Video is already being processed.' });
    }

    job.processingType = processingType || 'ai_remove';
    job.masks = masks || [];
    job.options = options || {};

    await queueService.addProcessingJob(job);

    return res.json({
      message: 'Processing started',
      jobId: job._id,
      status: job.status,
    });
  } catch (error: any) {
    console.error('Process error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to start video processing.' });
  }
});

// 5. Get Job Status
router.get('/:id/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const job = await VideoJob.findOne({ _id: req.params.id, userId }).select('status progress errorMessage completedAt');
    if (!job) {
      return res.status(404).json({ error: 'Video job not found.' });
    }
    return res.json({
      status: job.status,
      progress: job.progress,
      errorMessage: job.errorMessage,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to get job status.' });
  }
});

// 6. Cancel Processing Job
router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const job = await VideoJob.findOne({ _id: req.params.id, userId });
    if (!job) {
      return res.status(404).json({ error: 'Video job not found.' });
    }

    if (job.status === 'processing' || job.status === 'queued') {
      job.status = 'failed';
      job.errorMessage = 'Job cancelled by user';
      await job.save();
    }

    return res.json({ message: 'Job cancelled successfully', job });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to cancel job.' });
  }
});

// 7. Delete Video
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const job = await VideoJob.findOne({ _id: req.params.id, userId });
    if (!job) {
      return res.status(404).json({ error: 'Video job not found.' });
    }

    // Clean up local files
    if (job.originalPath) await storageService.deleteFile(job.originalPath);
    if (job.processedPath) await storageService.deleteFile(job.processedPath);
    if (job.thumbnailPath) await storageService.deleteFile(job.thumbnailPath);

    await VideoJob.deleteOne({ _id: job._id });

    return res.json({ message: 'Video deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to delete video.' });
  }
});

// 8. Download Processed Video
router.get('/:id/download', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const job = await VideoJob.findOne({ _id: req.params.id, userId });

    if (!job || job.status !== 'completed' || !job.processedPath || !fs.existsSync(job.processedPath)) {
      return res.status(404).json({ error: 'Processed video not available for download.' });
    }

    const downloadName = `no_watermark_${job.originalFilename}`;
    return res.download(job.processedPath, downloadName);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to download video.' });
  }
});

// 9. Webhook callback for Python progress updates
router.post('/webhook/progress', async (req: Request, res: Response) => {
  try {
    const { jobId, progress, stage, status, message } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    await queueService.handleProgressCallback({
      jobId,
      progress: Number(progress) || 0,
      stage: stage || 'processing',
      status: status || 'processing',
      message,
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Failed to process progress webhook' });
  }
});

// 10. Safe Media Streamer Endpoint (Original, Processed, Thumbnail)
router.get('/media/:category/:filename', async (req: Request, res: Response) => {
  try {
    const { category, filename } = req.params;
    if (!['uploads', 'processed', 'thumbnails'].includes(category)) {
      return res.status(400).json({ error: 'Invalid media category' });
    }

    const baseDir =
      category === 'uploads'
        ? config.uploadsDir
        : category === 'processed'
        ? config.processedDir
        : config.thumbnailsDir;

    const safePath = path.resolve(baseDir, path.basename(filename));

    if (!safePath.startsWith(baseDir)) {
      return res.status(403).json({ error: 'Forbidden path traversal access.' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(safePath);
    const range = req.headers.range;

    if (range && category !== 'thumbnails') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(safePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const mimeType = category === 'thumbnails' ? 'image/jpeg' : 'video/mp4';
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
      });
      fs.createReadStream(safePath).pipe(res);
    }
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to stream media.' });
  }
});

export default router;
