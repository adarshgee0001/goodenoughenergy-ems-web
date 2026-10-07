import { Request, Response } from 'express';

export const getHealthStatus = (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Backend is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
};
