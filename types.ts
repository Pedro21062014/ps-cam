export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export enum AppMode {
  SELECT = 'SELECT',
  VIEWER = 'VIEWER',
  CAMERA = 'CAMERA',
  SCAN = 'SCAN',
  TIMELINE = 'TIMELINE',
  ANDROID_VIEWER = 'ANDROID_VIEWER'
}

export interface AndroidCamera {
  id: string;
  deviceId?: string;
  name: string;
  ipAddress?: string;
  port?: number | string;
  streamUrl?: string; // Format: http://IP:PORT/video or similar
  isOnline?: boolean;
  status?: 'online' | 'offline' | string;
  battery?: number;
  batteryCharging?: boolean;
  userId?: string;
  userEmail?: string;
  pin?: string;
  roomCode?: string;
  lastSeen?: any;
  updatedAt?: any;
  source?: 'firestore' | 'rtdb' | 'firestore-user' | 'rtdb-user' | 'manual' | 'pin';
}

export type RemoteCommandType = 'FLASH_TOGGLE' | 'SIREN_TOGGLE' | 'CAMERA_SWITCH';

export interface RemoteCommandPayload {
  command: RemoteCommandType | string;
  timestamp: number;
  sentBy?: string;
  source?: string;
}

export interface CameraCommand {
  flashlight: boolean;
  playSound: boolean;
  recording: boolean;
  facingMode?: 'user' | 'environment';
  quality?: 'HD' | 'SD';
}

export interface SessionData {
  hostId: string; // Dashboard User UID
  peerId?: string; // PeerJS ID for P2P connection
  cameraId?: string; 
  createdAt: any;
  status: 'waiting' | 'active';
  commands?: CameraCommand;
  deviceName?: string;
  motionDetected?: boolean;
}
