import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createCheckin, addCustomPractice, getProfile } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';

const RATINGS = [
  { key: 'heart', label: 'Heart Connection', icon: '/icons/heart.png', desc: 'How connected do you feel to your heart?' },
  { key: 'mind', label: 'Mind Activity', icon: '/icons/mind.png', desc: 'How busy is your mind right now?' },
  { key: 'presence', label: 'Presence', icon: '/icons/presence.png', desc: 'How present are you in this moment?' },
  { key: 'energy', label: 'Energy Level', icon: '/icons/energy.png', desc: 'How energized do you feel?' },
  { key: 'connection', label: 'Connection to Others', icon: '/icons/connection2.png', desc: 'How connected do you feel to others?' },
];

const DEFAULT_PRACTICES = [
  { key: 'meditation', label: 'Meditation', icon: '/icons/meditation.png' },
  { key: 'breathwork', label: 'Breathwork', icon: '/icons/breathwork.png' },
  { key: 'exercise', label: 'Exercise', icon: '/icons/exercise.png' },
  { key: 'nature', label: 'Nature', icon: '/icons/nature.png' },
];

export default function CheckIn() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mediaType, setMediaType] = useState(null);
  const [recording, setRecording] = useState(false);
  const [mediaBlob, setMediaBlob] = useState(null);
  const [textNote, setTextNote] = useState('');
  const [ratings, setRatings] = useState({ heart: 5, mind: 5, presence: 5, energy: 5, connection: 5 });
  const [practices, setPractices] = useState({ meditation: false, breathwork: false, exercise: false, nature: false });
  const [customPractices, setCustomPractices] = useState([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const chunksRef = useRef([]);

  // Load custom practices from user profile
  useEffect(() => {
    if (user?.id) {
      getProfile(user.id).then(profile => {
        const cp = profile.customPractices || [];
        setCustomPractices(cp);
        // Initialize practice state for custom ones
        const customState = {};
        cp.forEach(p => { customState[`custom_${p}`] = false; });
        setPractices(prev => ({ ...prev, ...customState }));
      }).catch(() => {});
    }
  }, [user?.id]);

  const handleAddCustomPractice = async () => {
    if (!newCustomName.trim()) return;
    try {
      const result = await addCustomPractice(user.id, newCustomName.trim());
      setCustomPractices(result.customPractices);
      setUser(prev => ({ ...prev, customPractices: result.customPractices }));
      setPractices(prev => ({ ...prev, [`custom_${newCustomName.trim()}`]: false }));
      setNewCustomName('');
      setShowAddCustom(false);
    } catch {
      alert('Failed to add practice');
    }
  };

  const allPractices = [
    ...DEFAULT_PRACTICES,
    ...customPractices.map(p => ({
      key: `custom_${p}`,
      label: p,
      icon: null,
      customIcon: '/icons/diamond.png',
      isCustom: true
    }))
  ];

  // Start camera preview when video type is selected (before recording)
  useEffect(() => {
    if (mediaType === 'video' && !mediaBlob && !recording) {
      let cancelled = false;
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
        .then(stream => {
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = stream;
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
            videoPreviewRef.current.play().catch(() => {});
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        // Don't stop stream here — startRecording will reuse or replace it
      };
    }
  }, [mediaType, mediaBlob, recording]);

  const startRecording = useCallback(async (type) => {
    try {
      const constraints = type === 'video'
        ? { video: { facingMode: 'user', width: { ideal: 720 } }, audio: true }
        : { audio: true };

      // Stop preview-only stream before getting full stream with audio
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      
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
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setMediaBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch (err) {
      alert('Could not access camera/microphone. Please allow permissions.');
    }
  }, []);

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('date', new Date().toISOString().split('T')[0]);
      formData.append('ratings', JSON.stringify(ratings));
      formData.append('practices', JSON.stringify(practices));
      formData.append('mediaType', mediaType || 'none');
      
      if (mediaBlob) {
        const ext = mediaType === 'video' ? 'webm' : 'webm';
        formData.append('media', mediaBlob, `checkin.${ext}`);
      }
      if (textNote) {
        formData.append('textNote', textNote);
      }

      await createCheckin(formData);
      setSubmitted(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch {
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-dvh bg-forest-900 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-4">🌿</div>
          <h2 className="text-2xl font-light text-warm-white mb-2">Check-in Complete</h2>
          <p className="text-earth-500">Thank you for showing up today.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-forest-900 pb-24 pt-16 pwa-safe-top">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[0, 1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              s <= step ? 'bg-gold-500' : 'bg-forest-700'
            }`} />
          ))}
        </div>

        {/* Step 0: Media */}
        {step === 0 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-light text-warm-white mb-2">What's alive in you right now?</h2>
            <p className="text-earth-500 text-sm mb-8">Be real. Be here.</p>

            {!mediaType ? (
              <div className="space-y-3">
                {[
                  { type: 'video', label: 'Record Video', icon: '/icons/video-icon.png', desc: 'Show up fully' },
                  { type: 'audio', label: 'Voice Note', icon: '/icons/voice.png', desc: 'Speak your truth' },
                  { type: 'text', label: 'Write', icon: '/icons/write.png', desc: 'Journal it out' },
                ].map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => setMediaType(opt.type)}
                    className="w-full bg-forest-800 hover:bg-forest-700 border border-forest-700/50 rounded-xl p-4 text-left transition-all duration-200 flex items-center gap-4"
                  >
                    <img src={opt.icon} alt={opt.label} className="w-10 h-10" />
                    <div>
                      <div className="text-warm-white font-medium">{opt.label}</div>
                      <div className="text-earth-500 text-sm">{opt.desc}</div>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setStep(1)}
                  className="w-full text-earth-600 text-sm py-3 hover:text-earth-400 transition-colors"
                >
                  Skip media →
                </button>
              </div>
            ) : mediaType === 'text' ? (
              <div className="space-y-4">
                <textarea
                  value={textNote}
                  onChange={(e) => setTextNote(e.target.value)}
                  placeholder="What's alive in you right now?"
                  className="w-full h-48 bg-forest-800 border border-forest-700/50 rounded-xl p-4 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 resize-none"
                />
                <div className="flex gap-3">
                  <button onClick={() => { setMediaType(null); setTextNote(''); }}
                    className="flex-1 py-3 bg-forest-800 text-earth-400 rounded-xl hover:bg-forest-700 transition-colors">
                    Back
                  </button>
                  <button onClick={() => setStep(1)}
                    className="flex-1 py-3 bg-gold-500 text-forest-900 font-medium rounded-xl hover:bg-gold-400 transition-colors">
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {mediaType === 'video' && (
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                    <video ref={videoPreviewRef} className="w-full h-full object-cover" muted playsInline />
                    {mediaBlob && !recording && (
                      <video src={URL.createObjectURL(mediaBlob)} className="absolute inset-0 w-full h-full object-cover" controls />
                    )}
                  </div>
                )}
                
                {mediaType === 'audio' && mediaBlob && !recording && (
                  <div className="bg-forest-800 rounded-xl p-4">
                    <audio src={URL.createObjectURL(mediaBlob)} controls className="w-full" />
                  </div>
                )}

                <div className="flex justify-center">
                  {!recording && !mediaBlob ? (
                    <button
                      onClick={() => startRecording(mediaType)}
                      className="w-20 h-20 rounded-full bg-red-500/80 hover:bg-red-500 border-4 border-red-400/30 flex items-center justify-center transition-all hover:scale-105"
                    >
                      <div className="w-8 h-8 bg-white rounded-full" />
                    </button>
                  ) : recording ? (
                    <button
                      onClick={stopRecording}
                      className="w-20 h-20 rounded-full bg-red-600 animate-pulse border-4 border-red-400/30 flex items-center justify-center"
                    >
                      <div className="w-8 h-8 bg-white rounded-sm" />
                    </button>
                  ) : (
                    <div className="flex gap-3 w-full">
                      <button onClick={() => { setMediaBlob(null); }}
                        className="flex-1 py-3 bg-forest-800 text-earth-400 rounded-xl hover:bg-forest-700 transition-colors">
                        Re-record
                      </button>
                      <button onClick={() => setStep(1)}
                        className="flex-1 py-3 bg-gold-500 text-forest-900 font-medium rounded-xl hover:bg-gold-400 transition-colors">
                        Continue
                      </button>
                    </div>
                  )}
                </div>

                {!mediaBlob && !recording && (
                  <button onClick={() => { 
                    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
                    setMediaType(null); 
                  }}
                    className="w-full text-earth-600 text-sm py-2 hover:text-earth-400 transition-colors">
                    ← Choose different type
                  </button>
                )}
                
                {recording && (
                  <div className="text-center">
                    <p className="text-red-400 text-sm animate-pulse">● Recording...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Ratings */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-light text-warm-white mb-2">Rate your day</h2>
            <p className="text-earth-500 text-sm mb-8">How are you feeling right now?</p>

            <div className="space-y-6">
              {RATINGS.map((r, i) => (
                <div key={r.key} className={`animate-slide-up stagger-${i+1} opacity-0 bg-forest-800 rounded-xl p-4 border border-forest-700/50`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <img src={r.icon} alt={r.label} className="w-8 h-8" />
                      <span className="text-warm-white text-sm font-medium">{r.label}</span>
                    </div>
                    <span className="text-2xl font-light text-gold-500 w-8 text-right">{ratings[r.key]}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={ratings[r.key]}
                    onChange={(e) => setRatings(prev => ({ ...prev, [r.key]: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-earth-600 text-xs mt-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep(0)}
                className="flex-1 py-3 bg-forest-800 text-earth-400 rounded-xl hover:bg-forest-700 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(2)}
                className="flex-1 py-3 bg-gold-500 text-forest-900 font-medium rounded-xl hover:bg-gold-400 transition-colors">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Practices */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-light text-warm-white mb-2">Today's practices</h2>
            <p className="text-earth-500 text-sm mb-8">What did you show up for?</p>

            <div className="space-y-3">
              {allPractices.map((p, i) => (
                <button
                  key={p.key}
                  onClick={() => setPractices(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                  className={`animate-slide-up stagger-${Math.min(i+1, 5)} opacity-0 w-full rounded-xl p-4 text-left transition-all duration-200 flex items-center gap-4 border ${
                    practices[p.key]
                      ? 'bg-forest-700 border-gold-500/40 shadow-lg shadow-gold-500/5'
                      : 'bg-forest-800 border-forest-700/50 hover:border-forest-600'
                  }`}
                >
                  {p.icon ? (
                    <img src={p.icon} alt={p.label} className="w-8 h-8" />
                  ) : (p.customIcon || '').startsWith('/') ? (
                    <img src={p.customIcon} alt="" className="w-8 h-8" />
                  ) : (
                    <span className="text-2xl text-gold-500">{p.customIcon || '💎'}</span>
                  )}
                  <span className="text-warm-white font-medium flex-1">{p.label}</span>
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                    practices[p.key] ? 'bg-gold-500 border-gold-500' : 'border-earth-600'
                  }`}>
                    {practices[p.key] && (
                      <svg className="w-4 h-4 text-forest-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}

              {/* Add custom practice inline */}
              {showAddCustom ? (
                <div className="animate-fade-in flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomPractice()}
                    placeholder="Practice name..."
                    className="flex-1 bg-forest-800 border border-forest-600 rounded-xl px-4 py-3 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 text-sm"
                    autoFocus
                  />
                  <button onClick={handleAddCustomPractice}
                    className="bg-gold-500 text-forest-900 px-4 py-3 rounded-xl text-sm font-medium hover:bg-gold-400 transition-colors">
                    Add
                  </button>
                  <button onClick={() => { setShowAddCustom(false); setNewCustomName(''); }}
                    className="text-earth-600 hover:text-earth-400 px-2 transition-colors">
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCustom(true)}
                  className="w-full bg-forest-800/50 hover:bg-forest-800 border border-dashed border-forest-600 rounded-xl py-4 text-earth-500 hover:text-earth-400 text-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>+</span>
                  <span>Add custom practice</span>
                </button>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep(1)}
                className="flex-1 py-3 bg-forest-800 text-earth-400 rounded-xl hover:bg-forest-700 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(3)}
                className="flex-1 py-3 bg-gold-500 text-forest-900 font-medium rounded-xl hover:bg-gold-400 transition-colors">
                Review
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-light text-warm-white mb-6">Your Check-in</h2>

            <div className="bg-forest-800 rounded-xl p-5 border border-forest-700/50 mb-4">
              <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-3">Ratings</h3>
              <div className="grid grid-cols-5 gap-2">
                {RATINGS.map(r => (
                  <div key={r.key} className="text-center">
                    <img src={r.icon} alt={r.label} className="w-6 h-6 mx-auto mb-1" />
                    <div className="text-warm-white font-medium">{ratings[r.key]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-forest-800 rounded-xl p-5 border border-forest-700/50 mb-4">
              <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-3">Practices</h3>
              <div className="flex flex-wrap gap-2">
                {allPractices.filter(p => practices[p.key]).map(p => (
                  <span key={p.key} className="bg-forest-700 text-earth-400 text-sm px-3 py-1 rounded-full inline-flex items-center gap-1">
                    {p.icon ? <img src={p.icon} alt={p.label} className="w-4 h-4 inline" /> : (p.customIcon || '').startsWith('/') ? <img src={p.customIcon} alt="" className="w-4 h-4 inline" /> : <span>{p.customIcon || '💎'}</span>} {p.label}
                  </span>
                ))}
                {!allPractices.some(p => practices[p.key]) && (
                  <span className="text-earth-600 text-sm">None today</span>
                )}
              </div>
            </div>

            {(mediaType || textNote) && (
              <div className="bg-forest-800 rounded-xl p-5 border border-forest-700/50 mb-4">
                <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-3">Media</h3>
                <p className="text-warm-white text-sm">
                  {mediaType === 'video' && <><img src="/icons/video-icon.png" alt="" className="w-4 h-4 inline mr-1" /> Video recorded</>}
                  {mediaType === 'audio' && <><img src="/icons/voice.png" alt="" className="w-4 h-4 inline mr-1" /> Audio recorded</>}
                  {mediaType === 'text' && <><img src="/icons/write.png" alt="" className="w-4 h-4 inline mr-1" /> "{textNote.slice(0, 80)}{textNote.length > 80 ? '...' : ''}"</>}
                  {!mediaType && textNote && <><img src="/icons/write.png" alt="" className="w-4 h-4 inline mr-1" /> "{textNote.slice(0, 80)}..."</>}
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)}
                className="flex-1 py-3 bg-forest-800 text-earth-400 rounded-xl hover:bg-forest-700 transition-colors">
                Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 py-4 bg-gold-500 hover:bg-gold-400 text-forest-900 font-medium rounded-xl transition-all disabled:opacity-50">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {mediaBlob ? 'Uploading media...' : 'Submitting...'}
                  </span>
                ) : 'Submit Check-in'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
