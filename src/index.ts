import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { socketService } from './services/SocketService';
import authRoutes from './routes/authRoutes';
import videoRoutes from './routes/videoRoutes';

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
socketService.init(server);

// Security Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

app.use('/api', apiLimiter);

// Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

// Connect Database & Start Server
const startServer = async () => {
  let targetUri = config.mongoUri;

  try {
    console.log(`Connecting to MongoDB at ${targetUri}...`);
    await mongoose.connect(targetUri, { serverSelectionTimeoutMS: 3000 });
    console.log('MongoDB connected successfully.');
  } catch (primaryError) {
    console.warn(`Primary MongoDB connection failed (${targetUri}).`);
    console.log('Spinning up embedded MongoMemoryServer fallback for local development...');
    
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      targetUri = mongod.getUri();
      console.log(`Connecting to in-memory MongoDB at ${targetUri}...`);
      await mongoose.connect(targetUri);
      console.log('In-memory MongoDB connected successfully!');
    } catch (fallbackError) {
      console.error('Failed to start in-memory MongoDB fallback:', fallbackError);
      process.exit(1);
    }
  }

  server.listen(config.port, () => {
    console.log(`Backend server running on http://localhost:${config.port}`);
  });
};

startServer();
