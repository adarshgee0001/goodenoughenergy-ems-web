import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { requestLogger } from './middleware/logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/notFound.middleware';

const app = express();

// Middlewares
// Middlewares
// CORS configuration allows configured origins, local network (10.10.10.245), localhost, and goodenough.energy domains
const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000,http://10.10.10.245:5173,http://10.10.10.245:5000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // allow same-origin, curl, server-to-server
  if (configuredOrigins.includes(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.10\.10\.245)(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)*goodenough\.energy(:\d+)?$/.test(origin)) return true;
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// API Routes
app.use('/api', routes);

// 404 Handler for unknown routes
app.use(notFoundHandler);

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
