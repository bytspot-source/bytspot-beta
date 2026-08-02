import { motion } from 'motion/react';
import { ArrowLeft, Clock, MapPin, Sparkles, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getPointTransactionsAsync,
  getUserPointsAsync,
  type PointTransaction,
  type UserPoints,
} from '../utils/gamification';

interface BytspotPointsProps {
  isDarkMode: boolean;
  onBack: () => void;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function BytspotPoints({ onBack }: BytspotPointsProps) {
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[] | null>(null);

  useEffect(() => {
    getUserPointsAsync().then(setPoints).catch(() => {});
    getPointTransactionsAsync().then(setTransactions).catch(() => {});
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-black pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-black px-4 pb-4 pt-4">
        <motion.button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-[#1C1C1E]/80"
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft className="h-5 w-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <h1 className="text-title-2 text-white">Bytspot Points</h1>
      </div>

      <div className="space-y-5 px-4">
        <div className="rounded-[24px] border-2 border-purple-300/40 bg-gradient-to-br from-purple-500/25 to-cyan-500/20 p-6">
          <div className="mb-2 flex items-center gap-2 text-purple-100">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            <span className="text-[13px] font-bold tracking-wide">VERIFIED BALANCE</span>
          </div>
          <div className="flex items-baseline gap-2 text-white">
            <span className="text-[48px] font-bold">{points ? points.total.toLocaleString() : '—'}</span>
            <span className="text-[20px] font-semibold text-white/80">points</span>
          </div>
          {points && points.pending > 0 && (
            <div className="mt-3 flex w-fit items-center gap-2 rounded-full border border-yellow-300/30 bg-yellow-500/20 px-3 py-1.5 text-[12px] font-semibold text-yellow-100">
              <Clock className="h-3.5 w-3.5" />
              {points.pending} pending verification
            </div>
          )}
        </div>

        <div className="rounded-[20px] border-2 border-slate-700 bg-slate-950 p-5 text-white">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <MapPin className="h-5 w-5 text-emerald-300" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[17px] font-bold">Check in to earn</h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-300">
                Verified venue and experience check-ins earn Bytspot Points. Points never change your Green, Platinum, or Black membership.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-slate-700 pt-4 text-slate-200">
            <TrendingUp className="h-4 w-4 text-cyan-300" />
            <span className="text-[13px] font-semibold">{points ? `${points.lifetime.toLocaleString()} lifetime points earned` : 'Sign in and connect to view verified Points'}</span>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[17px] font-bold text-white">Points history</h2>
          <div className="space-y-3">
            {transactions === null ? (
              <div className="rounded-[18px] border border-slate-700 bg-slate-950 p-5 text-center text-[13px] text-slate-300">
                Verified Points history is unavailable.
              </div>
            ) : transactions.length === 0 ? (
              <div className="rounded-[18px] border border-slate-700 bg-slate-950 p-5 text-center text-[13px] text-slate-300">
                Your verified check-ins will appear here.
              </div>
            ) : transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between rounded-[18px] border border-slate-700 bg-slate-950 p-4">
                <div>
                  <p className="text-[14px] font-semibold text-white">{transaction.description}</p>
                  <p className="mt-1 text-[12px] text-slate-400">{formatDate(transaction.timestamp)}</p>
                </div>
                <span className={`text-[16px] font-bold ${transaction.type === 'spend' ? 'text-red-300' : 'text-emerald-300'}`}>
                  {transaction.type === 'spend' ? '-' : '+'}{transaction.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
