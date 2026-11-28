import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';

interface ZoneUserCountProps {
  compact?: boolean;
}

/** Registered accounts from health stats. Not a live headcount. */
export function ZoneUserCount({ compact = false }: ZoneUserCountProps) {
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    trpc.health.stats.query().then(res => {
      if (res.userCount > 0) setUserCount(res.userCount);
    }).catch(() => {});
  }, []);

  if (userCount == null) return null;

  const formatted = userCount.toLocaleString('en-US');

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20"
        aria-label={`${formatted} registered accounts`}
      >
        <Users className="w-3.5 h-3.5 text-white/80" strokeWidth={2.5} />
        <span className="text-[11px] text-white/90" style={{ fontWeight: 700 }}>{formatted}</span>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30">
          <Users className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>Registered accounts</h3>
          <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>Not a live headcount</p>
        </div>
      </div>
      <p className="text-[32px] text-white" style={{ fontWeight: 800 }}>{formatted}</p>
    </div>
  );
}
