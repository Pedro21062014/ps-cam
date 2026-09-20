import React, { useState, useEffect, useRef } from 'react';
import { AndroidCamera } from '../types';
import { 
  ArrowLeft, 
  ExternalLink, 
  Copy, 
  Check, 
  Battery, 
  BatteryCharging, 
  BatteryLow, 
  BatteryMedium, 
  BatteryWarning, 
  Wifi, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  Camera, 
  Radio, 
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Globe
} from 'lucide-react';

interface AndroidCameraViewerProps {
  camera: AndroidCamera;
  onBack: () => void;
}

export const AndroidCameraViewer: React.FC<AndroidCameraViewerProps> = ({ camera, onBack }) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rawStreamUrl = camera.streamUrl || (camera.ipAddress && camera.port ? `http://${camera.ipAddress}:${camera.port}` : '');
  
  // Format stream url variants if needed
  const normalizedStreamUrl = rawStreamUrl.startsWith('http://') || rawStreamUrl.startsWith('https://')
    ? rawStreamUrl
    : `http://${rawStreamUrl}`;

  const copyToClipboard = () => {
    if (!normalizedStreamUrl) return;
    navigator.clipboard.writeText(normalizedStreamUrl);
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
    setStreamError(false);
    setReloadKey(prev => prev + 1);
  };

  const renderBatteryIcon = () => {
    const bat = camera.battery;
    if (camera.batteryCharging) return <BatteryCharging size={18} className="text-yellow-400" />;
    if (bat === undefined || bat === null) return <Battery size={18} className="text-secondary" />;
    if (bat <= 20) return <BatteryLow size={18} className="text-red-400" />;
    if (bat <= 50) return <BatteryMedium size={18} className="text-yellow-400" />;
    return <Battery size={18} className="text-green-400" />;
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-primary flex flex-col">
      {/* Top Header */}
      <div className="bg-surface/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors"
            title="Voltar ao catálogo"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-medium text-white">{camera.name || 'Android PS Cam'}</h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                camera.isOnline || camera.status === 'online'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-zinc-800 text-zinc-400 border border-white/5'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${camera.isOnline || camera.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                {camera.isOnline || camera.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-secondary mt-0.5 flex items-center gap-2">
              <span>IP: {camera.ipAddress || 'Localhost'}:{camera.port || '8080'}</span>
              <span>•</span>
              <span>ID: {camera.id}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {camera.battery !== undefined && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surfaceLight border border-white/5 text-xs text-secondary font-medium">
              {renderBatteryIcon()}
              <span>{camera.battery}%</span>
            </div>
          )}

          <button
            onClick={handleReload}
            className="p-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors"
            title="Recarregar stream"
          >
            <RefreshCw size={18} />
          </button>

          <button
            onClick={() => window.open(normalizedStreamUrl, '_blank', 'noopener,noreferrer')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors text-xs font-medium"
            title="Abrir em nova aba"
          >
            <ExternalLink size={14} />
            <span>Abrir Aba</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-surfaceLight hover:bg-white/10 text-secondary hover:text-white transition-colors"
            title="Tela cheia"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {/* Main Stream Canvas Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-black relative">
        <div className="w-full max-w-5xl aspect-video bg-zinc-950 rounded-2xl border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center">
          
          {/* Stream Overlay Status */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-medium text-white">
              <Radio size={14} className="text-red-500 animate-pulse" />
              <span>TRANSMISSÃO AO VIVO</span>
            </div>
          </div>

          {/* Stream Element: Supporting MJPEG video/image stream & embed */}
          {!streamError ? (
            <div className="w-full h-full relative flex items-center justify-center bg-black">
              {/* Try image stream first for typical Android MJPEG server */}
              <img 
                key={`img-${reloadKey}`}
                src={`${normalizedStreamUrl}${normalizedStreamUrl.includes('?') ? '&' : '?'}t=${reloadKey}`}
                alt={camera.name}
                className="w-full h-full object-contain"
                onError={() => setStreamError(true)}
              />
            </div>
          ) : (
            /* Stream Fallback & Direct Connect panel */
            <div className="text-center p-8 max-w-md">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <Globe size={28} />
              </div>
              <h3 className="text-base font-medium text-white mb-2">Transmissão em Rede Local</h3>
              <p className="text-xs text-secondary leading-relaxed mb-6">
                O navegador pode restringir a reprodução direta HTTP dentro de páginas HTTPS (política de Mixed Content). Você pode visualizar a câmera diretamente pelo link da rede local:
              </p>

              <div className="flex flex-col gap-3">
                <a
                  href={normalizedStreamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 font-medium py-2.5 px-4 rounded-xl text-sm transition-colors"
                >
                  <ExternalLink size={16} />
                  <span>Abrir Transmissão ({normalizedStreamUrl})</span>
                </a>

                <button
                  onClick={handleReload}
                  className="w-full inline-flex items-center justify-center gap-2 bg-surfaceLight hover:bg-zinc-800 text-secondary hover:text-white font-medium py-2.5 px-4 rounded-xl text-sm border border-white/5 transition-colors"
                >
                  <RefreshCw size={16} />
                  <span>Tentar Reconectar no Navegador</span>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Stream Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-xs text-white/80">
            <div className="flex items-center gap-3">
              <span className="font-mono">{normalizedStreamUrl}</span>
            </div>
            
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md transition-colors"
              title="Copiar URL"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              <span>{copied ? 'Copiado!' : 'Copiar URL'}</span>
            </button>
          </div>
        </div>

        {/* Telemetry & Quick Info Panel below player */}
        <div className="w-full max-w-5xl mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface border border-white/5">
            <span className="text-[11px] text-secondary uppercase font-medium">Endereço IP</span>
            <p className="text-sm font-mono text-white mt-1">{camera.ipAddress || 'Não informado'}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface border border-white/5">
            <span className="text-[11px] text-secondary uppercase font-medium">Porta</span>
            <p className="text-sm font-mono text-white mt-1">{camera.port || '8080'}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface border border-white/5">
            <span className="text-[11px] text-secondary uppercase font-medium">Bateria</span>
            <p className="text-sm text-white mt-1 flex items-center gap-1.5">
              {renderBatteryIcon()}
              <span>{camera.battery !== undefined ? `${camera.battery}%` : 'N/A'}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-surface border border-white/5">
            <span className="text-[11px] text-secondary uppercase font-medium">Sincronização</span>
            <p className="text-sm text-white mt-1 flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-sky-400" />
              <span className="capitalize">{camera.source || 'Firebase Realtime'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AndroidCameraViewer;
