import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import multer from "multer";
import { imageSize } from "image-size";
import { handleErrors } from "../errors/routeErrorHandler";
import { InvalidRequestError } from "../utils/error";
import { fromUUID } from "../utils/uuid";
import {
  createImageContent,
  deleteImageContent,
  setImageStorageKey,
} from "./imageContent";
import { deleteImage, putImage } from "./s3";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  uploadImageBodySchema,
} from "./upload.schema";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const uploadImageMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (
      (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

export async function handleUploadImage(req: Request, res: Response) {
  if (!req.user) {
    res.status(StatusCodes.FORBIDDEN).json({ error: "Must be logged in" });
    return;
  }
  const file = req.file;
  if (!file) {
    res
      .status(StatusCodes.UNSUPPORTED_MEDIA_TYPE)
      .json({ error: "Unsupported or missing image" });
    return;
  }
  try {
    const body = uploadImageBodySchema.parse(req.body);

    const dims = imageSize(file.buffer);
    if (!dims.width || !dims.height) {
      throw new InvalidRequestError(
        "Could not read image dimensions",
        StatusCodes.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    if (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION) {
      throw new InvalidRequestError(
        `Image too large (max ${MAX_IMAGE_DIMENSION}px per side)`,
        StatusCodes.UNPROCESSABLE_ENTITY,
      );
    }

    const fallbackName =
      file.originalname && file.originalname.trim()
        ? file.originalname.trim()
        : "Untitled Image";
    const name = body.name?.trim() || fallbackName;

    const ext = MIME_TO_EXT[file.mimetype] ?? "bin";

    // DB row first (id auto-generated). On Prisma 6 + MySQL binary PKs the
    // post-INSERT read fails when we pass an explicit id, so we let the DB
    // assign one and patch in the storage key after the upload succeeds.
    const { contentId, name: persistedName } = await createImageContent({
      loggedInUserId: req.user.userId,
      parentId: body.parentId,
      name,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      imageWidth: dims.width,
      imageHeight: dims.height,
    });

    const storageKey = `images/${fromUUID(contentId)}.${ext}`;

    try {
      await putImage({
        key: storageKey,
        body: file.buffer,
        contentType: file.mimetype,
      });
      await setImageStorageKey({
        contentId,
        ownerId: req.user.userId,
        storageKey,
      });
    } catch (storageErr) {
      // Roll back: remove the row (and the storage object if the put succeeded).
      try {
        await deleteImage(storageKey);
      } catch {
        // ignore
      }
      try {
        await deleteImageContent({
          contentId,
          ownerId: req.user.userId,
        });
      } catch {
        // ignore
      }
      throw storageErr;
    }

    res.status(StatusCodes.CREATED).json({
      contentId: fromUUID(contentId),
      name: persistedName,
    });
  } catch (e) {
    handleErrors(res, e);
  }
}

export function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: (err?: unknown) => void,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(StatusCodes.REQUEST_TOO_LONG).json({
        error: "File too large",
        details: `Max ${MAX_IMAGE_BYTES} bytes`,
      });
      return;
    }
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "Upload error", details: err.message });
    return;
  }
  next(err);
}
