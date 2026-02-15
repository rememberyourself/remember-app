import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getProfile, uploadAvatar, addCustomPractice, removeCustomPractice } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import Avatar from '../components/Avatar';

export default function Profile() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newPractice, setNewPractice] = useState('');
  const [showAddPractice, setShowAddPractice] = useState(false);

  useEffect(() => {
    if (user?.id) {
      getProfile(user.id).then(setProfile).catch(() => {});
    }
  }, [user?.id]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadAvatar(user.id, file);
      setProfile(prev => ({ ...prev, avatar: result.avatar }));
      // Update auth context so avatar shows everywhere
      setUser(prev => ({ ...prev, avatar: result.avatar }));
    } catch {
      alert('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleAddPractice = async () => {
    if (!newPractice.trim()) return;
    try {
      const result = await addCustomPractice(user.id, newPractice.trim());
      setProfile(prev => ({ ...prev, customPractices: result.customPractices }));
      setUser(prev => ({ ...prev, customPractices: result.customPractices }));
      setNewPractice('');
      setShowAddPractice(false);
    } catch {
      alert('Failed to add practice');
    }
  };

  const handleRemovePractice = async (practice) => {
    try {
      const result = await removeCustomPractice(user.id, practice);
      setProfile(prev => ({ ...prev, customPractices: result.customPractices }));
      setUser(prev => ({ ...prev, customPractices: result.customPractices }));
    } catch {
      alert('Failed to remove practice');
    }
  };

  if (!profile) {
    return (
      <div className="min-h-dvh bg-forest-900 flex items-center justify-center">
        <div className="animate-pulse text-earth-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-forest-900 pb-24 pt-16 pwa-safe-top">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Back button */}
        <button onClick={() => navigate(-1)} className="text-earth-500 hover:text-warm-white transition-colors mb-6 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">Back</span>
        </button>

        {/* Profile Header */}
        <div className="animate-fade-in text-center mb-8">
          <div className="relative inline-block mb-4">
            <Avatar name={profile.name} avatar={profile.avatar} size="xl" className="border-gold-500/40" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 bg-forest-700 hover:bg-forest-600 border-2 border-forest-900 rounded-full flex items-center justify-center text-sm transition-colors"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-earth-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                '📷'
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <h1 className="text-xl font-light text-warm-white">{profile.name}</h1>
          <p className="text-earth-500 text-sm capitalize">{profile.role}</p>
        </div>

        {/* Custom Practices (clients only) */}
        {profile.role === 'client' && (
          <div className="animate-slide-up bg-forest-800 rounded-2xl p-5 border border-forest-700/50 mb-4">
            <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-4">Custom Practices</h3>
            
            {(profile.customPractices || []).length === 0 && !showAddPractice && (
              <p className="text-earth-600 text-sm mb-3">No custom practices yet. Add your own daily practices to track.</p>
            )}

            <div className="space-y-2 mb-4">
              {(profile.customPractices || []).map((practice, i) => (
                <div key={i} className="flex items-center justify-between bg-forest-900/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img src="/icons/diamond.png" alt="" className="w-5 h-5" />
                    <span className="text-warm-white text-sm">{practice}</span>
                  </div>
                  <button
                    onClick={() => handleRemovePractice(practice)}
                    className="text-earth-700 hover:text-red-400 transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {showAddPractice ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPractice}
                  onChange={(e) => setNewPractice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPractice()}
                  placeholder="e.g. Journaling, Cold Plunge..."
                  className="flex-1 bg-forest-900 border border-forest-600 rounded-lg px-3 py-2 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 text-sm"
                  autoFocus
                />
                <button onClick={handleAddPractice}
                  className="bg-gold-500 text-forest-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-400 transition-colors">
                  Add
                </button>
                <button onClick={() => { setShowAddPractice(false); setNewPractice(''); }}
                  className="text-earth-600 hover:text-earth-400 px-2 transition-colors">
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddPractice(true)}
                className="w-full bg-forest-900/50 hover:bg-forest-700 border border-dashed border-forest-600 rounded-xl py-3 text-earth-500 hover:text-earth-400 text-sm transition-all"
              >
                + Add custom practice
              </button>
            )}
          </div>
        )}

        {/* Account info */}
        <div className="animate-slide-up stagger-1 bg-forest-800 rounded-2xl p-5 border border-forest-700/50">
          <h3 className="text-earth-400 text-xs uppercase tracking-wider mb-4">Account</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-earth-500 text-sm">Name</span>
              <span className="text-warm-white text-sm">{profile.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-earth-500 text-sm">Role</span>
              <span className="text-warm-white text-sm capitalize">{profile.role}</span>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
