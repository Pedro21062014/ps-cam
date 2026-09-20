import React, { useEffect, useState } from 'react';
import { ArrowLeft, Play, FileVideo, Calendar, Loader2, ExternalLink, Cloud } from 'lucide-react';

interface TimelineProps {
  onBack: () => void;
  token: string | null;
  onConnect: () => Promise<string | null | undefined>;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  webViewLink: string;
  thumbnailLink?: string;
}

const Timeline: React.FC<TimelineProps> = ({ onBack, token, onConnect }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Efeito apenas busca os arquivos se o token existir
  useEffect(() => {
    if (token) {
        fetchVideos(token);
    }
  }, [token]);

  const fetchVideos = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      // Query para buscar videos, excluindo lixeira
      const query = "mimeType contains 'video/' and trashed = false";
      const fields = "files(id, name, mimeType, createdTime, webViewLink, thumbnailLink)";
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=${encodeURIComponent(fields)}&pageSize=20`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
          if (response.status === 401) throw new Error("Token expired");
          throw new Error("Failed to fetch recordings");
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err: any) {
      console.error(err);
      if (err.message === "Token expired") {
          setError("Session expired. Please reconnect.");
      } else {
          setError("Could not load timeline.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
      setLoading(true);
      try {
          await onConnect();
          // O useEffect vai disparar automaticamente quando o token atualizar
      } catch (e) {
          setError("Login failed.");
          setLoading(false);
      }
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background text-primary p-6">
      <header className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 bg-surfaceLight rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-light">Security Timeline</h1>
      </header>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-danger mb-6 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {!token ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="p-6 bg-surface rounded-3xl mb-6 border border-white/5 shadow-2xl">
                  <Cloud size={48} className="text-blue-400 mx-auto mb-4" />
                  <h2 className="text-xl font-medium mb-2">Google Drive Access</h2>
                  <p className="text-secondary text-sm mb-6 max-w-xs">
                      Connect your Google Drive account to view recorded security footage.
                  </p>
                  <button 
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
                      Connect Drive
                  </button>
              </div>
          </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center h-64 text-secondary">
          <Loader2 size={32} className="animate-spin mb-4" />
          <p>Loading Drive recordings...</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {files.length === 0 ? (
            <div className="text-center py-12 text-secondary bg-surface rounded-2xl border border-white/5">
              <FileVideo size={48} className="mx-auto mb-4 opacity-20" />
              <p>No recordings found in Google Drive.</p>
            </div>
          ) : (
            files.map(file => (
              <a 
                key={file.id} 
                href={file.webViewLink} 
                target="_blank" 
                rel="noreferrer"
                className="block bg-surface hover:bg-surfaceLight transition-colors p-4 rounded-xl border border-white/5 group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-lg bg-black/50 flex items-center justify-center shrink-0 overflow-hidden relative">
                    {file.thumbnailLink ? (
                        <img src={file.thumbnailLink} alt="Thumb" className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                    ) : (
                        <Play size={20} className="text-white/50" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate pr-4">{file.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-secondary mt-1">
                      <Calendar size={12} />
                      {formatDate(file.createdTime)}
                    </div>
                  </div>

                  <div className="p-2 text-secondary group-hover:text-white transition-colors">
                    <ExternalLink size={18} />
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Timeline;