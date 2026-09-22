import React, { useState, useEffect, useRef } from 'react';
import { AndroidCamera, RemoteCommandType, RemoteCommandPayload } from '../types';
import { rtdb, db } from '../firebase';
import { ref, onValue, off, set } from 'firebase/database';
import { setDoc, doc } from 'firebase/firestore';
import { 
  ArrowLeft, 
  ExternalLink, 
  Copy, 
  Check, 
  Battery, 
  BatteryCharging, 
  BatteryLow, 
  BatteryMedium, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  Radio, 
  Globe, 
  Zap, 
  Bell, 
  SwitchCamera, 
  Cloud, 
  Wifi, 
  AlertTriangle,
  Send,
  Sparkles
} from 'lucide-react';

interface AndroidCameraViewerProps {
  camera: AndroidCamera;
  onBack: () => void;
}

export const AndroidCameraViewer: React.FC<AndroidCameraViewerProps> = ({ camera, onBack }) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamMode, setStreamMode] = useState<'local' | 'cloud' | 'webrtc'>('webrtc');
  const [isCleanMode, setIsCleanMode] = useState(true);
  const [localStreamError, setLocalStreamError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [cloudFrame, setCloudFrame] = useState<string | null>(null);
  const [lastFrameTime, setLastFrameTime] = useState<number | null>(null);
  const [cloudConnected, setCloudConnected] = useState(false);
  
  // Remote command feedback states
  const [flashActive, setFlashActive] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [sendingCommand, setSendingCommand] = useState<RemoteCommandType | null>(null);
  const [lastCommandStatus, setLastCommandStatus] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const deviceId = camera.deviceId || camera.id;
  const ip = camera.ipAddress || '';
  const port = camera.port || 8080;
  const webrtcRoomCode = (camera.roomCode || camera.pin || deviceId).replace(/\s+/g, '');
  const cleanParams = isCleanMode ? '&clean=true&controls=none&header=false&toolbar=false' : '';
  const webrtcViewerUrl = `https://video-chat-bvo.pages.dev/?mode=stream&role=viewer&room=${encodeURIComponent(webrtcRoomCode)}&embed=true${cleanParams}`;
  const webrtcSenderUrl = `https://video-chat-bvo.pages.dev/?mode=stream&role=sender&room=${encodeURIComponent(webrtcRoomCode)}&embed=true&audio=true&video=true${cleanParams}`;

  // Build proper local MJPEG stream URL (with /video support)
  const localBaseUrl = camera.streamUrl || (ip ? `http://${ip}:${port}/video` : '');
  const normalizedLocalStreamUrl = localBaseUrl
    ? (localBaseUrl.startsWith('http://') || localBaseUrl.startsWith('https://') 
        ? localBaseUrl 
        : `http://${localBaseUrl}`)
    : '';

  // 1. Listen to Cloud Frames from Firebase Realtime Database `/live_streams/{deviceId}/frame`
  useEffect(() => {
    if (!rtdb || !deviceId) return;

    const streamRef = ref(rtdb, `live_streams/${deviceId}/frame`);
    const fallbackStreamRef = ref(rtdb, `live_streams/${deviceId}`);

    const handleFrameData = (val: any) => {
      if (!val) return;
      setCloudConnected(true);
      setLastFrameTime(Date.now());

      let base64String = '';
      if (typeof val === 'string') {
        base64String = val;
      } else if (typeof val === 'object') {
        base64String = val.frame || val.image || val.data || val.base64 || '';
      }

      if (base64String) {
        const fullSrc = base64String.startsWith('data:image') 
          ? base64String 
          : `data:image/jpeg;base64,${base64String}`;
        setCloudFrame(fullSrc);
      }
    };

    const unsubMain = onValue(streamRef, (snap) => {
      const val = snap.val();
      if (val) {
        handleFrameData(val);
      }
    }, (err) => {
      console.warn("RTDB live_streams frame error:", err);
    });

    const unsubFallback = onValue(fallbackStreamRef, (snap) => {
      const val = snap.val();
      if (val && typeof val === 'object' && val.frame) {
        handleFrameData(val.frame);
      }
    }, () => {});

    return () => {
      off(streamRef);
      off(fallbackStreamRef);
    };
  }, [deviceId]);

  // If local stream errors out, suggest or automatically activate cloud mode
  const handleLocalStreamError = () => {
    setLocalStreamError(true);
    if (cloudFrame) {
      setStreamMode('cloud');
    }
  };

  // 2. Dispatch Remote Command to Firebase `/commands/{deviceId}`
  const sendRemoteCommand = async (commandType: RemoteCommandType) => {
    if (!deviceId) return;
    setSendingCommand(commandType);
    setLastCommandStatus(null);

    const payload: RemoteCommandPayload = {
      command: commandType,
      timestamp: Date.now(),
      sentBy: camera.userId || 'web-viewer',
      source: 'web'
    };

    try {
      // Send to Realtime Database `/commands/{deviceId}`
      if (rtdb) {
        await set(ref(rtdb, `commands/${deviceId}`), payload);
      }

      // Also send to Firestore `/commands/{deviceId}` for broad compatibility
      try {
        await setDoc(doc(db, "commands", deviceId), {
          ...payload,
          updatedAt: new Date()
        });
      } catch (err) {
        // Non-blocking firestore write
      }

      // Update local feedback toggle state
      if (commandType === 'FLASH_TOGGLE') {
        setFlashActive(prev => !prev);
        setLastCommandStatus('Comando de Lanterna enviado');
      } else if (commandType === 'SIREN_TOGGLE') {
        setSirenActive(prev => !prev);
        setLastCommandStatus('Comando de Sirene enviado');
      } else if (commandType === 'CAMERA_SWITCH') {
        setLastCommandStatus('Comando de Alternar Câmera enviado');
      }

      setTimeout(() => {
        setSendingCommand(null);
      }, 300);

      setTimeout(() => {
        setLastCommandStatus(null);
      }, 3000);
    } catch (err) {
      console.error("Failed to send command to Firebase:", err);
      setLastCommandStatus('Erro ao enviar comando');
      setSendingCommand(null);
    }
  };

  const copyToClipboard = () => {
    const url = streamMode === 'webrtc' ? webrtcViewerUrl : (normalizedLocalStreamUrl || `ID: ${deviceId}`);
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const handleReload = () => {
    setLocalStreamError(false);
    setReloadKey(prev => prev + 1);
  };

  const renderBatteryIcon = () => {
    const bat = camera.battery;
    if (camera.batteryCharging) return <BatteryCharging size={16} className="text-yellow-400" />;
    if (bat === undefined || bat === null) return <Battery size={16} className="text-secondary" />;
    if (bat <= 20) return <BatteryLow size={16} className="text-red-400" />;
    if (bat <= 50) return <BatteryMedium size={16} className="text-yellow-400" />;
    return <Battery size={16} className="text-green-400" />;
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-primary flex flex-col">
      {/* Top Header */}
      <header className="bg-surface border-b border-white/5 px-4 sm:px-6 py-3.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3.5">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors"
            title="Voltar ao catálogo"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-medium text-white">{camera.name || 'Android PS Cam'}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                camera.isOnline || camera.status === 'online' || cloudConnected
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-zinc-800 text-zinc-400 border border-white/5'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${camera.isOnline || camera.status === 'online' || cloudConnected ? 'bg-green-400' : 'bg-zinc-500'}`}></span>
                {camera.isOnline || camera.status === 'online' || cloudConnected ? 'Online' : 'Offline'}
              </span>

              {camera.pin && (
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono text-[11px] text-zinc-300">
                  PIN: {camera.pin}
                </span>
              )}
            </div>
            <p className="text-xs text-secondary mt-0.5 flex items-center gap-2">
              <span>Dispositivo: {deviceId}</span>
              {ip && (
                <>
                  <span>•</span>
                  <span>IP: {ip}:{port}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls & Stream Mode Switch */}
        <div className="flex items-center gap-2">
          {/* Stream Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-surfaceLight border border-white/5 text-xs font-medium">
            <button
              onClick={() => setStreamMode('webrtc')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                streamMode === 'webrtc' 
                  ? 'bg-white text-black font-semibold shadow-sm' 
                  : 'text-secondary hover:text-white'
              }`}
              title="Transmissão WebRTC P2P em tempo real de baixa latência (<200ms) sem erros de porta ou banco"
            >
              <Zap size={13} className={streamMode === 'webrtc' ? 'text-amber-500' : ''} />
              <span className="hidden sm:inline">WebRTC (VideoMeet)</span>
              <span className="sm:hidden">WebRTC</span>
            </button>

            <button
              onClick={() => {
                setStreamMode('local');
                setLocalStreamError(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                streamMode === 'local' 
                  ? 'bg-white text-black font-semibold' 
                  : 'text-secondary hover:text-white'
              }`}
              title="Transmissão direta de vídeo MJPEG via HTTP na rede local"
            >
              <Wifi size={13} />
              <span className="hidden sm:inline">Rede Local</span>
            </button>

            <button
              onClick={() => setStreamMode('cloud')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                streamMode === 'cloud' 
                  ? 'bg-white text-black font-semibold' 
                  : 'text-secondary hover:text-white'
              }`}
              title="Transmissão de frames Base64 via Firebase Realtime Database"
            >
              <Cloud size={13} />
              <span className="hidden sm:inline">Nuvem RTDB</span>
              {cloudConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
            </button>
          </div>

          {/* Clean Mode Button (Hide/Show VideoMeet buttons) */}
          {streamMode === 'webrtc' && (
            <button
              onClick={() => setIsCleanMode(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                isCleanMode 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-surfaceLight border-white/5 text-secondary hover:text-white'
              }`}
              title={isCleanMode ? "Modo Limpo Ativo: botões e barras do VideoMeet estão ocultos" : "Clique para ocultar os botões do VideoMeet"}
            >
              <Sparkles size={13} />
              <span className="hidden sm:inline">{isCleanMode ? 'Sem Botões' : 'Com Botões'}</span>
            </button>
          )}

          {camera.battery !== undefined && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surfaceLight border border-white/5 text-xs text-secondary font-medium">
              {renderBatteryIcon()}
              <span>{camera.battery}%</span>
            </div>
          )}

          <button
            onClick={handleReload}
            className="p-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors"
            title="Recarregar transmissão"
          >
            <RefreshCw size={16} />
          </button>

          {normalizedLocalStreamUrl && (
            <button
              onClick={() => window.open(normalizedLocalStreamUrl, '_blank', 'noopener,noreferrer')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors text-xs font-medium"
              title="Abrir URL do stream em nova aba"
            >
              <ExternalLink size={14} />
              <span>Aba</span>
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors"
            title="Tela cheia"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Main Stream Player & Controls Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 bg-zinc-950 relative">
        <div className="w-full max-w-5xl aspect-video bg-black rounded-2xl border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center">
          
          {/* Stream Overlay Status */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-medium text-white shadow-lg">
              <Radio size={14} className="text-red-500 animate-pulse" />
              <span>AO VIVO</span>
              <span className="text-white/40">•</span>
              <span className="text-zinc-300 font-mono text-[11px]">
                {streamMode === 'webrtc' 
                  ? `WebRTC P2P ${isCleanMode ? '(Modo Limpo)' : '(VideoMeet)'}` 
                  : streamMode === 'local' 
                    ? 'MJPEG Local' 
                    : 'Firebase Cloud Frame'}
              </span>
            </div>
          </div>

          {/* STREAM VIEWPORT: WEBRTC, LOCAL MJPEG OR CLOUD BASE64 */}
          {streamMode === 'webrtc' ? (
            <div className="w-full h-full relative flex flex-col bg-black">
              <iframe
                key={`webrtc-stream-${isCleanMode}`}
                src={webrtcViewerUrl}
                title={`Transmissão WebRTC ${camera.name}`}
                className="w-full h-full border-0"
                allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
                allowFullScreen
              />
            </div>
          ) : streamMode === 'local' ? (
            !localStreamError && normalizedLocalStreamUrl ? (
              <div className="w-full h-full relative flex items-center justify-center bg-black">
                <img 
                  id="liveView"
                  key={`mjpeg-${reloadKey}`}
                  src={`${normalizedLocalStreamUrl}${normalizedLocalStreamUrl.includes('?') ? '&' : '?'}t=${reloadKey}`}
                  alt={camera.name}
                  className="w-full h-full object-contain"
                  onError={handleLocalStreamError}
                />
              </div>
            ) : (
              /* Local Stream Fallback / Mixed Content notice */
              <div className="text-center p-6 max-w-md">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Globe size={24} />
                </div>
                <h3 className="text-sm font-medium text-white mb-1.5">Transmissão em Rede Local</h3>
                <p className="text-xs text-secondary leading-relaxed mb-4">
                  Se o navegador bloquear o stream HTTP direto na página HTTPS, use o modo <strong>WebRTC (VideoMeet)</strong> ou abra o link na rede local:
                </p>

                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => setStreamMode('webrtc')}
                    className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 text-black hover:bg-amber-400 font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg"
                  >
                    <Zap size={14} />
                    <span>Usar Transmissão WebRTC Ultra-Rápida (Recomendado)</span>
                  </button>

                  {cloudFrame && (
                    <button
                      onClick={() => setStreamMode('cloud')}
                      className="w-full inline-flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 font-medium py-2.5 px-4 rounded-xl text-xs transition-colors"
                    >
                      <Cloud size={14} />
                      <span>Alternar para Transmissão na Nuvem (Base64)</span>
                    </button>
                  )}

                  {normalizedLocalStreamUrl && (
                    <a
                      href={normalizedLocalStreamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 bg-surfaceLight hover:bg-white/10 text-white font-medium py-2.5 px-4 rounded-xl text-xs border border-white/5 transition-colors"
                    >
                      <ExternalLink size={14} />
                      <span>Abrir Stream em Nova Aba ({normalizedLocalStreamUrl})</span>
                    </a>
                  )}

                  <button
                    onClick={handleReload}
                    className="w-full inline-flex items-center justify-center gap-2 bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white font-medium py-2 px-4 rounded-xl text-xs border border-white/5 transition-colors"
                  >
                    <RefreshCw size={14} />
                    <span>Tentar Reconectar</span>
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Cloud Base64 Stream Mode */
            cloudFrame ? (
              <div className="w-full h-full relative flex items-center justify-center bg-black">
                <img 
                  id="liveView"
                  src={cloudFrame} 
                  alt="Transmissão ao vivo Firebase"
                  className="w-full h-full object-contain" 
                />
              </div>
            ) : (
              <div className="text-center p-6 max-w-sm">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                  <Cloud size={24} />
                </div>
                <h3 className="text-sm font-medium text-white mb-1.5">Aguardando Frames na Nuvem</h3>
                <p className="text-xs text-secondary leading-relaxed mb-3">
                  Escutando <code className="text-sky-300 font-mono text-[11px]">/live_streams/{deviceId}/frame</code> no Firebase Realtime Database.
                </p>
                <button
                  onClick={() => setStreamMode('webrtc')}
                  className="px-3.5 py-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-xs text-white font-medium border border-white/5 transition-colors"
                >
                  Alternar para WebRTC (VideoMeet)
                </button>
              </div>
            )
          )}

          {/* Bottom Stream Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-3.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-xs text-white/80">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-zinc-300 text-[11px]">
                {streamMode === 'webrtc' 
                  ? `Canal WebRTC: ${(camera.pin || deviceId).replace(/\s+/g, '')}` 
                  : streamMode === 'local' 
                    ? (normalizedLocalStreamUrl || 'Modo Local') 
                    : `RTDB: /live_streams/${deviceId}/frame`}
              </span>
              {lastFrameTime && streamMode === 'cloud' && (
                <span className="text-[10px] text-emerald-400">● Sincronizado</span>
              )}
              {streamMode === 'webrtc' && (
                <span className="text-[10px] text-emerald-400 hidden sm:inline">● P2P &lt;200ms</span>
              )}
            </div>
            
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md transition-colors text-[11px]"
              title="Copiar URL ou ID"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        {/* REMOTE CONTROLS BAR (Sent to /commands/{deviceId}) */}
        <div className="w-full max-w-5xl mt-4 p-4 rounded-2xl bg-surface border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2 rounded-xl bg-white/5 text-secondary">
              <Send size={16} />
            </div>
            <div>
              <h2 className="text-xs font-medium text-white uppercase tracking-wider">Controles Remotos (Firebase)</h2>
              <p className="text-[11px] text-secondary">
                {lastCommandStatus ? (
                  <span className="text-emerald-400 font-medium">{lastCommandStatus}</span>
                ) : (
                  <span>Envia comandos instantâneos para <code className="text-zinc-300 font-mono">/commands/{deviceId}</code></span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            {/* 1. Flashlight Toggle */}
            <button
              onClick={() => sendRemoteCommand('FLASH_TOGGLE')}
              disabled={sendingCommand === 'FLASH_TOGGLE'}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                flashActive 
                  ? 'bg-amber-400 text-black border-amber-300 font-semibold' 
                  : 'bg-surfaceLight hover:bg-white/10 text-white border-white/5'
              }`}
              title="Ligar/Desligar Lanterna no celular"
            >
              <Zap size={15} className={flashActive ? 'fill-black' : ''} />
              <span>{flashActive ? 'Lanterna Ligada' : 'Lanterna'}</span>
            </button>

            {/* 2. Siren Toggle */}
            <button
              onClick={() => sendRemoteCommand('SIREN_TOGGLE')}
              disabled={sendingCommand === 'SIREN_TOGGLE'}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                sirenActive 
                  ? 'bg-red-500 text-white border-red-400 font-semibold' 
                  : 'bg-surfaceLight hover:bg-white/10 text-white border-white/5'
              }`}
              title="Disparar Sirene de Alarme no celular"
            >
              <Bell size={15} className={sirenActive ? 'animate-bounce' : ''} />
              <span>{sirenActive ? 'Sirene Ativa' : 'Sirene'}</span>
            </button>

            {/* 3. Camera Switch (Front/Back) */}
            <button
              onClick={() => sendRemoteCommand('CAMERA_SWITCH')}
              disabled={sendingCommand === 'CAMERA_SWITCH'}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-surfaceLight hover:bg-white/10 text-white border border-white/5 text-xs font-medium transition-colors"
              title="Alternar entre Câmera Frontal e Traseira"
            >
              <SwitchCamera size={15} />
              <span>Trocar Câmera</span>
            </button>
          </div>
        </div>

        {/* Telemetry Panel */}
        <div className="w-full max-w-5xl mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl bg-surface border border-white/5">
            <span className="text-[10px] text-secondary uppercase font-medium">Endereço IP</span>
            <p className="text-xs font-mono text-white mt-0.5 truncate">{ip || 'Automático (Cloud)'}</p>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-white/5">
            <span className="text-[10px] text-secondary uppercase font-medium">Porta / Rota</span>
            <p className="text-xs font-mono text-white mt-0.5 truncate">{port || '8080'}/video</p>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-white/5">
            <span className="text-[10px] text-secondary uppercase font-medium">Bateria do Celular</span>
            <p className="text-xs text-white mt-0.5 flex items-center gap-1.5">
              {renderBatteryIcon()}
              <span>{camera.battery !== undefined ? `${camera.battery}%` : 'Normal'}</span>
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-white/5">
            <span className="text-[10px] text-secondary uppercase font-medium">Canal de Transmissão</span>
            <p className="text-xs text-white mt-0.5 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${streamMode === 'local' ? 'bg-sky-400' : 'bg-emerald-400'}`}></span>
              <span>{streamMode === 'local' ? 'MJPEG Direto' : 'Firebase RTDB'}</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AndroidCameraViewer;
