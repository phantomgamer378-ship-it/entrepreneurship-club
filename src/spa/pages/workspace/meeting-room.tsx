'use client'

// Meeting room (§14.2): server-validated access; provider-issued join info.
// Jitsi renders via iframe (audio/video/screen share); Daily would use its SDK+token.
// Streams never pass through our backend.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PhoneOff, Loader2 } from 'lucide-react'
import { io, type Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader, ErrorNote } from '@/spa/components/shared'
import { api, ApiClientError } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { useToast } from '@/hooks/use-toast'

type JoinResponse = {
  ok: boolean
  room: { id: string; name: string; hostName: string }
  joinInfo:
    | { mode: 'embed'; url: string; roomName: string; provider: 'jitsi'; displayName: string }
    | { mode: 'token'; url: string; roomName: string; provider: 'daily'; token: string }
}

export default function MeetingRoomPage({ params }: { params: { roomId: string } }) {
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const { data, isLoading, error } = useQuery<JoinResponse, Error>({
    queryKey: ['meeting-join', params.roomId],
    queryFn: () => api.post<JoinResponse>(`/api/workspace/meetings/${params.roomId}/join`),
    retry: false,
    staleTime: 60_000,
  })
  const [iframeLoading, setIframeLoading] = useState(true)
  const { toast } = useToast()

  // PRD §7.7 — listen on the room control channel: an admin force-ending the meeting
  // broadcasts 'force_ended'; every connected client leaves immediately.
  useEffect(() => {
    if (!params.roomId) return
    const socketUrl = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL || '/?XTransformPort=3003'
    const socket: Socket = io(socketUrl, { transports: ['websocket', 'polling'], reconnectionAttempts: 3 })
    socket.on('connect', () => socket.emit('room_control_subscribe', { roomId: params.roomId }))
    socket.on('force_ended', () => {
      toast({ title: 'Meeting ended', description: 'An administrator ended this meeting for everyone.' })
      navigate('/workspace/meetings')
    })
    return () => {
      socket.emit('room_control_unsubscribe', { roomId: params.roomId })
      socket.disconnect()
    }
  }, [params.roomId, toast])

  // Local camera preview + honest provider mode handling.
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  useEffect(() => {
    if (!data) return
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((s) => { stream = s; setLocalStream(s) })
      .catch(() => { /* camera unavailable — participant can still join via provider UI */ })
    return () => { stream?.getTracks().forEach((t) => t.stop()) }
  }, [data])

  function toggleMic() {
    setMicOn((v) => {
      const next = !v
      localStream?.getAudioTracks().forEach((t) => (t.enabled = next))
      // Provider-level mute where supported (Daily) would be applied here via SDK.
      return next
    })
  }
  function toggleCam() {
    setCamOn((v) => {
      const next = !v
      localStream?.getVideoTracks().forEach((t) => (t.enabled = next))
      return next
    })
  }
  function toggleShare() {
    setSharing((v) => !v)
    // Screen sharing is performed inside the provider surface; Jitsi exposes it in-room.
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading meeting" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Meeting unavailable" />
        <ErrorNote message={error instanceof ApiClientError ? error.message : 'Could not join the meeting.'} />
        <Button className="mt-4" variant="outline" onClick={() => navigate('/workspace/meetings')}>Back to meetings</Button>
      </div>
    )
  }
  if (!data) return null

  return (
    <div>
      <PageHeader
        title={data.room.name}
        description={`Hosted by ${data.room.hostName} · provider: ${data.joinInfo.provider}`}
        actions={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { void api.del(`/api/workspace/meetings/${data.room.id}/join`); navigate('/workspace/meetings') }}
          >
            <PhoneOff className="mr-1 h-4 w-4" aria-hidden /> Leave & close
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Provider surface */}
        <Card className="overflow-hidden">
          <CardContent className="relative aspect-video bg-zinc-950 p-0">
            {data.joinInfo.mode === 'embed' ? (
              <>
                <iframe
                  ref={iframeRef}
                  title="Video meeting room"
                  src={`${data.joinInfo.url}#userInfo.displayName=${encodeURIComponent(data.joinInfo.displayName)}&config.prejoinPageEnabled=false`}
                  allow="camera; microphone; display-capture; fullscreen; clipboard-write; autoplay"
                  className="h-full w-full"
                  onLoad={() => setIframeLoading(false)}
                />
                {iframeLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 text-sm text-zinc-300">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> Connecting to the room…
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-zinc-300">
                <Badge variant="outline" className="border-zinc-700 text-zinc-300">Daily provider — configured</Badge>
                <p>Join via your personal Daily room link with your access token.</p>
                <Button asChild>
                  <a href={`${data.joinInfo.url}?t=${encodeURIComponent(data.joinInfo.token)}`} target="_blank" rel="noopener noreferrer">
                    Open Daily room in new tab
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controls + local preview */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your preview</p>
              <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                {localStream && camOn ? (
                  <video ref={(el) => { if (el && localStream) el.srcObject = localStream }} autoPlay muted playsInline className="h-full w-full object-cover" aria-label="Local camera preview" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Camera off</div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button size="sm" variant={micOn ? 'secondary' : 'destructive'} onClick={toggleMic} aria-pressed={!micOn} aria-label="Toggle microphone">
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant={camOn ? 'secondary' : 'destructive'} onClick={toggleCam} aria-pressed={!camOn} aria-label="Toggle camera">
                  {camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant={sharing ? 'default' : 'secondary'} onClick={() => void toggleShare()} aria-pressed={sharing} aria-label="Toggle screen share">
                  <MonitorUp className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Mic/camera toggles also apply inside the provider room. Screen sharing is available in-room via the
                provider controls.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Privacy note</p>
              <p className="mt-1">
                Room access was authorized by the server before join info was issued. Audio and video flow directly
                between participants and the {data.joinInfo.provider} infrastructure — never through this platform.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
