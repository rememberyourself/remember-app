import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClientDetail, submitCoachResponse, submitReply, getResources, uploadResource, deleteResource } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import AudioPlayer from '../components/AudioPlayer';

function formatDate(dateStr, createdAt) {
  if (createdAt) {
    const d = new Date(createdAt);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
import Avatar from '../components/Avatar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const API_BASE = '/api';

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
  { key: 'heart', label: 'Heart Connection', color: '#ef4444', icon: '/icons/heart.png' },
  { key: 'mind', label: 'Mind Activity', color: '#8b5cf6', icon: '/icons/mind.png' },
  { key: 'presence', label: 'Presence', color: '#C9A96E', icon: '/icons/presence.png' },
  { key: 'energy', label: 'Energy Level', color: '#f59e0b', icon: '/icons/energy.png' },
  { key: 'connection', label: 'Connection to Others', color: '#22c55e', icon: '/icons/connection2.png' },
];

const DEFAULT_PRACTICES = [
  { key: 'meditation', icon: '/icons/meditation.png', label: 'Meditation' },
  { key: 'breathwork', icon: '/icons/breathwork.png', label: 'Breathwork' },
  { key: 'exercise', icon: '/icons/exercise.png', label: 'Exercise' },
  { key: 'nature', icon: '/icons/nature.png', label: 'Nature' },
];

function mediaUrl(mediaPath) {
  if (!mediaPath) return null;
  return `${API_BASE}/uploads/${mediaPath}`;
}

// ===== Coach Response Form Component =====
function CoachResponseForm({ checkinId, onSubmitted, onCancel }) {
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
    } catch {
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
    if (!responseType) return;
    if (responseType === 'text' && !textNote.trim()) return;
    if ((responseType === 'video' || responseType === 'audio') && !mediaBlob) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', responseType);
      if (textNote) formData.append('text', textNote);
      if (mediaBlob) {
        formData.append('media', mediaBlob, `response.webm`);
      }
      await submitCoachResponse(checkinId, formData);
      onSubmitted();
    } catch {
      alert('Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 bg-forest-700/50 rounded-xl p-4 border border-gold-500/20 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <img src="/icons/coach-response.png" alt="" className="w-7 h-7" />
        <h4 className="text-warm-white text-sm font-medium">Your Response</h4>
      </div>

      {!responseType ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { type: 'video', label: 'Video', icon: '/icons/video-icon.png' },
            { type: 'audio', label: 'Voice', icon: '/icons/voice.png' },
            { type: 'text', label: 'Text', icon: '/icons/write.png' },
          ].map(opt => (
            <button
              key={opt.type}
              onClick={() => setResponseType(opt.type)}
              className="bg-forest-800 hover:bg-forest-600 border border-forest-600/50 rounded-lg p-3 text-center transition-all"
            >
              <img src={opt.icon} alt={opt.label} className="w-8 h-8 mx-auto mb-1" />
              <span className="text-earth-400 text-xs">{opt.label}</span>
            </button>
          ))}
        </div>
      ) : responseType === 'text' ? (
        <div className="space-y-3">
          <textarea
            value={textNote}
            onChange={(e) => setTextNote(e.target.value)}
            placeholder="Your message to the client..."
            className="w-full h-32 bg-forest-800 border border-forest-600/50 rounded-xl p-3 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 resize-none text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => { setResponseType(null); setTextNote(''); }}
              className="flex-1 py-2 bg-forest-800 text-earth-400 rounded-lg text-sm hover:bg-forest-600 transition-colors">
              Back
            </button>
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
              {mediaBlob && !recording && (
                <video src={URL.createObjectURL(mediaBlob)} className="absolute inset-0 w-full h-full object-cover" controls />
              )}
            </div>
          )}

          {responseType === 'audio' && mediaBlob && !recording && (
            <AudioPlayer src={URL.createObjectURL(mediaBlob)} />
          )}

          <div className="flex justify-center">
            {!recording && !mediaBlob ? (
              <button
                onClick={() => startRecording(responseType)}
                className="w-16 h-16 rounded-full bg-red-500/80 hover:bg-red-500 border-4 border-red-400/30 flex items-center justify-center transition-all hover:scale-105"
              >
                <div className="w-6 h-6 bg-white rounded-full" />
              </button>
            ) : recording ? (
              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-red-600 animate-pulse border-4 border-red-400/30 flex items-center justify-center"
              >
                <div className="w-6 h-6 bg-white rounded-sm" />
              </button>
            ) : (
              <div className="flex gap-2 w-full">
                <button onClick={() => setMediaBlob(null)}
                  className="flex-1 py-2 bg-forest-800 text-earth-400 rounded-lg text-sm hover:bg-forest-600 transition-colors">
                  Re-record
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2 bg-gold-500 text-forest-900 font-medium rounded-lg text-sm hover:bg-gold-400 transition-colors disabled:opacity-50">
                  {submitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            )}
          </div>

          {!mediaBlob && !recording && (
            <button onClick={() => setResponseType(null)}
              className="w-full text-earth-600 text-xs py-1 hover:text-earth-400 transition-colors">
              ← Choose different type
            </button>
          )}

          {recording && (
            <p className="text-center text-red-400 text-xs animate-pulse">● Recording...</p>
          )}
        </div>
      )}

      <button onClick={onCancel}
        className="mt-3 w-full text-earth-600 text-xs py-1 hover:text-earth-400 transition-colors">
        Cancel
      </button>
    </div>
  );
}

// ===== Thread Message Display (Coach side) =====
function ThreadMessageCoach({ msg }) {
  const isCoach = msg.from === 'coach';
  const borderColor = isCoach ? 'border-l-[#C9A96E]/60' : 'border-l-green-600/60';
  const label = isCoach ? <><img src="/icons/coach-response.png" alt="" className="w-7 h-7 inline" /> You (Coach)</> : '🙋 Client';
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
        <video src={mediaUrl(msg.mediaPath)} controls preload="metadata" className="w-full rounded-lg mt-2" />
      )}
      {msg.mediaPath && msg.type === 'audio' && (
        <AudioPlayer src={mediaUrl(msg.mediaPath)} className="mt-2" />
      )}
    </div>
  );
}

// ===== Coach Reply Form (for replying in thread) =====
function CoachReplyForm({ checkinId, onSubmitted, onCancel }) {
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
      if (type === 'video' && videoPreviewRef.current) { videoPreviewRef.current.srcObject = stream; videoPreviewRef.current.play(); }
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
      formData.append('from', 'coach');
      formData.append('type', responseType);
      if (textNote) formData.append('text', textNote);
      if (mediaBlob) formData.append('media', mediaBlob, 'reply.webm');
      await submitReply(checkinId, formData);
      onSubmitted();
    } catch { alert('Failed to send reply.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="mt-3 bg-forest-700/50 rounded-xl p-4 border border-gold-500/20 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <img src="/icons/coach-response.png" alt="" className="w-7 h-7" />
        <h4 className="text-warm-white text-sm font-medium">Reply</h4>
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
          <textarea value={textNote} onChange={(e) => setTextNote(e.target.value)} placeholder="Your reply..."
            className="w-full h-24 bg-forest-800 border border-forest-600/50 rounded-xl p-3 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 resize-none text-sm" autoFocus />
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

// ===== Coach Response Display (with thread) =====
function CoachResponseDisplay({ checkin, onReloadClient, respondingTo, setRespondingTo }) {
  const response = checkin.coachResponse;
  if (!response) return null;
  
  const replies = checkin.replies || [];
  // Determine if last message is from client (coach can respond again)
  const lastMsg = replies.length > 0 ? replies[replies.length - 1] : { from: 'coach' };
  const canCoachReply = lastMsg.from === 'client';

  return (
    <div className="mt-3 space-y-3">
      {/* Initial coach response */}
      <ThreadMessageCoach msg={{ ...response, from: 'coach' }} />

      {/* Thread replies */}
      {replies.map((reply, i) => (
        <ThreadMessageCoach key={i} msg={reply} />
      ))}

      {/* Coach can reply again if last message was from client */}
      {canCoachReply && (
        respondingTo === `reply_${checkin.id}` ? (
          <CoachReplyForm
            checkinId={checkin.id}
            onSubmitted={() => { setRespondingTo(null); onReloadClient(); }}
            onCancel={() => setRespondingTo(null)}
          />
        ) : (
          <button
            onClick={() => setRespondingTo(`reply_${checkin.id}`)}
            className="w-full py-2 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 rounded-xl text-sm font-medium transition-all border border-gold-500/20 hover:border-gold-500/30"
          >
            <img src="/icons/reply2-flipped.png" alt="" className="w-6 h-6 inline mr-1" /> Reply to client
          </button>
        )
      )}
    </div>
  );
}

// ===== AI Analysis Display =====
function AIAnalysisDisplay({ analysis }) {
  if (!analysis) {
    return (
      <div className="mt-3 bg-forest-800/60 rounded-xl p-4 border border-forest-600/30">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🤖</span>
          <h4 className="text-earth-400 text-xs uppercase tracking-wider font-medium">AI Analysis</h4>
        </div>
        <div className="space-y-3 opacity-50">
          <div className="h-3 bg-forest-700 rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-forest-700 rounded w-1/2 animate-pulse" />
          <div className="h-3 bg-forest-700 rounded w-2/3 animate-pulse" />
        </div>
        <p className="text-earth-600 text-xs mt-3 italic">Analysis will appear here after processing...</p>
      </div>
    );
  }

  return (
    <div className="mt-3 bg-forest-800/60 rounded-xl p-4 border border-forest-600/30">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🤖</span>
        <h4 className="text-earth-400 text-xs uppercase tracking-wider font-medium">AI Analysis</h4>
        <span className="text-earth-700 text-[10px] ml-auto">
          {new Date(analysis.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Mood Assessment */}
      {analysis.mood && (
        <div className="mb-3">
          <span className="text-earth-500 text-[10px] uppercase tracking-wider">Mood</span>
          <p className="text-warm-white text-sm mt-0.5">{analysis.mood}</p>
        </div>
      )}

      {/* Key Points */}
      {analysis.keyPoints?.length > 0 && (
        <div className="mb-3">
          <span className="text-earth-500 text-[10px] uppercase tracking-wider">Key Points</span>
          <ul className="mt-1 space-y-1">
            {analysis.keyPoints.map((point, i) => (
              <li key={i} className="text-earth-300 text-sm flex items-start gap-2">
                <span className="text-gold-500/70 mt-0.5 text-xs">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Patterns & Themes */}
      {analysis.patterns?.length > 0 && (
        <div className="mb-3">
          <span className="text-earth-500 text-[10px] uppercase tracking-wider">Patterns & Themes</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {analysis.patterns.map((pattern, i) => (
              <span key={i} className="bg-forest-700/60 text-earth-400 text-xs px-2.5 py-1 rounded-full border border-forest-600/30">
                {pattern}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Follow-up Questions */}
      {analysis.suggestedQuestions?.length > 0 && (
        <div>
          <span className="text-earth-500 text-[10px] uppercase tracking-wider">Suggested Questions</span>
          <ul className="mt-1 space-y-1">
            {analysis.suggestedQuestions.map((q, i) => (
              <li key={i} className="text-earth-400 text-sm flex items-start gap-2">
                <span className="text-gold-500/50 mt-0.5 text-xs">?</span>
                <span className="italic">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ===== Resources Tab Component =====
function ResourcesTab({ clientId }) {
  const [resources, setResources] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const loadResources = () => {
    getResources(clientId).then(setResources).catch(() => {});
  };

  useEffect(() => { loadResources(); }, [clientId]);

  const handleUpload = async () => {
    if (!title.trim() || !file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('file', file);
      await uploadResource(clientId, formData);
      setTitle(''); setDescription(''); setFile(null); setShowUpload(false);
      loadResources();
    } catch { alert('Failed to upload resource.'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (resourceId) => {
    if (!confirm('Delete this resource?')) return;
    try {
      await deleteResource(clientId, resourceId);
      loadResources();
    } catch { alert('Failed to delete.'); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Upload button */}
      {!showUpload ? (
        <button onClick={() => setShowUpload(true)}
          className="w-full py-3 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 rounded-xl text-sm font-medium transition-all border border-gold-500/20 hover:border-gold-500/30">
          Upload Resource
        </button>
      ) : (
        <div className="bg-forest-800 rounded-xl p-4 border border-forest-700/50 animate-fade-in">
          <h4 className="text-warm-white text-sm font-medium mb-3">Upload Resource</h4>
          <div className="space-y-3">
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Title (required)" 
              className="w-full bg-forest-700 border border-forest-600/50 rounded-lg px-3 py-2 text-warm-white placeholder-earth-700 text-sm focus:outline-none focus:border-gold-500/50" />
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full h-16 bg-forest-700 border border-forest-600/50 rounded-lg px-3 py-2 text-warm-white placeholder-earth-700 text-sm focus:outline-none focus:border-gold-500/50 resize-none" />
            <div>
              <label className="block">
                <span className="text-earth-400 text-xs mb-1 block">PDF, Video, or Image file</span>
                <input type="file" accept=".pdf,video/*,image/*"
                  onChange={e => setFile(e.target.files[0])}
                  className="block w-full text-sm text-earth-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-forest-700 file:text-earth-300 hover:file:bg-forest-600 file:cursor-pointer" />
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowUpload(false); setTitle(''); setDescription(''); setFile(null); }}
                className="flex-1 py-2 bg-forest-700 text-earth-400 rounded-lg text-sm hover:bg-forest-600 transition-colors">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !title.trim() || !file}
                className="flex-1 py-2 bg-gold-500 text-forest-900 font-medium rounded-lg text-sm hover:bg-gold-400 transition-colors disabled:opacity-50">
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resources list */}
      {resources.length === 0 && !showUpload ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📂</div>
          <p className="text-earth-500">No resources yet</p>
          <p className="text-earth-600 text-xs mt-1">Upload PDFs or videos for this client</p>
        </div>
      ) : (
        resources.map(r => (
          <div key={r.id} className="bg-forest-800 rounded-xl p-4 border border-forest-700/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {r.type === 'pdf' && <img src="/icons/pdf-icon.png" alt="PDF" className="w-10 h-10" />}
                {r.type === 'video' && <img src="/icons/video-icon.png" alt="Video" className="w-10 h-10" />}
                {r.type === 'image' && <img src="/icons/image-icon.png" alt="Image" className="w-10 h-10" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-warm-white font-medium text-sm">{r.title}</h4>
                {r.description && <p className="text-earth-400 text-xs mt-1">{r.description}</p>}
                <p className="text-earth-600 text-[10px] mt-1">
                  {new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => handleDelete(r.id)}
                className="text-earth-600 hover:text-red-400 transition-colors p-1" title="Delete">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            {r.type === 'video' && (
              <video src={mediaUrl(r.filePath)} controls preload="metadata" className="w-full rounded-lg mt-3" />
            )}
            {r.type === 'pdf' && (
              <a href={mediaUrl(r.filePath)} target="_blank" rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-forest-700/60 hover:bg-forest-700 text-earth-300 rounded-lg text-sm transition-colors">
                <img src="/icons/pdf-icon.png" alt="" className="w-5 h-5" /> Open PDF
              </a>
            )}
            {r.type === 'image' && (
              <img src={mediaUrl(r.filePath)} alt={r.title} className="w-full rounded-lg mt-3 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(mediaUrl(r.filePath), '_blank')} />
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ===== Main Component =====
export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('overview');
  const [respondingTo, setRespondingTo] = useState(null);
  const [expandedCheckin, setExpandedCheckin] = useState(null);

  const loadClient = () => {
    getClientDetail(id).then(setClient).catch(() => {});
  };

  useEffect(() => { loadClient(); }, [id]);

  if (!client) {
    return (
      <div className="min-h-dvh bg-forest-900 flex items-center justify-center">
        <div className="animate-pulse text-earth-500">Loading...</div>
      </div>
    );
  }

  const customPractices = (client.customPractices || []).map(p => ({
    key: `custom_${p}`,
    icon: null,
    customIcon: '/icons/diamond.png',
    label: p,
  }));

  const allPractices = [...DEFAULT_PRACTICES, ...customPractices];

  const chartData = [...(client.checkins || [])].reverse().map(c => ({
    date: c.date?.slice(5),
    ...c.ratings
  }));

  const practiceData = [...(client.checkins || [])].reverse().map(c => ({
    date: c.date?.slice(5),
    meditation: c.practices?.meditation ? 1 : 0,
    breathwork: c.practices?.breathwork ? 1 : 0,
    exercise: c.practices?.exercise ? 1 : 0,
    nature: c.practices?.nature ? 1 : 0,
  }));

  return (
    <div className="min-h-dvh bg-forest-900 pb-24 pt-16 pwa-safe-top">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/coach')} className="text-earth-500 hover:text-warm-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <Avatar name={client.name} avatar={client.avatar} size="lg" />
            <div>
              <h1 className="text-xl font-light text-warm-white">{client.name}</h1>
              <p className="text-earth-500 text-sm">
                {client.streak > 0 ? <><img src="/icons/streak-flame.png" alt="" className="w-5 h-5 inline-block mr-1" />{client.streak} day streak</> : 'No active streak'}
                {' · '}{client.checkins?.length || 0} check-ins
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-forest-800 rounded-lg p-1 mb-6">
          {['overview', 'checkins', 'resources'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 rounded text-xs uppercase tracking-wider transition-colors ${
                tab === t ? 'bg-forest-700 text-gold-500' : 'text-earth-500 hover:text-earth-400'
              }`}>
              {t === 'resources' ? 'Resources' : t}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="space-y-4 animate-fade-in">
            {chartData.length > 0 && (
              <div className="bg-forest-800 rounded-2xl p-4 border border-forest-700/50">
                <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-4">Rating Trends</h3>
                <ResponsiveContainer width="100%" height={260}>
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
                      <Line key={key} type="monotone" dataKey={key} stroke={color}
                        name={RATING_LABELS[key]} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Individual charts per dimension */}
            {chartData.length > 0 && RATING_DETAILS.map(dim => (
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
                    <Line type="monotone" dataKey={dim.key} stroke={dim.color}
                      name={dim.label} strokeWidth={2.5} dot={{ r: 4, fill: dim.color }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}

            {practiceData.length > 0 && (
              <div className="bg-forest-800 rounded-2xl p-4 border border-forest-700/50">
                <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-4">Practice Consistency</h3>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {allPractices.slice(0, 8).map(p => {
                    const count = client.checkins?.filter(c => c.practices?.[p.key]).length || 0;
                    const total = client.checkins?.length || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={p.key} className="text-center">
                        <div className="mb-1 flex justify-center">
                          {p.icon ? <img src={p.icon} alt={p.label} className="w-8 h-8" /> : (p.customIcon || '').startsWith('/') ? <img src={p.customIcon} alt="" className="w-8 h-8" /> : <span className="text-2xl text-gold-500">{p.customIcon || '💎'}</span>}
                        </div>
                        <div className="text-gold-500 font-medium text-lg">{pct}%</div>
                        <div className="text-earth-600 text-xs">{p.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {client.checkins?.[0] && (
              <div className="bg-forest-800 rounded-2xl p-4 border border-forest-700/50">
                <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-3">Latest Check-in · {formatDate(client.checkins[0].date, client.checkins[0].createdAt)}</h3>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(RATING_LABELS).map(([key, label]) => (
                    <div key={key} className="text-center">
                      <img src={RATING_ICONS[key]} alt={label} className="w-10 h-10 mx-auto mb-1" />
                      <div className="text-warm-white font-medium text-lg">{client.checkins[0].ratings?.[key] || '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Checkins tab */}
        {tab === 'checkins' && (
          <div className="space-y-3 animate-fade-in">
            {client.checkins?.map((c, i) => {
              const isExpanded = expandedCheckin === c.id;
              const hasResponse = !!c.coachResponse;
              return (
                <div key={i} className={`rounded-xl p-4 border transition-all ${
                  hasResponse 
                    ? 'bg-forest-800 border-forest-700/50' 
                    : 'bg-forest-800 border-l-4 border-l-gold-500/60 border-t border-r border-b border-t-forest-600/50 border-r-forest-600/50 border-b-forest-600/50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-warm-white text-sm font-medium">{formatDate(c.date, c.createdAt)}</span>
                      {hasResponse ? (
                        <span className="bg-gold-500/20 text-gold-500 text-sm px-3 py-1 rounded-full font-medium inline-flex items-center gap-1">
                          <img src="/icons/coach-response.png" alt="" className="w-7 h-7" /> Responded
                        </span>
                      ) : (
                        <span className="bg-gold-500/25 text-gold-400 text-xs px-2.5 py-1 rounded-full font-semibold animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
{/* media type removed */}
                      <button
                        onClick={() => setExpandedCheckin(isExpanded ? null : c.id)}
                        className="text-gold-500 hover:text-gold-400 transition-colors"
                      >
                        <svg className={`w-7 h-7 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {Object.entries(RATING_LABELS).map(([key, label]) => (
                      <div key={key} className="text-center">
                        <img src={RATING_ICONS[key]} alt={label} className="w-5 h-5 mx-auto mb-1" />
                        <div className="text-warm-white font-medium text-sm">{c.ratings?.[key] || '-'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {allPractices.filter(p => c.practices?.[p.key]).map(p => (
                      <span key={p.key} className="bg-forest-700 text-earth-400 text-sm px-3 py-1.5 rounded-full inline-flex items-center gap-1">
                        {p.icon ? <img src={p.icon} alt={p.label} className="w-4 h-4" /> : (p.customIcon || '').startsWith('/') ? <img src={p.customIcon} alt="" className="w-4 h-4" /> : <span>{p.customIcon || '💎'}</span>} {p.label}
                      </span>
                    ))}
                  </div>
                  {c.textNote && <p className="text-earth-400 text-sm mt-2 italic">"{c.textNote}"</p>}
                  {c.mediaPath && c.mediaType === 'video' && (
                    <video src={mediaUrl(c.mediaPath)} controls preload="metadata" className="w-full rounded-lg mt-3" />
                  )}
                  {c.mediaPath && c.mediaType === 'audio' && (
                    <AudioPlayer src={mediaUrl(c.mediaPath)} className="mt-3" />
                  )}

                  {/* Expanded section: AI Analysis + Coach Response */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-forest-700/50 animate-fade-in">
                      {/* AI Analysis */}
                      <AIAnalysisDisplay analysis={c.aiAnalysis} />

                      {/* Coach Response Thread */}
                      {c.coachResponse ? (
                        <CoachResponseDisplay checkin={c} onReloadClient={loadClient} respondingTo={respondingTo} setRespondingTo={setRespondingTo} />
                      ) : respondingTo === c.id ? (
                        <CoachResponseForm
                          checkinId={c.id}
                          onSubmitted={() => { setRespondingTo(null); loadClient(); }}
                          onCancel={() => setRespondingTo(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setRespondingTo(c.id)}
                          className="mt-3 w-full py-2.5 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 rounded-xl text-sm font-medium transition-all border border-gold-500/20 hover:border-gold-500/30"
                        >
                          <img src="/icons/coach-response.png" alt="" className="w-5 h-5 inline mr-1" /> Respond to this check-in
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Resources tab */}
        {tab === 'resources' && (
          <ResourcesTab clientId={id} />
        )}

        {/* Videos tab */}
        {tab === 'videos' && (
          <div className="space-y-4 animate-fade-in">
            {client.checkins?.filter(c => c.mediaType === 'video' && c.mediaPath).map((c, i) => (
              <div key={i} className="bg-forest-800 rounded-xl overflow-hidden border border-forest-700/50">
                <video src={mediaUrl(c.mediaPath)} controls preload="metadata" className="w-full" />
                <div className="p-3">
                  <span className="text-earth-400 text-sm">{formatDate(c.date, c.createdAt)}</span>
                </div>
              </div>
            ))}
            {client.checkins?.filter(c => c.mediaType === 'audio' && c.mediaPath).map((c, i) => (
              <div key={`audio-${i}`} className="bg-forest-800 rounded-xl p-4 border border-forest-700/50">
                <span className="text-earth-400 text-sm block mb-2"><img src="/icons/voice.png" alt="" className="w-5 h-5 inline mr-1" />{formatDate(c.date, c.createdAt)}</span>
                <AudioPlayer src={mediaUrl(c.mediaPath)} />
              </div>
            ))}
            {!client.checkins?.some(c => (c.mediaType === 'video' || c.mediaType === 'audio') && c.mediaPath) && (
              <div className="text-center py-16">
                <img src="/icons/video-icon.png" alt="" className="w-12 h-12 mx-auto mb-4" />
                <p className="text-earth-500">No media yet</p>
              </div>
            )}
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
