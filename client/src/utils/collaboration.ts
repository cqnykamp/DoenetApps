import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

const DOENETML_TEXT_FIELD = "doenetml";

const HOCUSPOCUS_URL =
  import.meta.env.VITE_HOCUSPOCUS_URL ||
  "ws://localhost:3001/api/collaboration";

export interface CollaborationProviderOptions {
  contentId: string;
  onRemoteChange?: (text: string) => void;
  onError?: (error: Error) => void;
}

export class CollaborationProvider {
  private provider: HocuspocusProvider;
  private ydoc: Y.Doc;
  text: Y.Text;
  private onRemoteChangeCallback?: (text: string) => void;

  constructor(options: CollaborationProviderOptions) {
    this.onRemoteChangeCallback = options.onRemoteChange;

    // Create Yjs document
    this.ydoc = new Y.Doc();
    this.text = this.ydoc.getText(DOENETML_TEXT_FIELD);

    // Set up HocusPocus provider
    this.provider = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: options.contentId,
      document: this.ydoc,
      onSynced: () => {
        if (this.text && this.onRemoteChangeCallback) {
          this.onRemoteChangeCallback(this.text.toString());
        }
      },
      onAuthenticationFailed: () => {
        if (options.onError) {
          options.onError(new Error("Authentication failed"));
        }
      },
    });

    // Listen for text changes
    // Use transaction origin to distinguish local vs remote changes
    this.text.observe((event) => {
      // Only trigger callback for remote changes
      // Local changes have origin === 'local' (set in updateText method)
      // Remote changes from HocusPocus will have origin === null
      if (
        event.transaction.origin !== "local" &&
        this.text &&
        this.onRemoteChangeCallback
      ) {
        this.onRemoteChangeCallback(this.text.toString());
      }
    });
  }

  /**
   * Update the shared text. Call this when the local editor changes.
   */
  updateText(newText: string) {
    const currentText = this.text.toString();
    if (currentText === newText) {
      return;
    }

    // Replace entire content (simple approach)
    // For production, consider using a diff algorithm for better performance
    // Tag this transaction with 'local' origin so observers can distinguish it from remote changes
    this.ydoc!.transact(() => {
      this.text!.delete(0, this.text!.length);
      this.text!.insert(0, newText);
    }, "local");
  }

  /**
   * Clean up provider and listeners
   */
  destroy() {
    this.provider.destroy();
    this.ydoc.destroy();
  }
}
