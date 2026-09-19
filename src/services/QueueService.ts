import path from 'path';
import axios from 'axios';
import { config } from '../config/env';
import { VideoJob, IVideoJob } from '../models/VideoJob';
import { socketService } from './SocketService';

export class QueueService {
  private static instance: QueueService;

  private constructor() {}

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public async addProcessingJob(job: IVideoJob): Promise<void> {
    try {
      // Update job status to queued
      job.status = 'queued';
      job.progress = 0;
      await job.save();

      socketService.emitJobProgress(job._id.toString(), {
        progress: 0,
        stage: 'Queued',
        status: 'queued',
        message: 'Job submitted to processing queue',
      });

      // Prepare target output filename
      const ext = path.extname(job.originalPath) || '.mp4';
      const outputFilename = `processed_${job._id}${ext}`;
      const outputPath = path.join(config.processedDir, outputFilename);

      const callbackUrl = `http://127.0.0.1:${config.port}/api/videos/webhook/progress`;

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
      const response = await axios.post(`${config.pythonServiceUrl}/process`, requestPayload, {
        timeout: 10000,
      });

      if (response.status === 200 || response.status === 202) {
        job.status = 'processing';
        job.processedPath = outputPath;
        await job.save();

        socketService.emitJobProgress(job._id.toString(), {
          progress: 5,
          stage: 'Started',
          status: 'processing',
          message: 'Python processing service started job',
        });
      } else {
        throw new Error(`Python service returned status code ${response.status}`);
      }
    } catch (err: any) {
      console.error(`Error queuing job ${job._id}:`, err?.message || err);
      job.status = 'failed';
      job.errorMessage = err?.message || 'Failed to submit job to processing service';
      await job.save();

      socketService.emitJobProgress(job._id.toString(), {
        progress: 0,
        stage: 'Failed',
        status: 'failed',
        message: job.errorMessage,
      });
    }
  }

  public async handleProgressCallback(payload: {
    jobId: string;
    progress: number;
    stage: string;
    status: string;
    message?: string;
  }): Promise<void> {
    const { jobId, progress, stage, status, message } = payload;

    const job = await VideoJob.findById(jobId);
    if (!job) return;

    job.progress = Math.min(100, Math.max(0, progress));
    if (status === 'completed') {
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
    } else if (status === 'failed') {
      job.status = 'failed';
      job.errorMessage = message || 'Processing failed';
    } else if (status === 'processing') {
      job.status = 'processing';
    }

    await job.save();

    socketService.emitJobProgress(jobId, {
      progress: job.progress,
      stage,
      status: job.status,
      message,
    });
  }
}

export const queueService = QueueService.getInstance();
