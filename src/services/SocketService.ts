import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import logging from 'console';

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public init(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket: Socket) => {
      logging.log(`Client connected to WebSocket: ${socket.id}`);

      socket.on('join_job', (jobId: string) => {
        logging.log(`Socket ${socket.id} joined room for job ${jobId}`);
        socket.join(`job_${jobId}`);
      });

      socket.on('leave_job', (jobId: string) => {
        socket.leave(`job_${jobId}`);
      });

      socket.on('disconnect', () => {
        logging.log(`Client disconnected from WebSocket: ${socket.id}`);
      });
    });
  }

  public emitJobProgress(jobId: string, payload: { progress: number; stage: string; status: string; message?: string }): void {
    if (this.io) {
      this.io.to(`job_${jobId}`).emit('job_progress', {
        jobId,
        ...payload,
      });
    }
  }
}

export const socketService = SocketService.getInstance();
