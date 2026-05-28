import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { handleErrors } from "../errors/routeErrorHandler";
import { findViewableImage } from "./imageContent";
import { getImageStream } from "./s3";
import { serveImageParamSchema } from "./serve.schema";

export async function handleServeImage(req: Request, res: Response) {
  try {
    const { contentId } = serveImageParamSchema.parse(req.params);
    const image = await findViewableImage({
      contentId,
      loggedInUserId: req.user?.userId,
    });

    if (!image) {
      res.status(StatusCodes.NOT_FOUND).json({ error: "Not found" });
      return;
    }

    const { body, contentType, contentLength } = await getImageStream(
      image.storageKey,
    );

    res.setHeader("Content-Type", contentType ?? image.mimeType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    } else if (image.sizeBytes) {
      res.setHeader("Content-Length", image.sizeBytes.toString());
    }
    res.setHeader("Cache-Control", "private, max-age=300");

    body.on("error", (err) => {
      console.error("Media stream error", err);
      if (!res.headersSent) {
        res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ error: "Stream error" });
      } else {
        res.destroy(err);
      }
    });
    body.pipe(res);
  } catch (e) {
    handleErrors(res, e);
  }
}
