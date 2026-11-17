export type Language = 'id' | 'en';
export type ThemeMode = 'dark' | 'light';
export type ConnectionQualityLevel = 'good' | 'medium' | 'poor';
export type LayoutMode = 'grid' | 'speaker';
export type VirtualBgMode = 'none' | 'blur' | 'studio' | 'lounge';

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  authProvider: 'email' | 'google' | 'guest';
  avatarColor: string;
}

export interface MeetingRecord {
  id: string;
  code: string;
  title: string;
  hostId: string;
  hostName: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt: string | null;
  hasPassword: boolean;
  isLocked: boolean;
  waitingRoomEnabled: boolean;
  region: string;
  createdAt: string;
  endedAt: string | null;
  participantPeak: number;
  durationSec: number;
}

export interface ParticipantState {
  id: string;
  name: string;
  role: 'host' | 'cohost' | 'participant';
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
  connectionQuality: ConnectionQualityLevel;
  joinedAt: string;
  avatarColor: string;
}

export interface WaitingParticipant {
  id: string;
  name: string;
  requestedAt: string;
  avatarColor: string;
}

export interface ChatMessage {
  id: string;
  meetingCode: string;
  senderId: string;
  senderName: string;
  text: string;
  fileName?: string;
  fileDataUrl?: string;
  fileSize?: number;
  createdAt: string;
}

export interface ReactionEvent {
  id: string;
  senderId: string;
  senderName: string;
  emoji: string;
  timestamp: number;
}

export interface RoomTokenResponse {
  mode: 'livekit' | 'webrtc-mesh';
  token: string | null;
  livekitUrl: string | null;
  region: string;
  iceServers: RTCIceServer[];
  roomState: {
    code: string;
    title: string;
    hostId: string;
    isLocked: boolean;
    waitingRoomEnabled: boolean;
  };
}

export type WsClientMessage =
  | {
      type: 'room:join';
      code: string;
      participant: {
        id: string;
        name: string;
        isMuted: boolean;
        isCamOff: boolean;
        avatarColor: string;
      };
      passwordToken?: string;
    }
  | {
      type: 'participant:update';
      patch: Partial<
        Pick<
          ParticipantState,
          'isMuted' | 'isCamOff' | 'isScreenSharing' | 'isHandRaised' | 'isSpeaking' | 'connectionQuality'
        >
      >;
    }
  | {
      type: 'chat:send';
      text: string;
      fileName?: string;
      fileDataUrl?: string;
      fileSize?: number;
    }
  | {
      type: 'reaction:send';
      emoji: string;
    }
  | {
      type: 'waiting:admit';
      targetId: string;
    }
  | {
      type: 'waiting:reject';
      targetId: string;
    }
  | {
      type: 'host:mute-participant';
      targetId: string;
    }
  | {
      type: 'host:disable-cam';
      targetId: string;
    }
  | {
      type: 'host:kick-participant';
      targetId: string;
    }
  | {
      type: 'host:toggle-lock';
      isLocked: boolean;
    }
  | {
      type: 'host:toggle-waiting-room';
      enabled: boolean;
    }
  | {
      type: 'host:transfer-host';
      targetId: string;
    }
  | {
      type: 'host:toggle-cohost';
      targetId: string;
    }
  | {
      type: 'host:mute-all';
    }
  | {
      type: 'host:end-meeting';
    }
  | {
      type: 'rtc:signal';
      targetId: string;
      signal: unknown;
    };

export type WsServerMessage =
  | {
      type: 'room:joined';
      self: ParticipantState;
      participants: ParticipantState[];
      waitingQueue: WaitingParticipant[];
      messages: ChatMessage[];
      isLocked: boolean;
      waitingRoomEnabled: boolean;
      hostId: string;
    }
  | {
      type: 'room:waiting';
      code: string;
      title: string;
    }
  | {
      type: 'room:rejected';
      reason: string;
    }
  | {
      type: 'room:error';
      message: string;
    }
  | {
      type: 'room:state-sync';
      participants: ParticipantState[];
      waitingQueue: WaitingParticipant[];
      isLocked: boolean;
      waitingRoomEnabled: boolean;
      hostId: string;
    }
  | {
      type: 'chat:message';
      message: ChatMessage;
    }
  | {
      type: 'reaction:broadcast';
      reaction: ReactionEvent;
    }
  | {
      type: 'host:force-mute';
    }
  | {
      type: 'host:force-cam-off';
    }
  | {
      type: 'room:kicked';
      reason: string;
    }
  | {
      type: 'room:ended';
      endedBy: string;
    }
  | {
      type: 'rtc:signal';
      fromId: string;
      signal: unknown;
    };
