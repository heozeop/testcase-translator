/* eslint-disable @typescript-eslint/no-explicit-any */
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

export const multerConfig = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      // Store files in the uploads directory
      const uploadPath = '/app/uploads';
      cb(null, uploadPath);
    },
    filename: (req: any, file: any, cb: any) => {
      // Generate unique filename: projectId_timestamp_uuid.extension
      const projectId = req.params.id || 'unknown';
      const timestamp = Date.now();
      const uuid = uuidv4();
      const ext = extname(file.originalname);
      const filename = `${projectId}_${timestamp}_${uuid}${ext}`;
      cb(null, filename);
    },
  }),
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return cb(
        new Error(`Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.`),
        false,
      );
    }

    cb(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
};
