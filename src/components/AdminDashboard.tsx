import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Users, Activity, Bell, TrendingUp, RefreshCw, Lock, Plus, Copy, CheckCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

const API_BASE = 'https://bytspot-api.onrender.com';

interface AdminStats {
  totalUsers: number;
  newSignupsToday: number;
  totalCheckins: number;
  pushSubscribers: number;
  topVenues: { venueId: string; name: string; checkins: number }[];
  generatedAt: string;
}

export function AdminDashboard() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<string[]>([]);
  const [genCount, setGenCount] = useState(5);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchStats = useCallback(async (password: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: { 'X-Admin-Password': password },
      });
      if (res.status === 401) { toast.error('Wrong password'); setAuthed(false); return; }
      const data = await res.json();
      setStats(data);
    } catch { toast.error('Could not reach API'); }
    finally { setLoading(false); }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('bytspot_admin_pw', pw);
    setAuthed(true);
    fetchStats(pw);
  };

  useEffect(() => {
    const saved = localStorage.getItem('bytspot_admin_pw');
    if (saved) { setPw(saved); setAuthed(true); fetchStats(saved); }
  }, [fetchStats]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authed || !pw) return;
    const t = setInterval(() => fetchStats(pw), 30000);
    return () => clearInterval(t);
  }, [authed, pw, fetchStats]);

  const generateInvites = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/generate-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
        body: JSON.stringify({ count: genCount }),
      });
      const data = await res.json();
      setInviteCodes(data.codes || []);
      toast.success(`Generated ${data.codes?.length} invite code(s)`);
    } catch { toast.error('Failed to generate codes'); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAllCodes = () => {
    navigator.clipboard.writeText(inviteCodes.join('\n')).catch(() => {});
    toast.success('All codes copied to clipboard');
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#000] flex items-center justify-center px-6">
        <motion.div className="w-full max-w-[360px]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-[24px] text-white font-bold">Bytspot Admin</h1>
            <p className="text-white/40 text-[14px] mt-1">Founder dashboard — restricted access</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input type="password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)}
              className="w-full px-4 py-4 rounded-[14px] bg-[#1C1C1E] border border-white/10 text-white text-[17px] outline-none placeholder:text-white/30" required />
            <button type="submit" className="w-full py-4 rounded-[14px] bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-[17px]">
              Enter Dashboard
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000] text-white px-4 py-8 max-w-[600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold">Bytspot Admin</h1>
          {stats && <p className="text-white/30 text-[12px]">Updated {new Date(stats.generatedAt).toLocaleTimeString()}</p>}
        </div>
        <button onClick={() => fetchStats(pw)} disabled={loading}
          className="p-2.5 rounded-full bg-white/10 active:bg-white/20">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-purple-400' : 'text-white/60'}`} strokeWidth={2} />
        </button>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { icon: <Users className="w-5 h-5 text-purple-400" />, label: 'Total Users', value: stats.totalUsers },
            { icon: <Activity className="w-5 h-5 text-green-400" />, label: 'New Today', value: stats.newSignupsToday },
            { icon: <TrendingUp className="w-5 h-5 text-cyan-400" />, label: 'Check-ins', value: stats.totalCheckins },
            { icon: <Bell className="w-5 h-5 text-pink-400" />, label: 'Push Subs', value: stats.pushSubscribers },
          ].map((s) => (
            <motion.div key={s.label} className="rounded-[16px] bg-[#1C1C1E] p-4 border border-white/10"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 mb-2">{s.icon}<span className="text-[12px] text-white/40 font-semibold">{s.label.toUpperCase()}</span></div>
              <p className="text-[28px] font-bold">{s.value.toLocaleString()}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Top venues */}
      {stats && stats.topVenues.length > 0 && (
        <div className="rounded-[16px] bg-[#1C1C1E] border border-white/10 p-4 mb-6">
          <p className="text-[12px] text-white/40 font-bold mb-3">TOP VENUES BY CHECK-INS</p>
          {stats.topVenues.map((v, i) => (
            <div key={v.venueId} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-white/30 w-4">{i + 1}</span>
                <span className="text-[15px] text-white font-medium">{v.name}</span>
              </div>
              <span className="text-[14px] text-purple-400 font-semibold">{v.checkins}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invite code generator */}
      <div className="rounded-[16px] bg-[#1C1C1E] border border-white/10 p-4 mb-6">
        <p className="text-[12px] text-white/40 font-bold mb-3">GENERATE INVITE CODES</p>
        <div className="flex items-center gap-3 mb-3">
          <input type="number" min={1} max={50} value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
            className="w-20 px-3 py-2 rounded-[10px] bg-black/40 border border-white/20 text-white text-center text-[15px] outline-none" />
          <button onClick={generateInvites}
            className="flex-1 py-2.5 rounded-[12px] bg-purple-500/80 text-white font-semibold text-[15px] flex items-center justify-center gap-2 active:bg-purple-500">
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Generate
          </button>
        </div>
        {inviteCodes.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-white/40">{inviteCodes.length} codes ready</span>
              <button onClick={copyAllCodes} className="text-[12px] text-purple-400 font-semibold">Copy All</button>
            </div>
            {inviteCodes.map((code) => (
              <button key={code} onClick={() => copyCode(code)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-[10px] bg-black/40 border border-white/10 active:bg-white/5">
                <span className="font-mono text-[15px] text-white tracking-widest">{code}</span>
                {copied === code ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/30" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => { localStorage.removeItem('bytspot_admin_pw'); setAuthed(false); setPw(''); }}
        className="text-[13px] text-white/20 mx-auto block">
        Sign out
      </button>
    </div>
  );
}

