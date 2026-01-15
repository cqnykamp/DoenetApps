import { UndoManager as YUndoManager, Text as YText } from "yjs";
import React from "react";
import { EditorSelection } from "@codemirror/state";
import ReactCodeMirror from "@uiw/react-codemirror";
import { yCollab } from "y-codemirror.next";

/**
 * A CodeMirror instance set up with a language server to provide completions/etc. for DoenetML.
 */
const CodeMirror = React.memo(function CodeMirror({
  value,
  onChange,
  onCursorChange,
  readOnly,
  onBlur,
  onFocus,
  yText,
}: {
  value: string;
  onChange?: (str: string) => void;
  onCursorChange?: (selection: EditorSelection) => any;
  readOnly?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  yText: YText;
}) {
  console.log(yText);
  const undoManager = new YUndoManager(yText);

  return (
    <div className="mathjax_ignore" style={{ height: "100%" }}>
      <ReactCodeMirror
        style={{ height: "100%" }}
        // value={value}
        basicSetup={{
          indentOnInput: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
        }}
        onChange={(editor, update) => {
          if (onChange) {
            onChange(update.state.doc.toString());
          }
        }}
        onUpdate={(viewUpdate) => {
          for (const tr of viewUpdate.transactions) {
            if (tr.selection && onCursorChange) {
              onCursorChange(tr.selection);
            }
          }
        }}
        onBlur={() => onBlur && onBlur()}
        onFocus={() => onFocus && onFocus()}
        height="100%"
        extensions={[yCollab(yText!, {}, { undoManager })]}
      />
    </div>
  );
});
export default CodeMirror;
