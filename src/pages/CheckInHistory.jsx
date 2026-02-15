import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getCheckins, submitReply, uploadWithProgress } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import AudioPlayer from '../components/AudioPlayer';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function formatDate(dateStr, createdAt) {
  if (createdAt) {
    const d = new Date(createdAt);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const RATING_COLORS = {
  heart: '#ef4444',
  mind: '#8b5cf6',
  presence: '#06b6d4',
  energy: '#f59e0b',
  connection: '#22c55e',
};

const RATING_LABELS = {
  heart: 'Heart',
  mind: 'Mind',
  presence: 'Presence',
  energy: 'Energy',
  connection: 'Connection',
};

const RATING_ICONS = {
  heart: '/icons/heart.png',
  mind: '/icons/mind.png',
  presence: '/icons/presence.png',
  energy: '/icons/energy.png',
  connection: '/icons/connection2.png',
};

const RATING_DETAILS = [
  { key: 'heart', label: 'Heart Connection', icon: '/icons/heart.png', color: '#ef4444' },
  { key: 'mind', label: 'Mind Activity', icon: '/icons/mind.png', color: '#8b5cf6' },
  { key: 'presence', label: 'Presence', icon: '/icons/presence.png', color: '#06b6d4' },
  { key: 'energy', label: 'Energy Level', icon: '/icons/energy.png', color: '#f59e0b' },
  { key: 'connection', label: 'Connection to Others', icon: '/icons/connection2.png', color: '#22c55e' },
];

// ===== Reply Form (Client side) =====
function ClientReplyForm({ checkinId, onSubmitted, onCancel }) {
  const [responseType, setResponseType] = useState(null);
  const [recording, setRecording] = useState(false);
  const [mediaBlob, setMediaBlob] = useState(null);
  const [textNote, setTextNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(async (type) => {
    try {
      const constraints = type === 'video'
        ? { video: { facingMode: 'user', width: { ideal: 720 } }, audio: true }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (type === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }
      const mimeType = type === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4')
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setMediaBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch { alert('Could not access camera/microphone.'); }
  }, []);

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) { mediaRecorderRef.current.stop(); setRecording(false); }
  };

  const handleSubmit = async () => {
    if (!responseType) return;
    if (responseType === 'text' && !textNote.trim()) return;
    if ((responseType === 'video' || responseType === 'audio') && !mediaBlob) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('from', 'client');
      formData.append('type', responseType);
      if (textNote) formData.append('text', textNote);
      if (mediaBlob) formData.append('media', mediaBlob, 'reply.webm');
      const API = import.meta.env.VITE_API_URL || '';
      await uploadWithProgress(`${API}/api/checkins/${checkinId}/reply`, formData, (pct) => setUploadProgress(pct));
      onSubmitted();
    } catch { alert('Failed to send reply.'); }
    finally { setSubmitting(false); setUploadProgress(null); }
  };

  return (
    <div className="mt-3 bg-forest-700/50 rounded-xl p-4 border border-forest-600/30 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <img src="/icons/reply2-flipped.png" alt="" className="w-8 h-8" />
        <h4 className="text-warm-white text-sm font-medium">Your Reply</h4>
      </div>
      {!responseType ? (
        <div className="grid grid-cols-3 gap-2">
          {[{ type: 'video', label: 'Video', icon: '/icons/video-icon.png' }, { type: 'audio', label: 'Voice', icon: '/icons/voice.png' }, { type: 'text', label: 'Text', icon: '/icons/write.png' }].map(opt => (
            <button key={opt.type} onClick={() => setResponseType(opt.type)}
              className="bg-forest-800 hover:bg-forest-600 border border-forest-600/50 rounded-lg p-3 text-center transition-all">
              <img src={opt.icon} alt={opt.label} className="w-8 h-8 mx-auto mb-1" />
              <span className="text-earth-400 text-xs">{opt.label}</span>
            </button>
          ))}
        </div>
      ) : responseType === 'text' ? (
        <div className="space-y-3">
          <textarea value={textNote} onChange={(e) => setTextNote(e.target.value)}
            placeholder="Your reply..." autoFocus
            className="w-full h-24 bg-forest-800 border border-forest-600/50 rounded-xl p-3 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 resize-none text-sm" />
          <div className="flex gap-2">
            <button onClick={() => { setResponseType(null); setTextNote(''); }}
              className="flex-1 py-2 bg-forest-800 text-earth-400 rounded-lg text-sm hover:bg-forest-600 transition-colors">Back</button>
            <button onClick={handleSubmit} disabled={submitting || !textNote.trim()}
              className="flex-1 py-2 bg-gold-500 text-forest-900 font-medium rounded-lg text-sm hover:bg-gold-400 transition-colors disabled:opacity-50">
              {submitting ? (uploadProgress !== null ? `Uploading... ${uploadProgress}%` : 'Sending...') : 'Send'}
            </button>
            {submitting && uploadProgress !== null && (
              <div className="w-full bg-forest-800 rounded-full h-1.5">
                <div className="bg-gold-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {responseType === 'video' && (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoPreviewRef} className="w-full h-full object-cover" muted playsInline />
              {mediaBlob && !recording && <video src={URL.createObjectURL(mediaBlob)} className="absolute inset-0 w-full h-full object-cover" controls />}
            </div>
          )}
          {responseType === 'audio' && mediaBlob && !recording && (
            <AudioPlayer src={URL.createObjectURL(mediaBlob)} />
          )}
          <div className="flex justify-center">
            {!recording && !mediaBlob ? (
              <button onClick={() => startRecording(responseType)}
                className="w-16 h-16 rounded-full bg-red-500/80 hover:bg-red-500 border-4 border-red-400/30 flex items-center justify-center transition-all hover:scale-105">
                <div className="w-6 h-6 bg-white rounded-full" />
              </button>
            ) : recording ? (
              <button onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-red-600 animate-pulse border-4 border-red-400/30 flex items-center justify-center">
                <div className="w-6 h-6 bg-white rounded-sm" />
              </button>
            ) : (
              <div className="flex gap-2 w-full">
                <button onClick={() => setMediaBlob(null)}
                  className="flex-1 py-2 bg-forest-800 text-earth-400 rounded-lg text-sm hover:bg-forest-600 transition-colors">Re-record</button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2 bg-gold-500 text-forest-900 font-medium rounded-lg text-sm hover:bg-gold-400 transition-colors disabled:opacity-50">
                  {submitting ? (uploadProgress !== null ? `Uploading... ${uploadProgress}%` : 'Sending...') : 'Send'}
                </button>
              </div>
            )}
          {submitting && uploadProgress !== null && (
            <div className="w-full bg-forest-800 rounded-full h-1.5 mt-2">
              <div className="bg-gold-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          </div>
          {!mediaBlob && !recording && (
            <button onClick={() => setResponseType(null)} className="w-full text-earth-600 text-xs py-1 hover:text-earth-400 transition-colors">← Choose different type</button>
          )}
          {recording && <p className="text-center text-red-400 text-xs animate-pulse">● Recording...</p>}
        </div>
      )}
      <button onClick={onCancel} className="mt-3 w-full text-earth-600 text-xs py-1 hover:text-earth-400 transition-colors">Cancel</button>
    </div>
  );
}

// ===== Thread Message Display =====
function ThreadMessage({ msg, isCoach }) {
  const borderColor = isCoach ? 'border-l-[#C9A96E]/60' : 'border-l-green-600/60';
  const label = isCoach ? <><img src="/icons/coach-response.png" alt="" className="w-8 h-8 inline" /> Coach</> : <><img src="/icons/client-reply.png" alt="" className="w-10 h-10 inline" /> You</>;
  const labelColor = isCoach ? 'text-gold-500' : 'text-green-400';

  return (
    <div className={`bg-forest-700/40 rounded-xl p-4 border-l-4 ${borderColor} border border-forest-600/20`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`${labelColor} text-base font-medium`}>{label}</span>
        <span className="text-earth-500 text-sm ml-auto">
          {new Date(msg.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {msg.text && <p className="text-earth-200 text-sm leading-relaxed">"{msg.text}"</p>}
      {msg.mediaPath && msg.type === 'video' && (
        <video src={`/api/uploads/${msg.mediaPath}#t=0.001`} controls preload="metadata" className="w-full rounded-lg mt-2" />
      )}
      {msg.mediaPath && msg.type === 'audio' && (
        <AudioPlayer src={`/api/uploads/${msg.mediaPath}#t=0.001`} className="mt-2" />
      )}
    </div>
  );
}

export default function CheckInHistory() {
  const { user } = useAuth();
  const [checkins, setCheckins] = useState([]);
  const [view, setView] = useState('list');
  const [replyingTo, setReplyingTo] = useState(null);

  const loadCheckins = () => {
    getCheckins(user.id).then(setCheckins).catch(() => {});
  };

  useEffect(() => { loadCheckins(); }, [user.id]);

  const chartData = [...checkins].reverse().map(c => ({
    date: c.date?.slice(5),
    ...c.ratings
  }));

  return (
    <div className="min-h-dvh bg-forest-900 pb-36 pt-16 pwa-safe-top">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-light text-warm-white">Your Journey</h1>
          <div className="flex bg-forest-800 rounded-lg p-1">
            <button onClick={() => setView('chart')}
              className={`px-3 py-1 rounded text-xs transition-colors ${view === 'chart' ? 'bg-forest-700 text-warm-white' : 'text-earth-500'}`}>
              Chart
            </button>
            <button onClick={() => setView('list')}
              className={`px-3 py-1 rounded text-xs transition-colors ${view === 'list' ? 'bg-forest-700 text-warm-white' : 'text-earth-500'}`}>
              List
            </button>
          </div>
        </div>

        {view === 'chart' && chartData.length > 0 && (
          <div className="animate-fade-in space-y-4">
            {/* Overview chart with all 5 lines */}
            <div className="bg-forest-800 rounded-2xl p-4 border border-forest-700/50">
              <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-4">Overview — All Dimensions</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" stroke="#6b5542" tick={{ fontSize: 10 }} />
                  <YAxis domain={[1, 10]} stroke="#6b5542" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#334440',
                      border: '1px solid #445648',
                      borderRadius: '12px',
                      color: '#e4eaee'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {Object.entries(RATING_COLORS).map(([key, color]) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      name={RATING_LABELS[key]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Individual graphs per dimension */}
            {RATING_DETAILS.map(dim => (
              <div key={dim.key} className="bg-forest-800 rounded-2xl p-4 border border-forest-700/50">
                <div className="flex items-center gap-2 mb-4">
                  <img src={dim.icon} alt={dim.label} className="w-9 h-9" />
                  <h3 className="text-warm-white text-base font-medium">{dim.label}</h3>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" stroke="#6b5542" tick={{ fontSize: 10 }} />
                    <YAxis domain={[1, 10]} stroke="#6b5542" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#334440',
                        border: '1px solid #445648',
                        borderRadius: '12px',
                        color: '#e4eaee'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey={dim.key}
                      stroke={dim.color}
                      name={dim.label}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: dim.color }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-3">
            {checkins.map((c, i) => (
              <div key={i} className="animate-slide-up bg-forest-800 rounded-xl p-4 border border-forest-700/50"
                   style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-warm-white text-base font-medium">{formatDate(c.date, c.createdAt)}</span>
{/* media type indicator removed */}
                </div>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {['heart', 'mind', 'presence', 'energy', 'connection'].map(key => (
                    <div key={key} className="text-center">
                      <img src={RATING_ICONS[key]} alt={RATING_LABELS[key]} className="w-9 h-9 mx-auto mb-1" />
                      <div className="text-warm-white font-medium text-sm">{c.ratings?.[key] || '-'}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {c.practices?.meditation && <span className="bg-forest-700 text-earth-500 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/meditation.png" alt="" className="w-5 h-5" /></span>}
                  {c.practices?.breathwork && <span className="bg-forest-700 text-earth-500 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/breathwork.png" alt="" className="w-5 h-5" /></span>}
                  {c.practices?.exercise && <span className="bg-forest-700 text-earth-500 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/exercise.png" alt="" className="w-5 h-5" /></span>}
                  {c.practices?.nature && <span className="bg-forest-700 text-earth-500 text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/nature.png" alt="" className="w-5 h-5" /></span>}
                </div>
                {c.textNote && (
                  <p className="text-earth-400 text-sm mt-2 italic">"{c.textNote}"</p>
                )}
                {c.mediaPath && c.mediaType === 'video' && (
                  <video src={`/api/uploads/${c.mediaPath}#t=0.001`} controls preload="metadata" className="w-full rounded-lg mt-3" />
                )}
                {c.mediaPath && c.mediaType === 'audio' && (
                  <AudioPlayer src={`/api/uploads/${c.mediaPath}#t=0.001`} className="mt-3" />
                )}
                {/* Conversation Thread */}
                {c.coachResponse && (
                  <div className="mt-4 pt-4 border-t border-gold-500/20 space-y-3">
                    {/* Initial coach response */}
                    <ThreadMessage msg={{ ...c.coachResponse, from: 'coach' }} isCoach={true} />

                    {/* Replies thread */}
                    {(c.replies || []).map((reply, ri) => (
                      <ThreadMessage key={ri} msg={reply} isCoach={reply.from === 'coach'} />
                    ))}

                    {/* Reply button or form */}
                    {replyingTo === c.id ? (
                      <ClientReplyForm
                        checkinId={c.id}
                        onSubmitted={() => { setReplyingTo(null); loadCheckins(); }}
                        onCancel={() => setReplyingTo(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setReplyingTo(c.id)}
                        className="w-full py-2 bg-forest-700/40 hover:bg-forest-700/60 text-earth-400 hover:text-warm-white rounded-xl text-sm transition-all border border-forest-600/30 hover:border-forest-600/50"
                      >
                        <img src="/icons/reply2-flipped.png" alt="" className="w-6 h-6 inline mr-1" /> Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {checkins.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🌱</div>
            <p className="text-earth-500">No check-ins yet. Start your journey.</p>
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
