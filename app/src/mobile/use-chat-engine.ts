import { useStore } from '@nanostores/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { useComposerActions } from '@/app/chat/hooks/use-composer-actions'
import { useGatewayBoot } from '@/app/gateway/hooks/use-gateway-boot'
import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { useMessageStream } from '@/app/session/hooks/use-message-stream'
import { usePromptActions } from '@/app/session/hooks/use-prompt-actions'
import { useSessionActions } from '@/app/session/hooks/use-session-actions'
import { useSessionListActions } from '@/app/session/hooks/use-session-list-actions'
import { useSessionStateCache } from '@/app/session/hooks/use-session-state-cache'
import { $freshSessionRequest, $profileScope, refreshActiveProfile } from '@/store/profile'
import {
  $activeSessionId,
  $currentCwd,
  $gatewayState,
  $selectedStoredSessionId,
  setAwaitingResponse,
  setBusy,
  setMessages
} from '@/store/session'
import { useSkinCommand } from '@/themes/use-skin-command'

/**
 * Headless chat engine for the mobile shell.
 *
 * This is the P4 kill-criterion probe made permanent: it wires the same store
 * hooks `desktop-controller.tsx` uses, in the same order, with **no layout,
 * pane, window or titlebar state anywhere in the graph**. If this hook compiles
 * and streams, the stores are not entangled with the three-pane shell and the
 * mobile surface can be a sibling shell rather than a responsive retrofit.
 *
 * Deliberately omitted vs. the desktop controller, because they are desktop-only
 * concerns and not part of the chat data path:
 *   - `usePreviewRouting` (preview dev-server routing / Electron webview)
 *   - `useCwdActions` + `useHermesConfig` (project-branch + voice config; the
 *     mobile shell hardcodes `sttEnabled: false` until P6 wires voice)
 *   - `useRouteResume`, `useKeybinds`, pet/starmap/overlay wiring
 *   - `hydrateFromStoredSession` — a no-op here; it re-pulls a *stored*
 *     transcript after a turn ends. Resuming stored sessions is P4.5; live
 *     streaming does not go through it.
 */
export function useChatEngine() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const handleSkinCommand = useSkinCommand()

  const busyRef = useRef(false)
  const creatingSessionRef = useRef(false)

  const activeSessionId = useStore($activeSessionId)
  const selectedStoredSessionId = useStore($selectedStoredSessionId)
  const currentCwd = useStore($currentCwd)
  const profileScope = useStore($profileScope)

  const {
    activeSessionIdRef,
    ensureSessionState,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionIdRef,
    sessionStateByRuntimeIdRef,
    syncSessionStateToView,
    updateSessionState
  } = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId,
    setAwaitingResponse,
    setBusy,
    setMessages
  })

  const { connectionRef, gatewayRef, requestGateway } = useGatewayRequest()

  const { refreshSessions } = useSessionListActions({ profileScope })

  // The desktop controller re-pulls a stored transcript here. The mobile shell
  // renders the live `$messages` view directly, so there is nothing to rehydrate
  // into yet. Kept as an explicit no-op rather than dropped so the wiring stays
  // shaped like the desktop one when P4.5 adds session resume.
  const hydrateFromStoredSession = useCallback(async () => {}, [])
  const refreshHermesConfig = useCallback(async () => {}, [])

  const { handleGatewayEvent } = useMessageStream({
    activeSessionIdRef,
    hydrateFromStoredSession,
    queryClient,
    refreshHermesConfig,
    refreshSessions,
    sessionStateByRuntimeIdRef,
    updateSessionState
  })

  const getRouteToken = useCallback(() => '', [])

  const {
    createBackendSessionForSend,
    removeSession,
    resumeSession,
    startFreshSessionDraft
  } = useSessionActions({
    activeSessionId,
    activeSessionIdRef,
    busyRef,
    creatingSessionRef,
    ensureSessionState,
    getRouteToken,
    navigate,
    requestGateway,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionId,
    selectedStoredSessionIdRef,
    sessionStateByRuntimeIdRef,
    syncSessionStateToView,
    updateSessionState
  })

  const composer = useComposerActions({
    activeSessionId,
    currentCwd,
    requestGateway
  })

  const branchCurrentSession = useCallback(async () => false, [])

  const { cancelRun, submitText } = usePromptActions({
    activeSessionId,
    activeSessionIdRef,
    branchCurrentSession,
    busyRef,
    createBackendSessionForSend,
    handleSkinCommand,
    openMemoryGraph: () => {},
    refreshSessions,
    requestGateway,
    resumeStoredSession: resumeSession,
    selectedStoredSessionIdRef,
    startFreshSessionDraft,
    sttEnabled: false,
    updateSessionState
  })

  // Selecting a profile (or any other fresh-session request) bumps this counter;
  // the desktop controller owns the same effect. Without it `selectProfile()`
  // would retarget the NEXT session.create but leave the current transcript on
  // screen, so the switch would look like it had done nothing.
  const freshSessionRequest = useStore($freshSessionRequest)
  const lastFreshRef = useRef(freshSessionRequest)

  useEffect(() => {
    if (freshSessionRequest === lastFreshRef.current) {
      return
    }

    lastFreshRef.current = freshSessionRequest
    startFreshSessionDraft()
  }, [freshSessionRequest, startFreshSessionDraft])

  // Populate $profiles (and the active-profile pill) once the socket is up. The
  // desktop gets this via useHermesConfig/useModelControls, which the mobile
  // shell does not mount.
  const gatewayState = useStore($gatewayState)

  useEffect(() => {
    if (gatewayState === 'open') {
      void refreshActiveProfile()
    }
  }, [gatewayState])

  useGatewayBoot({
    handleGatewayEvent,
    onConnectionReady: c => {
      connectionRef.current = c
    },
    onGatewayReady: g => {
      gatewayRef.current = g
    },
    refreshHermesConfig,
    refreshSessions
  })

  return {
    cancelRun,
    composer,
    removeSession,
    requestGateway,
    resumeSession,
    startFreshSessionDraft,
    submitText
  }
}
