import fs from 'fs';
import os from 'os';
import path from 'path';
import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError';

export const isBlobStorageEnabled = (): boolean =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim().length > 0);

export const generatePortfolioFilename = (originalname: string): string => {
  const ext = path.extname(originalname).toLowerCase();
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `portfolio-${uniqueSuffix}${ext}`;
};

// Serverless hosts only allow writes under the OS temp dir; files there are ephemeral.
const isServerless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const uploadsDir = isServerless ? path.join(os.tmpdir(), 'uploads') : path.resolve(process.cwd(), 'uploads');
if (!isBlobStorageEnabled() && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    cb(null, generatePortfolioFilename(file.originalname));
  }
});

const memoryStorage = multer.memoryStorage();

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

const diskUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter
});

const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter
});

export const upload = isBlobStorageEnabled() ? memoryUpload : diskUpload;

export const RESUME_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const RESUME_IMPORT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export const RESUME_IMPORT_EXTENSIONS = ['.pdf', '.docx', '.txt'];

const resumeImportFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isAllowedExtension = RESUME_IMPORT_EXTENSIONS.includes(ext);
  const isAllowedMime =
    RESUME_IMPORT_MIME_TYPES.includes(mime) ||
    (mime === 'application/octet-stream' && isAllowedExtension);

  if (!isAllowedExtension || !isAllowedMime) {
    return cb(
      new AppError(
        'Unsupported resume file format. Please upload a PDF (.pdf), Word (.docx), or Plain Text (.txt) file up to 5MB.',
        400
      )
    );
  }
  cb(null, true);
};

// Always parse resume documents strictly in memory — never write resume imports to disk or /uploads.
const resumeImportMemoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: RESUME_IMPORT_MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: resumeImportFileFilter,
});

export const handleResumeImportUpload = () => {
  const middleware = resumeImportMemoryUpload.any();

  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError('File too large. Maximum allowed resume file size is 5MB.', 400)
          );
        }
        return next(new AppError(`Resume upload error: ${err.message}`, 400));
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

export const handleUpload = () => {
  const diskMulterMiddleware = diskUpload.any();
  const memoryMulterMiddleware = memoryUpload.any();

  return (req: Request, res: Response, next: NextFunction) => {
    const multerMiddleware = isBlobStorageEnabled()
      ? memoryMulterMiddleware
      : diskMulterMiddleware;

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
