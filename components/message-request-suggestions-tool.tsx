"use client";

import type { ArtifactKind } from "./artifact";
import { DocumentToolResult } from "./document";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";

type RequestSuggestionsOutput = {
  id: string;
  title: string;
  kind: ArtifactKind;
  error?: unknown;
};

interface MessageRequestSuggestionsToolProps {
  toolCallId: string;
  state: string;
  input: unknown;
  output: RequestSuggestionsOutput | undefined;
  isReadonly: boolean;
}

/**
 * Renderiza a tool requestSuggestions na mensagem: header, input e output ou erro.
 */
export function MessageRequestSuggestionsTool({
  toolCallId,
  state,
  input,
  output,
  isReadonly,
}: Readonly<MessageRequestSuggestionsToolProps>) {
  const hasError =
    output &&
    typeof output === "object" &&
    "error" in output;

  return (
    <Tool defaultOpen={true} key={toolCallId}>
      <ToolHeader state={state} type="tool-requestSuggestions" />
      <ToolContent>
        {state === "input-available" && <ToolInput input={input} />}
        {state === "output-available" && (
          <ToolOutput
            errorText={undefined}
            output={
              hasError ? (
                <div className="rounded border p-2 text-red-500">
                  Error: {String((output as { error: unknown }).error)}
                </div>
              ) : (
                <DocumentToolResult
                  isReadonly={isReadonly}
                  result={
                    output as {
                      id: string;
                      title: string;
                      kind: ArtifactKind;
                    }
                  }
                  type="request-suggestions"
                />
              )
            }
          />
        )}
      </ToolContent>
    </Tool>
  );
}
