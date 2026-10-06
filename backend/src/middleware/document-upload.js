import multer from 'multer';
import { MAX_DOCUMENT_CHARS } from '../domain/segmenter.js';
import { AppError } from './error-handler.js';

const maxUploadBytes = MAX_DOCUMENT_CHARS * 4;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1 },
});

export function documentUpload(request, response, next) {
  upload.single('file')(request, response, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError({
        code: 'DOCUMENT_TOO_LARGE',
        message: `Document file must not exceed ${MAX_DOCUMENT_CHARS} characters.`,
        httpStatus: 413,
      }));
      return;
    }

    if (error instanceof multer.MulterError) {
      next(new AppError({
        code: 'INVALID_UPLOAD',
        message: 'The document upload is invalid.',
        httpStatus: 400,
      }));
      return;
    }

    next(error);
  });
}
