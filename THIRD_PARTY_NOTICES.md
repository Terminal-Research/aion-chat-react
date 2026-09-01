# Third-Party Notices

## CopilotKit

Selected chat presentation and Markdown composition code is adapted from
CopilotKit at pinned commit
`65bd05e3682ced8f424023f75627f8f833e52745`.

Adapted source inventory:

- `packages/react-core/src/v2/components/chat/CopilotChatView.tsx` to
  `src/AionChatView.tsx` and `src/AionChatTranscript.tsx`
- `packages/react-core/src/v2/components/chat/CopilotChatInput.tsx` to
  `src/AionChatComposer.tsx`
- `packages/react-core/src/v2/components/chat/CopilotChatMessageView.tsx` to
  `src/AionChatMessage.tsx`
- `packages/react-ui/src/components/chat/Markdown.tsx` to
  `src/AionChatMarkdown.tsx`

Reference-only candidates for later subtasks:

- `packages/react-core/src/v2/components/chat/CopilotChatAssistantMessage.tsx`
- `packages/react-core/src/v2/components/chat/CopilotPopupView.tsx`
- `packages/react-core/src/v2/components/chat/CopilotSidebarView.tsx`
- `packages/react-core/src/v2/lib/slots.tsx`

The reference-only files have not contributed copied or adapted code. Any file
adapted later must be moved into the adapted inventory and named in the
destination file's source-path header. CopilotKit runtime, AG-UI integration,
branding, and license-gating code are outside the adoption boundary.

CopilotKit is licensed under the MIT License. A copy of that license is stored
at [`LICENSES/CopilotKit-MIT.txt`](./LICENSES/CopilotKit-MIT.txt).
