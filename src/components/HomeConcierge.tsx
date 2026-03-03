import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, MapPin } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface Venue {
  id?: string;
  name: string;
  category?: string;
  type?: string;
  availability?: string;
  crowd?: { level: number; label: string; waitMins?: number };
  address?: string;
  vibe?: number;
  [key: string]: any;
}

interface HomeConciergeProps {
  isOpen?: boolean;
  onClose?: () => void;
  venues: Venue[];
  onVenueSelect: (venue: Venue) => void;
  /** When true, renders as a full-height tab instead of a bottom-sheet modal */
  tabMode?: boolean;
}

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  venues?: Venue[];
}

const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

function matchVenues(query: string, venues: Venue[]): Venue[] {
  const q = query.toLowerCase();

  // Crowd mood filters
  const wantsChill = /chill|quiet|low.?key|relaxed|calm/.test(q);
  const wantsBusy  = /busy|packed|lit|poppin|hype|energy|vibe/.test(q);

  // Category keywords
  const catMap: Record<string, string[]> = {
    coffee:        ['coffee', 'cafe', 'latte', 'espresso', 'study'],
    bar:           ['bar', 'drink', 'cocktail', 'happy hour', 'beer'],
    restaurant:    ['food', 'eat', 'dinner', 'lunch', 'restaurant', 'hungry'],
    nightlife:     ['night', 'club', 'dance', 'dj', 'nightlife'],
    shopping:      ['shop', 'store', 'buy', 'retail', 'mall'],
    fitness:       ['gym', 'workout', 'fitness', 'exercise'],
    entertainment: ['event', 'show', 'entertainment', 'fun', 'activity'],
  };

  const matchedCats = Object.entries(catMap)
    .filter(([, keywords]) => keywords.some(k => q.includes(k)))
    .map(([cat]) => cat);

  let filtered = venues;

  // Filter by category if any matched
  if (matchedCats.length > 0) {
    filtered = filtered.filter(v =>
      matchedCats.includes(v.category ?? '') || matchedCats.includes(v.type ?? '')
    );
  }

  // Filter by crowd mood
  if (wantsChill) {
    filtered = [...filtered].sort((a, b) => (a.crowd?.level ?? 2) - (b.crowd?.level ?? 2));
  } else if (wantsBusy) {
    filtered = [...filtered].sort((a, b) => (b.crowd?.level ?? 2) - (a.crowd?.level ?? 2));
  }

  // Fallback: return any 3
  return (filtered.length > 0 ? filtered : venues).slice(0, 3);
}

function buildReply(query: string, results: Venue[]): string {
  const q = query.toLowerCase();
  if (/chill|quiet|relaxed/.test(q)) return `Here are some chill spots right now 😌`;
  if (/busy|packed|lit|hype/.test(q)) return `These places are buzzing right now 🔥`;
  if (/coffee|cafe/.test(q)) return `Great coffee spots nearby ☕`;
  if (/bar|drink|cocktail/.test(q)) return `Top bar picks for you 🍸`;
  if (/food|eat|hungry/.test(q)) return `Good eats in Midtown 🍽️`;
  if (/night|club|dance/.test(q)) return `Nightlife picks for tonight 🎶`;
  if (results.length > 0) return `Here are some spots that match what you're looking for 📍`;
  return `I found a few places you might like 👇`;
}

const SUGGESTIONS = ['Find me something chill', 'Where is it busy tonight?', 'Best coffee spots', 'Good food nearby', 'Bars open now'];

export function HomeConcierge({ isOpen, onClose, venues, onVenueSelect, tabMode = false }: HomeConciergeProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, sender: 'ai', text: "Hey! I'm your Bytspot Concierge 👋 Tell me your vibe and I'll find the perfect spot in Midtown for you." },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = (text?: string) => {
    const query = (text ?? input).trim();
    if (!query) return;
    setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: query }]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      const results = matchVenues(query, venues);
      const reply = buildReply(query, results);
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: reply, venues: results }]);
      setIsTyping(false);
    }, 700 + Math.random() * 600);
  };

  const crowdColor = (v: Venue) => {
    const lvl = v.crowd?.level ?? 0;
    return lvl === 4 ? 'text-red-400' : lvl === 3 ? 'text-orange-400' : lvl === 2 ? 'text-yellow-400' : 'text-green-400';
  };

  // Shared inner chat content
  const chatContent = (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b border-white/10 ${tabMode ? 'pt-4' : 'pb-3'}`}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-white text-[15px]" style={{ fontWeight: 700 }}>Bytspot Concierge</p>
            <p className="text-green-400 text-[11px]" style={{ fontWeight: 500 }}>● Online · Ask me anything</p>
          </div>
        </div>
        {!tabMode && (
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4 text-white/70" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide min-h-0">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] ${m.sender === 'user'
              ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
              : 'bg-[#1C1C1E] border border-white/10 text-white'} rounded-[18px] px-4 py-3`}>
              <p className="text-[14px] leading-relaxed" style={{ fontWeight: 400 }}>{m.text}</p>
              {m.venues && m.venues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.venues.map(v => (
                    <button key={v.id ?? v.name}
                      onClick={() => { onVenueSelect(v); if (!tabMode) onClose?.(); }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-[14px] bg-white/10 hover:bg-white/15 transition-colors text-left">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-purple-300" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[13px] truncate" style={{ fontWeight: 600 }}>{v.name}</p>
                        {v.crowd && (
                          <p className={`text-[11px] ${crowdColor(v)}`} style={{ fontWeight: 600 }}>
                            {v.crowd.label}{v.crowd.waitMins ? ` · ~${v.crowd.waitMins}m wait` : ''}
                          </p>
                        )}
                      </div>
                      <span className="text-white/40 text-[12px]">›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[#1C1C1E] border border-white/10 rounded-[18px] px-4 py-3 flex gap-1.5 items-center">
              {[0, 0.2, 0.4].map(d => (
                <motion.div key={d} className="w-2 h-2 rounded-full bg-white/50"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: d }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {/* Suggestions */}
      <div className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => handleSend(s)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] bg-purple-500/15 border border-purple-400/30 text-purple-300"
            style={{ fontWeight: 500 }}>
            {s}
          </button>
        ))}
      </div>
      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 flex-shrink-0" style={{ paddingBottom: tabMode ? 'calc(12px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Find me somewhere chill…"
          className="flex-1 px-4 py-2.5 rounded-full bg-[#1C1C1E] border border-white/15 text-white text-[14px] placeholder:text-white/40 outline-none focus:border-purple-400 transition-colors"
        />
        <motion.button onClick={() => handleSend()}
          disabled={!input.trim()}
          className={`w-10 h-10 rounded-full flex items-center justify-center ${input.trim() ? 'bg-gradient-to-br from-purple-500 to-fuchsia-500' : 'bg-white/10'}`}
          whileTap={{ scale: 0.9 }}>
          <Send className={`w-4 h-4 ${input.trim() ? 'text-white' : 'text-white/30'}`} strokeWidth={2.5} />
        </motion.button>
      </div>
    </>
  );

  // Tab mode: render as full-height inline panel
  if (tabMode) {
    return (
      <div className="absolute inset-0 flex flex-col bg-[#111]">
        {chatContent}
      </div>
    );
  }

  // Modal mode: bottom-sheet with backdrop
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[71] bg-[#111] rounded-t-[32px] border-t border-white/10 flex flex-col"
            style={{ maxHeight: '85vh' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springConfig}
          >
            {/* Handle */}
            <div className="w-full flex justify-center pt-3 pb-2" onClick={onClose}>
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>
            {chatContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

