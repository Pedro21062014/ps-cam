import React, { useState, useEffect, useRef } from 'react';
import { auth, db, googleProvider } from './firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInAnonymously,
  GoogleAuthProvider
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  serverTimestamp, 
  query, 
  where, 
  deleteDoc,
  getDoc
} from "firebase/firestore";
import { UserProfile, AppMode, CameraCommand } from './types';
import { 
  Camera, Eye, LogOut, Zap, Bell, StopCircle, 
  HardDrive, QrCode, Mail, Lock, User, ArrowRight, 
  AlertCircle, Smartphone, RefreshCw, Trash2, Volume2, VolumeX,
  Wifi, Loader2, Activity, Disc, CheckCircle, Cloud, Film, Moon, Sun, SwitchCamera, Link, Infinity,
  Monitor, Settings2, UploadCloud
} from 'lucide-react';
import QRCode from 'react-qr-code';
import Scanner from './components/Scanner';
import MotionDetector from './components/MotionDetector';
import Timeline from './components/Timeline';

// Definição do PeerJS global
declare const Peer: any;

// Configuração otimizada para conexão mais rápida
const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  }
};

// Duração de cada clipe da linha do tempo (60s)
const SEGMENT_DURATION_MS = 60000; 

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mode, setMode] = useState<AppMode>(AppMode.SELECT);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');
  
  // Device States
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(false); 
  const [isMuted, setIsMuted] = useState(false); 
  const [motionDetected, setMotionDetected] = useState(false);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [videoQuality, setVideoQuality] = useState<'HD' | 'SD'>('SD');
  
  // Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [isAutoRecording, setIsAutoRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueueSize, setUploadQueueSize] = useState(0);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [uploadNotification, setUploadNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  
  // Data States
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  
  // Refs
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null); 
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<any>(null); 
  const unsubscribeRefs = useRef<(() => void)[]>([]); 
  
  // Recording Logic Refs
  const segmentTimeoutRef = useRef<any>(null);
  const isSegmentSwitchingRef = useRef(false);

  // Retry Refs
  const retryTimeoutRef = useRef<any>(null);
  const targetHostIdRef = useRef<string | null>(null);

  // Auth Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser({
          uid: currentUser.uid,
          displayName: currentUser.displayName || 'Guest',
          email: currentUser.email,
          photoURL: currentUser.photoURL
        });
        fetchUserSessions(currentUser.uid);
      } else {
        setUser(null);
        setMode(AppMode.SELECT);
        setActiveSessions([]);
        setGoogleAccessToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchUserSessions = (uid: string) => {
    const q = query(collection(db, "sessions"), where("hostId", "==", uid));
    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveSessions(sessions);
    });
  };

  const handleLogout = () => {
    cleanupSession();
    signOut(auth);
    setMode(AppMode.SELECT);
  };

  // --- CLEANUP ---
  const cleanupSession = () => {
    stopAutoRecording();
    
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    if (callRef.current) {
        callRef.current.close();
        callRef.current = null;
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    releaseWakeLock();

    unsubscribeRefs.current.forEach(unsub => unsub());
    unsubscribeRefs.current = [];

    setStatus('Disconnected');
    setSessionId(null);
    setIsFlashOn(false);
    setIsSoundOn(false);
    setMotionDetected(false);
    setIsUploading(false);
    setIsBackgroundMode(false);
    setFacingMode('environment'); 
    setVideoQuality('SD');
    setUploadNotification(null);
    targetHostIdRef.current = null;
  };

  // --- WAKE LOCK ---
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.error('Wake Lock error:', err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(console.error);
      wakeLockRef.current = null;
    }
  };

  const toggleBackgroundMode = async () => {
      if (isBackgroundMode) {
          setIsBackgroundMode(false);
      } else {
          await requestWakeLock();
          setIsBackgroundMode(true);
      }
  };

  // --- DRIVE INTEGRATION ---
  const connectToDrive = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        
        if (token) {
            setGoogleAccessToken(token);
            setGlobalError(null);
            return token;
        }
    } catch (error: any) {
        console.error("Drive Auth Error:", error);
        setGlobalError("Failed to link Google Drive.");
    }
    return null;
  };

  const uploadToDrive = async (blob: Blob) => {
    if (!googleAccessToken) {
        console.error("No Drive Token");
        setGlobalError("Drive Disconnected. Please Reconnect.");
        return;
    }

    setIsUploading(true);
    setUploadQueueSize(prev => prev + 1);
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `PS_CAM_${timestamp}.webm`;
        
        const metadata = {
            name: filename,
            mimeType: 'video/webm',
            description: 'Auto-recorded by PS Cam',
        };

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        reader.onload = async () => {
            const result = reader.result as string;
            // Remove the Data URL prefix (e.g., "data:video/webm;base64,")
            const base64Data = result.split(',')[1]; 

            const boundary = 'foo_bar_baz';
            const delimiter = "--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            // Correctly formatted multipart body with strict CRLF
            const multipartRequestBody =
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                '\r\n' +
                delimiter +
                'Content-Type: video/webm\r\n' +
                'Content-Transfer-Encoding: base64\r\n' +
                '\r\n' +
                base64Data +
                close_delim;

            try {
                const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + googleAccessToken,
                        'Content-Type': 'multipart/related; boundary=' + boundary
                    },
                    body: multipartRequestBody
                });

                if (!response.ok) {
                     const err = await response.json();
                     console.error("Drive API Error:", err);
                     setUploadNotification({msg: "Upload Failed", type: "error"});
                     if (err.error?.code === 401) {
                         setGlobalError("Drive Token Expired. Reconnect.");
                         setGoogleAccessToken(null); 
                     } else {
                         setGlobalError(`Upload Error: ${err.error?.message}`);
                     }
                } else {
                    console.log("Uploaded successfully:", filename);
                    setUploadNotification({msg: "Saved to Drive", type: "success"});
                }
            } catch (err) {
                 console.error("Network Upload Error:", err);
                 setUploadNotification({msg: "Network Error", type: "error"});
            } finally {
                setUploadQueueSize(prev => Math.max(0, prev - 1));
                setIsUploading(false);
                setTimeout(() => setUploadNotification(null), 4000);
            }
        };
        
    } catch (error: any) {
        console.error("Upload preparation error", error);
        setUploadQueueSize(prev => Math.max(0, prev - 1));
        setIsUploading(false);
    }
  };

  // --- AUTOMATIC SEGMENTED RECORDING ---
  
  const startAutoRecording = () => {
      if (!remoteVideoRef.current || !remoteVideoRef.current.srcObject) {
          return;
      }
      if (!googleAccessToken) {
          setGlobalError("Connect Drive to enable Timeline.");
          return;
      }
      
      console.log("Starting Auto Recording Cycle");
      setIsAutoRecording(true);
      setIsRecording(true);
      recordSegment();
  };

  const stopAutoRecording = () => {
      console.log("Stopping Auto Recording");
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
      
      // Check state to avoid error if already stopped
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      
      setIsAutoRecording(false);
      setIsRecording(false);
  };

  const recordSegment = () => {
      // Safety check: if stopped but timeout fired, do not continue
      if (!isAutoRecording && !isSegmentSwitchingRef.current && !isRecording) return;

      const stream = remoteVideoRef.current?.srcObject as MediaStream;
      if (!stream) {
          setIsAutoRecording(false);
          return;
      }

      chunksRef.current = [];
      try {
          // Fallback logic for mimeType
          let mimeType = 'video/webm';
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
              mimeType = 'video/webm;codecs=vp9';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
              mimeType = 'video/webm;codecs=vp8';
          }
            
          const recorder = new MediaRecorder(stream, { mimeType });

          recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                  chunksRef.current.push(e.data);
              }
          };

          recorder.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'video/webm' });
              
              if (blob.size > 0) {
                  setUploadNotification({msg: "Uploading...", type: "success"});
                  uploadToDrive(blob);
              } else {
                  console.warn("Recorded blob was empty. Skipping upload.");
              }
              
              chunksRef.current = [];
              
              // Only recurse if we are switching segments, not if the user stopped it
              if (isAutoRecording || isSegmentSwitchingRef.current) {
                  isSegmentSwitchingRef.current = false;
                  // If user clicked stop during the save process, abort recursion
                  if(isAutoRecording) {
                      setTimeout(() => recordSegment(), 200);
                  }
              }
          };

          // Timeslice 1s ensures chunks are generated regularly, preventing empty blobs on quick stops
          recorder.start(1000); 
          mediaRecorderRef.current = recorder;
          
          segmentTimeoutRef.current = setTimeout(() => {
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                  isSegmentSwitchingRef.current = true;
                  mediaRecorderRef.current.stop(); 
              }
          }, SEGMENT_DURATION_MS);

      } catch (e) {
          console.error("MediaRecorder Error", e);
          setGlobalError("Recording failed: Browser not supported.");
          setIsAutoRecording(false);
      }
  };

  // --- VIEWER LOGIC (Monitor) ---
  const startViewer = async (existingSessionId?: string) => {
    if (!user) return;
    
    // Auto-Connect Drive se não tiver token
    if (!googleAccessToken) {
        setGlobalError("Connect Drive to enable auto-recording.");
    }

    cleanupSession();
    setGlobalError(null);
    setMode(AppMode.VIEWER);
    setStatus('Initializing Peer...');

    try {
      const peer = new Peer(undefined, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('open', async (peerId: string) => {
        setStatus('Waiting for Camera...');
        
        let currentSessionId = existingSessionId;

        if (!currentSessionId) {
            const sessionRef = doc(collection(db, "sessions"));
            currentSessionId = sessionRef.id;
            
            await setDoc(sessionRef, {
                hostId: user.uid,
                peerId: peerId,
                status: 'waiting',
                createdAt: serverTimestamp(),
                deviceName: 'Viewer Monitor'
            });
        } else {
            await updateDoc(doc(db, "sessions", currentSessionId), {
                peerId: peerId,
                status: 'waiting'
            });
        }
        setSessionId(currentSessionId);

        const unsub = onSnapshot(doc(db, "sessions", currentSessionId!), (snapshot) => {
            const data = snapshot.data();
            if (data?.motionDetected) {
                setMotionDetected(true);
                setTimeout(() => setMotionDetected(false), 3000);
            }
            // Update local quality state if Camera acknowledges change (optional sync)
            if (data?.commands?.quality) {
                setVideoQuality(data.commands.quality);
            }
        });
        unsubscribeRefs.current.push(unsub);
      });

      peer.on('call', (call: any) => {
        setStatus('Answering...');
        call.answer(); 
        
        call.on('stream', (remoteStream: MediaStream) => {
            setStatus('Live');
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                
                // Reinicia gravação automática se a qualidade mudou ou reconectou
                if (googleAccessToken && isAutoRecording) {
                     stopAutoRecording(); // Para o anterior
                     setTimeout(() => {
                        setIsAutoRecording(true);
                        startAutoRecording();
                     }, 1000);
                } else if (googleAccessToken) {
                    setTimeout(() => {
                        setIsAutoRecording(true);
                        startAutoRecording();
                    }, 2000);
                }
            }
        });
      });

      peer.on('error', (err: any) => {
          console.error("PeerJS Error:", err);
          if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
               setGlobalError("Connection lost. Retrying...");
          }
      });

    } catch (err: any) {
      console.error(err);
      setGlobalError(err.message);
      setMode(AppMode.SELECT);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(window.confirm("Delete camera?")) {
        await deleteDoc(doc(db, "sessions", id));
    }
  };

  // --- CAMERA LOGIC (Celular) ---
  const startCamera = async (scannedId: string) => {
    if (!auth.currentUser) return;
    cleanupSession();
    setSessionId(scannedId);
    setMode(AppMode.CAMERA);
    setStatus('Accessing Camera...');
    setFacingMode('environment');

    try {
       // Start with SD by default for stability
       const constraints = {
           video: { 
               facingMode: 'environment',
               width: { ideal: 640 },
               height: { ideal: 480 }
           },
           audio: true
       };
       
       const stream = await navigator.mediaDevices.getUserMedia(constraints);
       localStreamRef.current = stream;
       if (localVideoRef.current) localVideoRef.current.srcObject = stream;
       
       requestWakeLock();

       const peer = new Peer(undefined, PEER_CONFIG);
       peerRef.current = peer;

       const initiateCall = (hostId: string) => {
           if (!peer || !localStreamRef.current) return;
           
           console.log("Calling Host PeerID:", hostId);
           targetHostIdRef.current = hostId;
           
           if (callRef.current) {
               callRef.current.close();
           }

           try {
               const call = peer.call(hostId, localStreamRef.current);
               callRef.current = call;

               call.on('close', () => {
                   setStatus('Host Disconnected');
                   callRef.current = null;
               });
               
               call.on('error', (e: any) => {
                   console.error("Call Error:", e);
               });

               updateDoc(doc(db, "sessions", scannedId), {
                   status: 'active',
                   cameraId: auth.currentUser!.uid,
                   deviceName: user?.displayName || 'Camera'
               }).catch(err => console.error("Error updating status", err));
               
               setStatus('Streaming');
           } catch (e) {
               console.error("Failed to make call:", e);
           }
       };

       peer.on('open', (myPeerId: string) => {
           setStatus('Connecting...');
           
           const sessionRef = doc(db, "sessions", scannedId);
           const unsub = onSnapshot(sessionRef, (snapshot) => {
               if (!snapshot.exists()) return;
               const data = snapshot.data();
               const hostPeerId = data.peerId;

               if (hostPeerId) {
                   if (!callRef.current || callRef.current.peer !== hostPeerId) {
                       initiateCall(hostPeerId);
                   }
               }
               if (data.commands) handleCameraCommands(data.commands);
           });
           unsubscribeRefs.current.push(unsub);
       });

       peer.on('error', (err: any) => {
           console.error("Peer Error:", err);
           
           if (err.type === 'peer-unavailable') {
               setStatus('Peer unavailable. Retrying...');
               if (targetHostIdRef.current) {
                   if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                   retryTimeoutRef.current = setTimeout(() => {
                       initiateCall(targetHostIdRef.current!);
                   }, 3000);
               }
           } else if (err.type === 'network' || err.type === 'disconnected' || err.type === 'socket-error') {
               setStatus('Network issue. Reconnecting...');
               setTimeout(() => peer.reconnect(), 2000);
           } else {
               setGlobalError(`Connection Error: ${err.type}`);
           }
       });

    } catch (err: any) {
        setGlobalError(err.message);
        setMode(AppMode.SELECT);
    }
  };

  const handleQualityChange = async (newQuality: 'HD' | 'SD') => {
      console.log(`Switching quality to ${newQuality}`);
      try {
          // Determine constraints
          // HD: 720p (1280x720) - Good balance for mobile
          // SD: VGA (640x480) - Stable, low bandwidth
          const constraints = {
              video: {
                  facingMode: facingMode,
                  width: { ideal: newQuality === 'HD' ? 1280 : 640 },
                  height: { ideal: newQuality === 'HD' ? 720 : 480 }
              },
              audio: true
          };

          const newStream = await navigator.mediaDevices.getUserMedia(constraints);
          
          // Stop old tracks to release camera
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => track.stop());
          }
          
          localStreamRef.current = newStream;
          if (localVideoRef.current) {
              localVideoRef.current.srcObject = newStream;
          }

          // Replace track in active call without hanging up
          if (callRef.current && callRef.current.peerConnection) {
              const videoTrack = newStream.getVideoTracks()[0];
              const audioTrack = newStream.getAudioTracks()[0];
              const senders = callRef.current.peerConnection.getSenders();
              
              const videoSender = senders.find((s: any) => s.track?.kind === 'video');
              const audioSender = senders.find((s: any) => s.track?.kind === 'audio');

              if (videoSender) await videoSender.replaceTrack(videoTrack);
              if (audioSender) await audioSender.replaceTrack(audioTrack);
          }

          setVideoQuality(newQuality);
          // Re-apply settings (like flash) if needed, as new stream resets them
          if (isFlashOn) handleCameraCommands({ flashlight: true, playSound: isSoundOn, recording: false, facingMode, quality: newQuality });

      } catch (err) {
          console.error("Failed to change quality", err);
          setGlobalError("Failed to switch quality");
      }
  };

  const handleSwitchCamera = async (targetMode?: 'user' | 'environment') => {
    const newMode = targetMode ? targetMode : (facingMode === 'environment' ? 'user' : 'environment');
    if (targetMode && facingMode === targetMode) return;
    
    try {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Preserve quality setting when switching camera
        const width = videoQuality === 'HD' ? 1280 : 640;
        const height = videoQuality === 'HD' ? 720 : 480;

        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newMode, width: { ideal: width }, height: { ideal: height } },
            audio: true
        });

        localStreamRef.current = newStream;
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = newStream;
        }

        if (callRef.current && callRef.current.peerConnection) {
            const videoTrack = newStream.getVideoTracks()[0];
            const audioTrack = newStream.getAudioTracks()[0];
            const senders = callRef.current.peerConnection.getSenders();
            const videoSender = senders.find((s: any) => s.track?.kind === 'video');
            const audioSender = senders.find((s: any) => s.track?.kind === 'audio');

            if (videoSender) videoSender.replaceTrack(videoTrack);
            if (audioSender) audioSender.replaceTrack(audioTrack);
        }

        setFacingMode(newMode);
        setIsFlashOn(false); 
        
    } catch (err) {
        console.error("Failed to switch camera", err);
        setGlobalError("Failed to switch camera");
    }
  };

  const handleCameraCommands = async (cmd: CameraCommand) => {
    // Handle Quality Change
    if (cmd.quality && cmd.quality !== videoQuality) {
        await handleQualityChange(cmd.quality);
        return; // handleQualityChange handles stream replacement, other commands might need re-application
    }

    if (cmd.facingMode && cmd.facingMode !== facingMode) {
        handleSwitchCamera(cmd.facingMode);
    }
    
    // Flash handling (depends on current stream capabilities)
    if (localStreamRef.current) {
        const track = localStreamRef.current.getVideoTracks()[0];
        const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        if (caps.torch) {
            track.applyConstraints({ advanced: [{ torch: cmd.flashlight }] } as any).catch(() => {});
        }
    }
    setIsFlashOn(cmd.flashlight);
    
    if (cmd.playSound) {
        if (!audioRef.current) {
            audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audioRef.current.loop = true;
        }
        audioRef.current.play().catch(() => {});
    } else {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }
    setIsSoundOn(cmd.playSound);
  };

  const triggerMotion = () => {
      if(sessionId) {
          updateDoc(doc(db, "sessions", sessionId), {
              motionDetected: true,
              lastMotion: serverTimestamp()
          }).catch(console.error);
      }
  };

  // --- AUTH HANDLERS ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: fullName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setAuthError(err.message.replace("Firebase:", "").trim());
    }
  };

  // --- RENDER: LOGIN ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-black">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px]" />
        
        <div className="w-full max-w-sm relative z-10">
          <div className="text-center mb-8 flex flex-col items-center">
            <img src="/ps-cam.png" alt="PS Cam Logo" className="w-28 h-28 mb-4 rounded-3xl shadow-2xl border border-white/10 object-contain" referrerPolicy="no-referrer" />
            <h1 className="text-3xl font-medium tracking-tight text-white mb-1">PS<span className="text-sky-400">.</span>Cam</h1>
            <p className="text-secondary text-sm">P2P Security System</p>
          </div>

          <div className="glass p-8 rounded-3xl shadow-2xl">
            {showScanner ? (
                 <Scanner onClose={() => setShowScanner(false)} onScan={(id) => {
                     setShowScanner(false);
                     signInAnonymously(auth)
                        .then(() => startCamera(id))
                        .catch(err => {
                            setGlobalError("Login error.");
                            setShowScanner(false);
                        });
                 }} />
            ) : (
                <>
                <button 
                    onClick={() => setShowScanner(true)}
                    className="w-full mb-8 bg-white text-black h-12 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
                >
                    <QrCode size={18} /> Connect as Camera
                </button>

                <form onSubmit={handleAuth} className="space-y-4">
                    {authError && <div className="text-danger text-xs text-center">{authError}</div>}
                    {isRegistering && (
                         <div className="bg-surfaceLight/50 rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3">
                            <User size={16} className="text-secondary" />
                            <input type="text" placeholder="Name" className="bg-transparent w-full outline-none text-sm placeholder-secondary/50 text-white" value={fullName} onChange={e => setFullName(e.target.value)} required />
                        </div>
                    )}
                    <div className="bg-surfaceLight/50 rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3">
                        <Mail size={16} className="text-secondary" />
                        <input type="email" placeholder="Email" className="bg-transparent w-full outline-none text-sm placeholder-secondary/50 text-white" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div className="bg-surfaceLight/50 rounded-xl px-4 py-3 border border-white/5 flex items-center gap-3">
                        <Lock size={16} className="text-secondary" />
                        <input type="password" placeholder="Password" className="bg-transparent w-full outline-none text-sm placeholder-secondary/50 text-white" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    
                    <button type="submit" className="w-full h-12 rounded-xl bg-surfaceLight border border-white/10 text-white font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                        {isRegistering ? 'Create Account' : 'Login'} <ArrowRight size={16} />
                    </button>
                </form>

                <div className="mt-6 flex justify-between text-xs text-secondary">
                    <button onClick={() => setIsRegistering(!isRegistering)} className="hover:text-white transition-colors">
                        {isRegistering ? 'Back to Login' : 'Create Account'}
                    </button>
                    <button onClick={() => signInWithPopup(auth, googleProvider)} className="hover:text-white transition-colors">Google Login</button>
                </div>
                </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: TIMELINE ---
  if (mode === AppMode.TIMELINE) {
    return (
        <Timeline 
            onBack={() => setMode(AppMode.SELECT)} 
            token={googleAccessToken}
            onConnect={connectToDrive}
        />
    );
  }

  // --- RENDER: VIEWER (Monitor) ---
  if (mode === AppMode.VIEWER) {
    const isConnected = status === 'Live' || status === 'Streaming';
    return (
      <div className="fixed inset-0 bg-black flex flex-col">
        {/* Header Overlay */}
        <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-start pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2">
                 <button onClick={() => setMode(AppMode.SELECT)} className="bg-black/20 backdrop-blur-md p-2 rounded-full text-white/80 hover:bg-white/10"><ArrowRight className="rotate-180" size={20}/></button>
                 
                 {!googleAccessToken ? (
                     <button onClick={connectToDrive} className="bg-blue-600/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-white hover:bg-blue-600 flex items-center gap-2 animate-pulse">
                         <Link size={12} /> Connect Drive (Required)
                     </button>
                 ) : (
                     <div className="bg-green-600/20 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium text-green-400 flex items-center gap-2 border border-green-500/20">
                         <Cloud size={12} /> Drive Active
                     </div>
                 )}
            </div>
            
            <div className="flex items-center gap-3">
                {isAutoRecording && (
                    <div className="px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md bg-red-600/30 text-red-400 flex items-center gap-2 border border-red-500/20">
                        <Infinity size={12} className="animate-pulse"/> Auto Rec
                    </div>
                )}
                
                {uploadQueueSize > 0 && (
                    <div className="px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md bg-blue-500/20 text-blue-400 flex items-center gap-2 animate-pulse">
                        <Cloud size={12}/> Uploading {uploadQueueSize}...
                    </div>
                )}
                
                <div className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md flex items-center gap-2 ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/60'}`}>
                    <Wifi size={12}/>
                    <span className="capitalize">{status}</span>
                </div>
            </div>
        </div>

        {globalError && (
             <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-red-500/80 backdrop-blur-md px-4 py-2 rounded-xl text-white text-sm flex items-center gap-2 shadow-lg">
                <AlertCircle size={16} /> {globalError}
                <button onClick={() => setGlobalError(null)} className="ml-2 hover:text-white/80"><Wifi size={12} className="rotate-45" /></button>
            </div>
        )}

        {/* Upload Notification Toast */}
        {uploadNotification && (
             <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-30 px-6 py-2 rounded-full font-medium text-sm flex items-center gap-2 shadow-lg animate-bounce ${uploadNotification.type === 'error' ? 'bg-red-600/90 text-white' : 'bg-blue-600/90 text-white'} backdrop-blur-md`}>
                <UploadCloud size={16} />
                {uploadNotification.msg}
            </div>
        )}

        {/* Video Container */}
        <div className="flex-1 relative bg-zinc-950 overflow-hidden flex items-center justify-center">
             <video 
                ref={remoteVideoRef}
                autoPlay 
                playsInline
                className="w-full h-full object-contain bg-black"
                muted={isMuted}
             />
            
             {/* Pairing Code Overlay */}
             {sessionId && status.includes('Waiting') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10 pointer-events-none">
                    <div className="bg-white p-2 rounded-xl mb-4 pointer-events-auto shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        <QRCode value={sessionId} size={180} />
                    </div>
                    <p className="text-white font-medium text-lg">Scan to Pair Camera</p>
                    <p className="font-mono text-xs text-zinc-600 mt-2 bg-white/5 px-2 py-1 rounded">{sessionId}</p>
                </div>
             )}

             {motionDetected && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-danger/80 backdrop-blur-md px-6 py-2 rounded-full text-white font-medium text-sm flex items-center gap-2 animate-bounce z-30 shadow-lg shadow-red-500/20">
                    <Bell size={16} /> Motion Detected
                </div>
            )}
        </div>

        {/* Controls Overlay */}
        <div className="glass-panel p-6 pb-8">
            <div className="flex justify-center gap-6">
                <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-4 rounded-full transition-all active:scale-95 ${!isMuted ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white'}`}
                >
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                
                {/* Auto Record Indicator / Manual Stop */}
                <button 
                    onClick={() => {
                        if (isAutoRecording) {
                            stopAutoRecording();
                        } else {
                            if (!googleAccessToken) {
                                setGlobalError("Connect Drive first");
                            } else {
                                startAutoRecording();
                            }
                        }
                    }}
                    className={`p-4 rounded-full transition-all active:scale-95 flex items-center justify-center relative ${isAutoRecording ? 'bg-white text-danger shadow-lg' : 'bg-white/10 text-white'}`}
                >
                    <Infinity size={24} className={isAutoRecording ? 'animate-pulse' : ''} />
                    {isAutoRecording && <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>}
                </button>
                
                <button 
                    onClick={() => {
                        const newState = !isFlashOn;
                        setIsFlashOn(newState);
                        if(sessionId) updateDoc(doc(db, "sessions", sessionId), { "commands.flashlight": newState });
                    }}
                    className={`p-4 rounded-full transition-all active:scale-95 ${isFlashOn ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white'}`}
                >
                    <Zap size={24} className={isFlashOn ? 'fill-black' : ''} />
                </button>
                
                {/* Quality Toggle */}
                 <button 
                    onClick={() => {
                        const newQuality = videoQuality === 'HD' ? 'SD' : 'HD';
                        setVideoQuality(newQuality);
                        if(sessionId) updateDoc(doc(db, "sessions", sessionId), { "commands.quality": newQuality });
                    }}
                    className={`p-4 rounded-full transition-all active:scale-95 flex flex-col items-center justify-center font-bold text-xs ${videoQuality === 'HD' ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white'}`}
                >
                   {videoQuality}
                </button>
                
                <button 
                    onClick={() => {
                        const newState = !isSoundOn;
                        setIsSoundOn(newState);
                        if(sessionId) updateDoc(doc(db, "sessions", sessionId), { "commands.playSound": newState });
                    }}
                    className={`p-4 rounded-full transition-all active:scale-95 ${isSoundOn ? 'bg-danger text-white shadow-lg' : 'bg-white/10 text-white'}`}
                >
                    <Bell size={24} className={isSoundOn ? 'fill-white' : ''} />
                </button>

                {/* Remote Switch Camera Button */}
                <button 
                    onClick={() => {
                        const newMode = facingMode === 'environment' ? 'user' : 'environment';
                        setFacingMode(newMode);
                        if(sessionId) updateDoc(doc(db, "sessions", sessionId), { "commands.facingMode": newMode });
                    }}
                    className={`p-4 rounded-full transition-all active:scale-95 bg-white/10 text-white`}
                >
                    <SwitchCamera size={24} />
                </button>
            </div>
        </div>
      </div>
    );
  }

  // --- RENDER: CAMERA ---
  if (mode === AppMode.CAMERA) {
    return (
        <div className="fixed inset-0 bg-black">
            {/* Background Mode Overlay (Screen Curtain) */}
            {isBackgroundMode && (
                <div 
                    onClick={toggleBackgroundMode} 
                    className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center text-zinc-800 cursor-pointer"
                >
                    <Moon size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium opacity-20">Background Mode Active</p>
                    <p className="text-xs mt-2 opacity-10">Tap to wake screen</p>
                </div>
            )}

            <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted // Always muted locally to prevent echo
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} // Mirror front camera
            />
            
            {/* Overlay UI */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 pointer-events-none">
                <div className="flex items-center gap-2 bg-red-500/20 px-3 py-1.5 rounded-full backdrop-blur-sm border border-red-500/20">
                    <div className="w-2 h-2 rounded-full bg-danger animate-pulse"></div>
                    <span className="text-xs font-bold text-red-200 tracking-widest">LIVE</span>
                </div>
                
                <div className="flex gap-2 pointer-events-auto">
                    {/* Switch Camera */}
                    <button 
                        onClick={() => handleSwitchCamera()}
                        className="p-3 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 hover:bg-white/10 transition-all"
                    >
                        <SwitchCamera size={24} />
                    </button>

                    {/* Background Mode Toggle */}
                    <button 
                        onClick={toggleBackgroundMode}
                        className="p-3 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 hover:bg-white/10 transition-all"
                    >
                        <Moon size={24} />
                    </button>
                    
                    <button onClick={() => { cleanupSession(); setMode(AppMode.SELECT); }} className="p-3 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 hover:bg-white/10 transition-all">
                        <StopCircle size={24} />
                    </button>
                </div>
            </div>
            
            <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-8 z-10 pointer-events-none">
                 <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${isFlashOn ? 'text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'text-white/30'}`}>
                    <Zap size={24} />
                 </div>
                 <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${isSoundOn ? 'text-danger scale-110 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-white/30'}`}>
                    <Bell size={24} />
                 </div>
                 <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${videoQuality === 'HD' ? 'text-blue-400 scale-110 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]' : 'text-white/30'}`}>
                    <span className="font-bold text-xs">{videoQuality}</span>
                 </div>
            </div>

            <MotionDetector videoRef={localVideoRef} onMotion={triggerMotion} active={true} />
        </div>
    );
  }

  // --- RENDER: DASHBOARD ---
  return (
    <div className="min-h-screen bg-background text-primary p-6">
        {showScanner && <Scanner onClose={() => setShowScanner(false)} onScan={(id) => { setShowScanner(false); startCamera(id); }} />}

        <header className="flex justify-between items-center mb-8 mt-2">
            <div className="flex items-center gap-3.5">
                <img src="/ps-cam.png" alt="PS Cam" className="w-12 h-12 rounded-2xl border border-white/10 shadow-md object-contain" referrerPolicy="no-referrer" />
                <div>
                    <h1 className="text-xl font-medium tracking-tight text-white flex items-center gap-1">PS<span className="text-sky-400">.</span>Cam</h1>
                    <p className="text-secondary text-xs">Welcome, {user.displayName}</p>
                </div>
            </div>
            <button onClick={handleLogout} className="p-2 bg-surfaceLight rounded-full text-secondary hover:text-white transition-colors" title="Logout">
                <LogOut size={18} />
            </button>
        </header>

        {globalError && (
             <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-danger text-sm flex items-center gap-3">
                <AlertCircle size={18} /> {globalError}
            </div>
        )}

        <div className="max-w-4xl mx-auto grid gap-8">
            <div className="grid grid-cols-2 gap-4">
                <button 
                    onClick={() => {
                        // Antes de iniciar o viewer, tenta conectar ao Drive
                        if(!googleAccessToken) {
                            connectToDrive().then(() => startViewer());
                        } else {
                            startViewer();
                        }
                    }} 
                    className="h-32 rounded-2xl bg-surface border border-white/5 hover:border-white/20 transition-all flex flex-col items-center justify-center gap-3 group active:scale-[0.98]"
                >
                    <div className="p-3 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                        <Eye size={24} className="text-white" />
                    </div>
                    <span className="text-sm font-medium text-secondary group-hover:text-white">New Monitor</span>
                </button>

                <button 
                    onClick={() => setShowScanner(true)}
                    className="h-32 rounded-2xl bg-surface border border-white/5 hover:border-white/20 transition-all flex flex-col items-center justify-center gap-3 group active:scale-[0.98]"
                >
                    <div className="p-3 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                        <Camera size={24} className="text-white" />
                    </div>
                    <span className="text-sm font-medium text-secondary group-hover:text-white">Connect Camera</span>
                </button>
            </div>

            {/* Timeline Button */}
            <button 
                onClick={() => setMode(AppMode.TIMELINE)}
                className="w-full bg-surface border border-white/5 hover:bg-surfaceLight transition-colors p-4 rounded-xl flex items-center justify-between group active:scale-[0.99]"
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                        <Film size={20} />
                    </div>
                    <div className="text-left">
                        <h3 className="text-sm font-medium text-white">Video Timeline</h3>
                        <p className="text-xs text-secondary mt-0.5">View recordings saved in Google Drive</p>
                    </div>
                </div>
                <ArrowRight size={18} className="text-secondary group-hover:text-white transition-colors" />
            </button>

            <div>
                <h2 className="text-sm font-medium text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                    <RefreshCw size={14} /> Active Devices
                </h2>
                
                <div className="space-y-3">
                    {activeSessions.length === 0 ? (
                        <div className="p-8 rounded-2xl border border-dashed border-white/10 text-center text-secondary text-sm">
                            No active monitors found.
                        </div>
                    ) : (
                        activeSessions.map(session => (
                            <div key={session.id} onClick={() => startViewer(session.id)} className="group bg-surface hover:bg-surfaceLight transition-colors p-4 rounded-xl border border-white/5 flex items-center justify-between cursor-pointer active:scale-[0.99]">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${session.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-white/5 text-secondary'}`}>
                                        <Smartphone size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-white">{session.deviceName || 'Camera Device'}</h3>
                                        <p className="text-xs text-secondary mt-0.5">
                                            {session.status === 'active' ? '● Streaming (P2P)' : '○ Ready to connect'}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={(e) => deleteSession(session.id, e)} className="p-2 text-secondary hover:text-danger opacity-0 group-hover:opacity-100 transition-all">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-surfaceLight/30 border border-white/5 flex items-start gap-3">
                <HardDrive size={18} className="text-secondary shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-sm font-medium text-white">PeerJS Mode Active</h4>
                    <p className="text-xs text-secondary mt-1 leading-relaxed">
                        Using PeerJS public cloud for signaling. Video is encrypted and transferred directly between devices (P2P). No video data touches any server.
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default App;