import fs from 'fs';
import os from 'os';
import path from 'path';
import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';

// Serverless hosts only allow writes under the OS temp dir; files there are ephemeral.
const isServerless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const uploadsDir = isServerless ? path.join(os.tmpdir(), 'uploads') : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `portfolio-${uniqueSuffix}${ext}`);
  }
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new AppError(
        'Invalid file type. Only JPEG, PNG, and WebP images are supported.',
        400
      )
    );
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter
});

export const handleUpload = () => {
  const multerMiddleware = upload.any();

  return (req: Request, res: Response, next: NextFunction) => {
    multerMiddleware(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(`File too large. Maximum allowed size is 5MB.`, 400)
          );
        }
        return next(new AppError(`Upload error: ${err.message}`, 400));
      } else if (err) {
        return next(err);
      }

      if (Array.isArray(req.files) && req.files.length > 0) {
        req.file = req.files[0];
      }

      next();
    });
  };
};
