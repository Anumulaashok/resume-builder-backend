import { Request, Response } from 'express';

export const healthCheck = (req: Request, res: Response) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime()
  };
  
  res.status(200).json(healthcheck);
};
