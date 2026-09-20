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
  TIMELINE = 'TIMELINE'
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