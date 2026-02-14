import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getCheckins, getProfile, getLatestCoachResponse, submitReply } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import AudioPlayer from '../components/AudioPlayer';

const DAILY_QUOTES = [
  { text: "The most common form of despair is not being who you are.", author: "Søren Kierkegaard" },
  { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle" },
  { text: "The privilege of a lifetime is to become who you truly are.", author: "Carl Jung" },
  { text: "We do not need magic to transform our world. We carry all the power we need inside ourselves already.", author: "J.K. Rowling" },
  { text: "Your task is not to seek for love, but merely to seek and find all the barriers within yourself that you have built against it.", author: "Rumi" },
  { text: "The only way to make sense out of change is to plunge into it, move with it, and join the dance.", author: "Alan Watts" },
  { text: "Until you make the unconscious conscious, it will direct your life and you will call it fate.", author: "Carl Jung" },
  { text: "Be — don't try to become.", author: "Osho" },
  { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" },
  { text: "In every walk with nature, one receives far more than he seeks.", author: "John Muir" },
  { text: "The earth has music for those who listen.", author: "William Shakespeare" },
  { text: "Look deep into nature, and then you will understand everything better.", author: "Albert Einstein" },
  { text: "Vulnerability is not winning or losing; it's having the courage to show up and be seen when we have no control over the outcome.", author: "Brené Brown" },
  { text: "The wound is the place where the Light enters you.", author: "Rumi" },
  { text: "A man who dares to waste one hour of time has not discovered the value of life.", author: "Charles Darwin" },
];

function getDailyQuote() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

// ===== Dashboard Reply Form =====
function DashboardReplyForm({ checkinId, onSubmitted, onCancel }) {
  const [responseType, setResponseType] = useState(null);
  const [recording, setRecording] = useState(false);
  const [mediaBlob, setMediaBlob] = useState(null);
  const [textNote, setTextNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
      await submitReply(checkinId, formData);
      onSubmitted();
    } catch { alert('Failed to send reply.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="mt-3 bg-forest-700/50 rounded-xl p-4 border border-forest-600/30 animate-fade-in">
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
              {submitting ? 'Sending...' : 'Send'}
            </button>
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
                  {submitting ? 'Sending...' : 'Send'}
                </button>
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

export default function ClientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkins, setCheckins] = useState([]);
  const [streak, setStreak] = useState(0);
  const [customPractices, setCustomPractices] = useState([]);
  const [latestResponse, setLatestResponse] = useState(null);
  const [showReply, setShowReply] = useState(false);

  const loadData = () => {
    getProfile(user.id).then(p => setCustomPractices(p.customPractices || [])).catch(() => {});
    getLatestCoachResponse(user.id).then(data => setLatestResponse(data)).catch(() => {});
    getCheckins(user.id).then(data => {
      setCheckins(data);
      let s = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        if (data.some(c => c.date === dateStr)) {
          s++;
        } else if (i > 0) break;
      }
      setStreak(s);
    }).catch(() => {});
  };

  useEffect(() => { loadData(); }, [user.id]);

  const today = new Date().toISOString().split('T')[0];
  const checkedInToday = checkins.some(c => c.date === today);
  const lastCheckin = checkins[0];

  return (
    <div className="min-h-dvh bg-forest-900 pb-24 pt-16">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Greeting */}
        <div className="animate-fade-in mb-8">
          <h1 className="text-2xl font-light text-warm-white mb-1">
            Welcome back, <span className="text-gold-500">{user.name?.split(' ')[0]}</span>
          </h1>
          <p className="text-earth-500 text-sm mb-4">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          {(() => { const q = getDailyQuote(); return (
            <div className="py-2">
              <p className="text-gold-500 text-base font-medium leading-relaxed italic">"{q.text}"</p>
              <p className="text-warm-white text-sm mt-2 not-italic">— {q.author}</p>
            </div>
          ); })()}
        </div>

        {/* Latest Coach Response — prominent card */}
        {latestResponse?.coachResponse && (
          <div className="animate-slide-up stagger-1 opacity-0 mb-6">
            <div className="bg-forest-800 rounded-2xl p-5 border-2 border-gold-500/30 relative overflow-hidden">
              {/* Gold accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-500/60 via-gold-500 to-gold-500/60" />
              
              <div className="flex items-center gap-2 mb-3">
                <img src="/icons/coach-response.png" alt="Coach" className="w-10 h-10" />
                <div>
                  <h3 className="text-warm-white font-medium text-sm">Latest response from your coach</h3>
                  <p className="text-earth-500 text-xs">
                    {latestResponse.coachResponse.timestamp
                      ? new Date(latestResponse.coachResponse.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : new Date(latestResponse.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }
                  </p>
                </div>
              </div>

              {/* Response content */}
              <div className="bg-forest-700/40 rounded-xl p-4 border border-gold-500/10">
                {latestResponse.coachResponse.text && (
                  <p className="text-earth-200 text-sm leading-relaxed">"{latestResponse.coachResponse.text}"</p>
                )}
                {latestResponse.coachResponse.mediaPath && latestResponse.coachResponse.type === 'video' && (
                  <video 
                    src={`/api/uploads/${latestResponse.coachResponse.mediaPath}`} 
                    controls 
                    preload="metadata" 
                    className="w-full rounded-lg mt-2" 
                  />
                )}
                {latestResponse.coachResponse.mediaPath && latestResponse.coachResponse.type === 'audio' && (
                  <AudioPlayer src={`/api/uploads/${latestResponse.coachResponse.mediaPath}`} className="mt-2" />
                )}
              </div>

              {/* Reply button */}
              {showReply ? (
                <DashboardReplyForm
                  checkinId={latestResponse.id}
                  onSubmitted={() => { setShowReply(false); loadData(); }}
                  onCancel={() => setShowReply(false)}
                />
              ) : (
                <button
                  onClick={() => setShowReply(true)}
                  className="mt-3 w-full py-2.5 bg-forest-700/40 hover:bg-forest-700/60 text-earth-400 hover:text-warm-white rounded-xl text-sm transition-all border border-forest-600/30 hover:border-forest-600/50 flex items-center justify-center gap-2"
                >
                  <img src="/icons/reply2-flipped.png" alt="Reply" className="w-6 h-6" />
                  Reply to your coach
                </button>
              )}
            </div>
          </div>
        )}

        {/* Streak Card */}
        <div className={`animate-slide-up ${latestResponse?.coachResponse ? 'stagger-2' : 'stagger-1'} opacity-0 bg-forest-800 rounded-2xl p-6 mb-6 border border-forest-700/50`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-earth-500 text-xs uppercase tracking-wider mb-1">Current Streak</p>
              <p className="text-4xl font-light text-gold-500">{streak} <span className="text-lg text-earth-500">days</span></p>
            </div>
            <img src="/icons/streak-flame.png" alt="Streak" className="w-14 h-14 opacity-90" />
          </div>
        </div>

        {/* Check-in CTA */}
        <div className={`animate-slide-up ${latestResponse?.coachResponse ? 'stagger-3' : 'stagger-2'} opacity-0`}>
          {checkedInToday ? (
            <div className="bg-forest-700/50 rounded-2xl p-6 mb-6 border border-forest-500/30 text-center">
              <img src="/icons/checkmark.png" alt="Done" className="w-10 h-10 mx-auto mb-3" />
              <h3 className="text-warm-white font-medium mb-1">Checked in today</h3>
              <p className="text-earth-500 text-sm">Great work. Keep showing up.</p>
            </div>
          ) : (
            <button
              onClick={() => navigate('/checkin')}
              className="w-full bg-gradient-to-r from-forest-700 to-forest-600 hover:from-forest-600 hover:to-forest-500 rounded-2xl p-6 mb-6 border border-forest-500/30 text-left transition-all duration-300 group animate-pulse-glow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-warm-white font-medium mb-1">Daily Check-in</h3>
                  <p className="text-earth-400 text-sm">Take a moment to reflect</p>
                </div>
                <img src="/icons/checkin2.png" alt="" className="w-10 h-10 group-hover:scale-110 transition-transform" />
              </div>
            </button>
          )}
        </div>

        {/* Recent check-in */}
        {lastCheckin && (
          <div className={`animate-slide-up ${latestResponse?.coachResponse ? 'stagger-4' : 'stagger-3'} opacity-0 bg-forest-800 rounded-2xl p-6 border border-forest-700/50`}>
            <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-4">Last Check-in</h3>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[
                { icon: '/icons/heart.png', label: 'Heart', value: lastCheckin.ratings?.heart },
                { icon: '/icons/mind.png', label: 'Mind', value: lastCheckin.ratings?.mind },
                { icon: '/icons/presence.png', label: 'Presence', value: lastCheckin.ratings?.presence },
                { icon: '/icons/energy.png', label: 'Energy', value: lastCheckin.ratings?.energy },
                { icon: '/icons/connection2.png', label: 'Connection', value: lastCheckin.ratings?.connection },
              ].map((r, i) => (
                <div key={i} className="text-center">
                  <img src={r.icon} alt={r.label} className="w-6 h-6 mx-auto mb-1" />
                  <div className="text-warm-white font-medium">{r.value || '-'}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {lastCheckin.practices?.meditation && <span className="bg-forest-700 text-earth-400 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/meditation.png" alt="" className="w-4 h-4" /> Meditation</span>}
              {lastCheckin.practices?.breathwork && <span className="bg-forest-700 text-earth-400 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/breathwork.png" alt="" className="w-4 h-4" /> Breathwork</span>}
              {lastCheckin.practices?.exercise && <span className="bg-forest-700 text-earth-400 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/exercise.png" alt="" className="w-4 h-4" /> Exercise</span>}
              {lastCheckin.practices?.nature && <span className="bg-forest-700 text-earth-400 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1"><img src="/icons/nature.png" alt="" className="w-4 h-4" /> Nature</span>}
              {customPractices.filter(p => lastCheckin.practices?.[`custom_${p}`]).map(p => (
                <span key={p} className="bg-forest-700 text-earth-400 text-xs px-2 py-1 rounded-full"><img src="/icons/diamond.png" alt="" className="w-4 h-4 inline" /> {p}</span>
              ))}
            </div>
            {/* Coach Response on latest check-in */}
            {lastCheckin?.coachResponse && (
              <div className="mt-4 bg-forest-700/40 rounded-xl p-3 border border-gold-500/15">
                <div className="flex items-center gap-2 mb-1">
                  <img src="/icons/coach-response.png" alt="" className="w-7 h-7" />
                  <span className="text-gold-500 text-xs font-medium">Coach Response</span>
                </div>
                {lastCheckin.coachResponse.text && (
                  <p className="text-earth-300 text-sm italic">"{lastCheckin.coachResponse.text}"</p>
                )}
                {lastCheckin.coachResponse.mediaPath && lastCheckin.coachResponse.type === 'video' && (
                  <video src={`/api/uploads/${lastCheckin.coachResponse.mediaPath}`} controls preload="metadata" className="w-full rounded-lg mt-2" />
                )}
                {lastCheckin.coachResponse.mediaPath && lastCheckin.coachResponse.type === 'audio' && (
                  <AudioPlayer src={`/api/uploads/${lastCheckin.coachResponse.mediaPath}`} className="mt-2" />
                )}
              </div>
            )}
            <button
              onClick={() => navigate('/history')}
              className="mt-4 text-gold-500 text-sm hover:text-gold-400 transition-colors"
            >
              View full history →
            </button>
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
