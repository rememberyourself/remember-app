import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getResources, mediaUrl } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';

export default function Toolbox() {
  const { user } = useAuth();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getResources(user.id)
      .then(data => { setResources(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="min-h-dvh bg-forest-900 pb-36 pt-16 pwa-safe-top">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <img src="/icons/toolbox.png" alt="Toolbox" className="w-8 h-8" />
          <h1 className="text-xl font-light text-warm-white">Toolbox</h1>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-pulse text-earth-500">Loading resources...</div>
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📂</div>
            <p className="text-earth-500">No resources yet.</p>
            <p className="text-earth-600 text-sm mt-1">Your coach will share materials here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {resources.map((r, i) => (
              <div
                key={r.id}
                className="animate-slide-up bg-forest-800 rounded-xl p-4 border border-forest-700/50"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {r.type === 'pdf' && <img src="/icons/pdf-icon.png" alt="PDF" className="w-6 h-6" />}
                    {r.type === 'video' && <img src="/icons/video-icon.png" alt="Video" className="w-6 h-6" />}
                    {r.type === 'image' && <img src="/icons/image-icon.png" alt="Image" className="w-6 h-6" />}
                    {!['pdf','video','image'].includes(r.type) && <img src="/icons/pdf-icon.png" alt="File" className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-warm-white font-medium text-sm">{r.title}</h3>
                    {r.description && (
                      <p className="text-earth-400 text-xs mt-1">{r.description}</p>
                    )}
                    <p className="text-earth-600 text-[10px] mt-2">
                      {new Date(r.timestamp).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                {r.type === 'pdf' && (
                  <a
                    href={mediaUrl(r.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 rounded-xl text-sm font-medium transition-all border border-gold-500/20 hover:border-gold-500/30"
                  >
                    <img src="/icons/pdf-icon.png" alt="" className="w-4 h-4" /> Open PDF
                  </a>
                )}
                {r.type === 'video' && (
                  <video
                    src={mediaUrl(r.filePath) + '#t=0.001'}
                    controls
                    preload="auto"
                    className="w-full rounded-lg mt-3"
                  />
                )}
                {r.type === 'image' && (
                  <img
                    src={mediaUrl(r.filePath)}
                    alt={r.title}
                    className="w-full rounded-lg mt-3 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(mediaUrl(r.filePath), '_blank')}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
