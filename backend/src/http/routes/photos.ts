import { Router } from 'express';
import multer from 'multer';
import { ordersService } from '../../services';
import { readDriveFolderId } from '../../data/connection';
import { NO_DRIVE_FOLDER_MESSAGE, driveReady, savePhoto } from '../../google/drive';
import { requireAuth } from '../middleware/auth';
import { asyncRoute, param, sendData } from '../middleware/respond';
import { AppError } from '../../core/errors';

export const photosRouter = Router();
photosRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

/**
 * Repair photos straight from the phone camera.
 * Files go to Drive, the app keeps only the link on the order.
 */
photosRouter.post(
  '/orders/:id/photos',
  upload.single('photo'),
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError('Please choose a photo.', 422, 'NO_PHOTO');
    const rootFolderId = readDriveFolderId();
    if (!driveReady(rootFolderId)) {
      throw new AppError(
        rootFolderId
          ? 'Photos need Google Drive. Connect Google Sheets first, then add photos.'
          : NO_DRIVE_FOLDER_MESSAGE,
        503,
        'DRIVE_OFFLINE',
      );
    }
    const orderId = param(req, 'id');
    const extension = (file.mimetype.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const stamp = Date.now();
    const location = await savePhoto({
      orderId,
      fileName: `${orderId}-${stamp}.${extension}`,
      content: file.buffer,
      mimeType: file.mimetype,
      rootFolderId,
    });
    const result = await ordersService.addOrderPhoto(orderId, location.link);
    sendData(res, result.data, result.warning);
  }),
);
