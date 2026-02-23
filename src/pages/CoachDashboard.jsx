import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getClients, createInvite, updateClient, deleteClient, markCoachCheckinsSeen } from '../utils/api';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import Avatar from '../components/Avatar';

export default function CoachDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [newCode, setNewCode] = useState('');
  // Manage mode
  const [manageMode, setManageMode] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editError, setEditError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadClients();
    markCoachCheckinsSeen();
  }, []);

  // Auto-refresh on visibility change + focus + app resume (iOS PWA homescreen)
  useEffect(() => {
    const refresh = () => { loadClients(); markCoachCheckinsSeen(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const handleFocus = () => refresh();
    const handleAppResume = () => {
      console.log('[CoachDashboard] app-resume event, refreshing data');
      refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-resume', handleAppResume);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-resume', handleAppResume);
    };
  }, []);

  const loadClients = () => {
    getClients().then(setClients).catch(() => {});
  };

  const handleInvite = async () => {
    if (!inviteName.trim()) return;
    const result = await createInvite(inviteName.trim());
    setNewCode(result.code);
    setInviteName('');
    loadClients();
  };

  const handleEdit = (client) => {
    setEditingClient(client.id);
    setEditName(client.name);
    setEditCode(client.code);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editCode.trim()) return;
    try {
      await updateClient(editingClient, { name: editName.trim(), code: editCode.trim().toUpperCase() });
      setEditingClient(null);
      setEditError('');
      loadClients();
    } catch (err) {
      setEditError(err.message);
    }
  };

  const handleDelete = async (clientId) => {
    try {
      await deleteClient(clientId);
      setDeleteConfirm(null);
      loadClients();
    } catch {
      // ignore
    }
  };

  const getDaysAgo = (dateStr) => {
    if (!dateStr) return null;
    const diff = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff} days ago`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="min-h-dvh bg-forest-900 pb-36 pt-16 pwa-safe-top">
      <NavBar />
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl text-warm-white">Coach Dashboard</h1>
            <p className="text-earth-500 text-sm">{clients.length} clients</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setManageMode(!manageMode); setEditingClient(null); setDeleteConfirm(null); }}
              className={`p-2.5 rounded-xl text-sm font-medium transition-colors border ${
                manageMode
                  ? 'bg-gold-500/20 border-gold-500/50 text-gold-500'
                  : 'bg-forest-800 border-forest-700/50 text-earth-400 hover:text-gold-500 hover:border-gold-500/30'
              }`}
              title="Manage Clients"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="bg-gold-500 hover:bg-gold-400 text-forest-900 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              + Invite
            </button>
          </div>
        </div>

        {/* Invite panel */}
        {showInvite && (
          <div className="animate-slide-up bg-forest-800 rounded-xl p-5 border border-forest-700/50 mb-6">
            <h3 className="text-warm-white font-medium mb-3">Invite New Client</h3>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Client name..."
                className="flex-1 bg-forest-900 border border-forest-600 rounded-lg px-3 py-2 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500/50 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
              <button onClick={handleInvite}
                className="bg-gold-500 text-forest-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-400 transition-colors">
                Create
              </button>
            </div>
            {newCode && (
              <div className="bg-forest-900 rounded-lg p-3 text-center">
                <p className="text-earth-400 text-xs mb-1">Share this code:</p>
                <p className="text-gold-500 text-xl font-mono tracking-widest">{newCode}</p>
              </div>
            )}
          </div>
        )}

        {/* Manage Clients panel */}
        {manageMode && (
          <div className="animate-slide-up mb-6">
            <div className="flex items-center gap-2 mb-3">
              <img src="/icons/clients.png" alt="" className="w-5 h-5 opacity-70" />
              <h2 className="text-xs uppercase tracking-wider text-gold-500 font-medium">Manage Clients</h2>
            </div>
            <div className="space-y-2">
              {clients.map((client) => (
                <div key={client.id} className="bg-forest-800 rounded-xl border border-forest-700/50 overflow-hidden">
                  {editingClient === client.id ? (
                    /* Edit form */
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="text-earth-400 text-xs uppercase tracking-wider">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full bg-forest-900 border border-forest-600 rounded-lg px-3 py-2 text-warm-white focus:outline-none focus:border-gold-500/50 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-earth-400 text-xs uppercase tracking-wider">Login Code</label>
                        <input
                          type="text"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                          maxLength={8}
                          className="w-full bg-forest-900 border border-forest-600 rounded-lg px-3 py-2 text-gold-500 font-mono tracking-widest focus:outline-none focus:border-gold-500/50 text-sm mt-1"
                        />
                      </div>
                      {editError && <p className="text-red-400 text-xs">{editError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 bg-gold-500 text-forest-900 py-2 rounded-lg text-sm font-medium hover:bg-gold-400 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingClient(null)}
                          className="flex-1 bg-forest-700 text-earth-300 py-2 rounded-lg text-sm hover:bg-forest-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : deleteConfirm === client.id ? (
                    /* Delete confirmation */
                    <div className="p-4">
                      <p className="text-warm-white text-sm mb-1">Delete <strong>{client.name}</strong>?</p>
                      <p className="text-earth-500 text-xs mb-3">This will also delete all their check-ins. This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="flex-1 bg-red-500/80 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 bg-forest-700 text-earth-300 py-2 rounded-lg text-sm hover:bg-forest-600 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal row */
                    <div className="p-4 flex items-center gap-3">
                      <Avatar name={client.name} avatar={client.avatar} size="md" />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-warm-white text-sm font-medium">{client.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-gold-500 font-mono text-xs tracking-widest bg-gold-500/10 px-2 py-0.5 rounded">
                            {client.code}
                          </span>
                          <span className="text-earth-600 text-xs">
                            {formatDate(client.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleEdit(client)}
                          className="p-2 rounded-lg bg-forest-700/50 text-earth-400 hover:text-gold-500 hover:bg-forest-700 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(client.id)}
                          className="p-2 rounded-lg bg-forest-700/50 text-earth-400 hover:text-red-400 hover:bg-forest-700 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {clients.length === 0 && (
                <p className="text-earth-600 text-sm text-center py-4">No clients yet</p>
              )}
            </div>
          </div>
        )}

        {/* Client list (normal view) */}
        {!manageMode && (
          <div className="space-y-3">
            {clients.map((client, i) => (
              <button
                key={client.id}
                onClick={() => navigate(`/coach/client/${client.id}`)}
                className="w-full animate-slide-up bg-forest-800 hover:bg-forest-700 rounded-xl p-4 border border-forest-700/50 text-left transition-all duration-200"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-center gap-4">
                  <Avatar name={client.name} avatar={client.avatar} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-warm-white font-medium">{client.name}</h3>
                        {client.hasNewCheckins && (
                          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                            {client.unrespondedCount}
                          </span>
                        )}
                      </div>
                      {client.streak > 0 && (
                        <span className="text-gold-500 text-sm flex items-center gap-1"><img src="/icons/streak-flame.png" alt="" className="w-4 h-4" />{client.streak}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-earth-500 text-xs">
                        {client.lastCheckin ? getDaysAgo(client.lastCheckin) : 'No check-ins'}
                      </span>
                      <span className="text-earth-600 text-xs">
                        {client.totalCheckins || 0} total
                      </span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-earth-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        {clients.length === 0 && !manageMode && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🌿</div>
            <p className="text-earth-500 mb-2">No clients yet</p>
            <p className="text-earth-600 text-sm">Create an invite code to get started</p>
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
