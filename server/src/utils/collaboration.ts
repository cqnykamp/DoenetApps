import express from "express";
import { Server as HocuspocusServer } from "@hocuspocus/server";
import * as Y from "yjs";
import { toUUID } from "./uuid";
import { getContentSource, updateContent } from "../query/activity";

// Shared Y.Text key for DoenetML content
const DOENETML_TEXT_FIELD = "doenetml";

export const collaborationRouter = express.Router();

export function setupHocuspocusServer() {
  return HocuspocusServer.configure({
    async onLoadDocument({ documentName, context }) {
      console.log("Loading document:", documentName);
      const contentId = toUUID(documentName);
      const loggedInUserId = context.userId as Uint8Array;
      const { source } = await getContentSource({
        contentId,
        loggedInUserId,
      });

      const ydoc = new Y.Doc();
      const text = ydoc.getText(DOENETML_TEXT_FIELD);
      text.insert(0, source);
      return ydoc;
    },
    async onStoreDocument({ document, documentName, context }) {
      console.log("Storing document:", documentName);
      const contentId = toUUID(documentName);
      const loggedInUserId = context.userId as Uint8Array;

      const text = document.getText(DOENETML_TEXT_FIELD).toString();
      await updateContent({
        contentId,
        source: text,
        loggedInUserId,
      });
    },
  });
}
