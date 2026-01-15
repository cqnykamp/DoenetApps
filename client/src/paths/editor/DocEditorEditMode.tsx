import { useCallback, useEffect, useRef } from "react";
import { useBlocker, useLoaderData, useOutletContext } from "react-router";
import { DoenetmlVersion } from "../../types";
// import { DoenetEditor } from "@doenet/doenetml-iframe";
import axios, { AxiosError } from "axios";
import { EditorContext } from "./EditorHeader";
import { CollaborationProvider } from "../../utils/collaboration";
import CodeMirror from "../../utils/CodeMirror";

export async function loader({ params }: { params: any }) {
  const {
    data: { source, doenetmlVersion },
  } = await axios.get(`/api/editor/getDocEditorDoenetML/${params.contentId}`);

  return {
    source,
    doenetmlVersion,
  };
}

/**
 * This page allows you to edit your doenetml and save it to the server.
 * Context: `documentEditor`
 */
export function DocEditorEditMode() {
  const { contentId, assignmentStatus } = useOutletContext<EditorContext>();
  const readOnly = assignmentStatus !== "Unassigned";

  const { source, doenetmlVersion } = useLoaderData() as {
    source: string;
    doenetmlVersion: DoenetmlVersion;
  };

  const baseUrl = window.location.protocol + "//" + window.location.host;
  const doenetViewerUrl = `${baseUrl}/activityViewer`;

  // TODO: Why does this need a ref?
  const readOnlyRef = useRef(readOnly);

  const initialWarnings = formattedDeprecationWarnings(doenetmlVersion);

  /**
   * The current text in the editor.
   */
  const textEditorDoenetML = useRef(source);
  /**
   * The last saved version of the DoenetML.
   */
  const savedDoenetML = useRef(source);
  /**
   * The entity that provides collaboration features, `null` if not enabled.
   * Two way binding between the editor and the collaboration provider.
   * On local change -> tell provider about it
   * On remote change from provider -> update local editor
   */
  const collaborationProvider = useRef<CollaborationProvider | null>(null);

  /*
   * Indicates whether a save operation is currently in progress.
   */
  const inTheMiddleOfSaving = useRef(false);
  /**
   * Indicates whether a save operation was postponed due to an ongoing save.
   */
  const postponedSaving = useRef(false);

  // Other refs that get updated whenever `handleSaveDoc` is called
  const numVariants = useRef(1);
  const documentStructureChanged = useRef(false);

  function onLocalChange(newDoenetML: string) {
    console.log("local change");
    textEditorDoenetML.current = newDoenetML;
    // If the collaboration provider is enabled and the document changed because of local edits,
    // tell the collaboration provider about the local changes.
    // We don't tell the provider about changes that came from itself,
    // because that would cause a feedback loop.
    if (collaborationProvider.current) {
      collaborationProvider.current.updateText(newDoenetML);
    }
  }

  function onRemoteChange(newDoenetML: string) {
    console.log("remote change");
    textEditorDoenetML.current = newDoenetML;
    // TODO: update DoenetEditor with remote changes
  }

  const handleSaveDoc = useCallback(async () => {
    console.log("save");
    if (
      readOnlyRef.current ||
      (savedDoenetML.current === textEditorDoenetML.current &&
        !documentStructureChanged.current)
    ) {
      return;
    }

    const newDoenetML = textEditorDoenetML.current;

    if (inTheMiddleOfSaving.current) {
      postponedSaving.current = true;
    } else {
      inTheMiddleOfSaving.current = true;

      //Save in localStorage
      // localStorage.setItem(cid,doenetML)

      try {
        const params = {
          doenetML: newDoenetML,
          contentId,
          numVariants: numVariants.current,
        };
        await axios.post("/api/updateContent/saveDoenetML", params);
        savedDoenetML.current = newDoenetML;
        documentStructureChanged.current = false;
      } catch (error) {
        if (error instanceof AxiosError) {
          alert(error.message);
        }
      }

      inTheMiddleOfSaving.current = false;

      //If we postponed then potentially
      //some changes were saved again while we were saving
      //so save again
      if (postponedSaving.current) {
        postponedSaving.current = false;
        handleSaveDoc();
      }
    }
  }, [contentId]);

  // Block when leaving this page to go to view mode
  const blocker = useBlocker(({ nextLocation }) =>
    nextLocation.pathname.endsWith(`${contentId}/view`),
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      (async () => {
        try {
          await handleSaveDoc(); // wait for save to finish
        } finally {
          blocker.proceed();
        }
      })();
    }
  }, [blocker, handleSaveDoc]);

  // save draft when leave page
  useEffect(() => {
    return () => {
      handleSaveDoc();
    };
  }, [handleSaveDoc]);

  // Set up collaboration provider
  useEffect(() => {
    if (readOnly) {
      return;
    }

    collaborationProvider.current = new CollaborationProvider({
      contentId,
      onRemoteChange: onRemoteChange,
      onError: (error) => {
        console.error("Collaboration error:", error);
      },
    });

    return () => {
      if (collaborationProvider.current) {
        collaborationProvider.current.destroy();
        collaborationProvider.current = null;
      }
    };
  }, [contentId, readOnly, handleSaveDoc]);

  /* <DoenetEditor
        height="100%"
        width="100%"
        doenetML={textEditorDoenetML.current}
        doenetmlChangeCallback={() => {
          // BUG on DoenetML: This callback is supposed to be called when doenetml saves, but it is also called
          // when doenet ml first renders
          // See https://github.com/Doenet/DoenetML/issues/525
          handleSaveDoc();
        }}
        immediateDoenetmlChangeCallback={onLocalChange}
        documentStructureCallback={(x: any) => {
          if (Array.isArray(x.args?.allPossibleVariants)) {
            numVariants.current = x.args.allPossibleVariants.length;
          }
          documentStructureChanged.current = true;
        }}
        doenetmlVersion={doenetmlVersion.fullVersion}
        initialWarnings={initialWarnings}
        border="none"
        readOnly={readOnly}
        doenetViewerUrl={doenetViewerUrl}
      /> */

  if (collaborationProvider.current) {
    return (
      <CodeMirror
        value={textEditorDoenetML.current}
        // onChange={onLocalChange}
        onChange={() => {}}
        yText={collaborationProvider.current.text}
      />
    );
  } else {
    return <p>Waiting for collaboration provider...</p>;
  }
}

function formattedDeprecationWarnings(doenetmlVersion: DoenetmlVersion) {
  return doenetmlVersion.deprecated
    ? [
        {
          level: 1,
          message: `DoenetML version
            ${doenetmlVersion.displayedVersion} is deprecated.
            ${doenetmlVersion.deprecationMessage}`,
          doenetMLrange: {},
        },
      ]
    : [];
}
