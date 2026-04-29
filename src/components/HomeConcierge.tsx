import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, MapPin, RotateCcw, Calendar, Star, Mic, MicOff } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { trpc } from '../utils/trpc';

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

interface LiveEvent {
  id: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  category: string;
  price: string;
}

interface LivePlace {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  primaryType: string | null;
  photoUrls: string[];
}

interface HomeConciergeProps {
  isOpen?: boolean;
  onClose?: () => void;
  venues: Venue[];
  onVenueSelect: (venue: Venue) => void;
  tabMode?: boolean;
  cityName?: string;
}

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  venues?: Venue[];
  events?: LiveEvent[];
  places?: LivePlace[];
}

const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
const messageTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
const wordVariants = {
  hidden: { opacity: 0, y: 4, filter: 'blur(3px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

const buildWelcomeMessage = (cityName: string): Message => ({
  id: 1,
  sender: 'ai',
  text: `Hey! I'm your Bytspot Concierge 👋 Ask me anything about ${cityName} — I know what's open, what's poppin', and what's happening tonight.`,
});

function PremiumAIText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <>{text}</>;

  const tokens = text.split(/(\s+)/).filter(Boolean);
  const stagger = Math.min(0.018, 1.35 / Math.max(tokens.length, 1));

  return (
    <motion.span
      className="block"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: stagger } } }}
    >
      {tokens.map((token, index) => token.trim() === '' ? (
        <span key={`${token}-${index}`}>{token}</span>
      ) : (
        <motion.span
          key={`${token}-${index}`}
          className="inline-block will-change-transform"
          variants={wordVariants}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {token}
        </motion.span>
      ))}
    </motion.span>
  );
}

const SUGGESTIONS = [
  '🌙 Plan my night',
  "What's happening tonight?",
  "What's chill right now?",
  'Best spot for drinks',
  'Good food nearby',
  'Date night ideas',
];

export function HomeConcierge({ isOpen, onClose, venues, onVenueSelect, tabMode = false, cityName = 'Midtown' }: HomeConciergeProps) {
  const [messages, setMessages] = useState<Message[]>(() => [buildWelcomeMessage(cityName)]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [connectionState, setConnectionState] = useState<'ready' | 'thinking' | 'offline' | 'fallback'>('ready');
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const nextMessageIdRef = useRef(2);

  const createMessageId = () => nextMessageIdRef.current++;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Voice recognition setup
  const toggleVoice = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  /** Lightweight local fallback when user is not logged in */
  const getLocalResponse = (query: string): { reply: string; matchedVenues: Venue[] } => {
    const q = query.toLowerCase();
    const matched: Venue[] = [];

    // Try to match venues by keyword
    for (const v of venues) {
      const name = v.name?.toLowerCase() ?? '';
      const cat = (v.category ?? v.type ?? '').toLowerCase();
      if (q.includes(name) || q.includes(cat) || (q.includes('drink') && cat.includes('bar'))
        || (q.includes('food') && (cat.includes('restaurant') || cat.includes('food')))
        || (q.includes('chill') && v.crowd && v.crowd.level <= 2)
        || (q.includes('poppin') && v.crowd && v.crowd.level >= 4)) {
        matched.push(v);
      }
    }

    if (matched.length > 0) {
      const list = matched.slice(0, 3).map(v => `• **${v.name}** — ${v.crowd?.label ?? 'Open now'}`).join('\n');
      return { reply: `Here's what I found in ${cityName}:\n\n${list}\n\nSign in for full AI-powered recommendations with live events & Google Places data! 🔓`, matchedVenues: matched.slice(0, 3) };
    }

    if (q.includes('night') || q.includes('tonight') || q.includes('happening')) {
      const top = venues.filter(v => v.crowd && v.crowd.level >= 3).slice(0, 3);
      if (top.length > 0) {
        const list = top.map(v => `• **${v.name}** — ${v.crowd?.label}`).join('\n');
        return { reply: `Here's what's buzzing tonight in ${cityName}:\n\n${list}\n\nSign in to unlock live events from Ticketmaster + AI-curated picks! ✨`, matchedVenues: top };
      }
      return { reply: `${cityName} always has something going on! Sign in to get AI-powered picks with live event data from Ticketmaster & Google Places 🎶`, matchedVenues: [] };
    }

    if (q.includes('date')) {
      const chill = venues.filter(v => v.crowd && v.crowd.level <= 3).slice(0, 3);
      return { reply: chill.length > 0
        ? `For date night vibes, check out:\n\n${chill.map(v => `• **${v.name}** — ${v.crowd?.label}`).join('\n')}\n\nSign in for personalized AI picks! 💜`
        : `I've got great date night ideas! Sign in to get personalized AI recommendations based on your vibe quiz 💜`, matchedVenues: chill };
    }

    // Generic fallback
    const sample = venues.slice(0, 3);
    return { reply: sample.length > 0
      ? `Here are some spots in ${cityName}:\n\n${sample.map(v => `• **${v.name}** — ${v.crowd?.label ?? 'Open'}`).join('\n')}\n\nSign in to chat with the full AI concierge — live events, Google Places, and personalized picks! 🚀`
      : `I'm your ${cityName} guide! Sign in to unlock AI-powered recommendations with live crowd data, events, and more 🔓`, matchedVenues: sample };
  };

  const handleSend = async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || isTyping) return;

    const userMsg: Message = { id: createMessageId(), sender: 'user', text: query };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setConnectionState(navigator.onLine ? 'thinking' : 'offline');

    // Offline: use local venue-matching instead of hitting the API
    if (!navigator.onLine) {
      const { reply, matchedVenues } = getLocalResponse(query);
      const offlineNote = '📡 *You\'re offline right now.* Here\'s what I can find from your cached data:\n\n';
      setMessages(prev => [
        ...prev,
        { id: createMessageId(), sender: 'ai', text: offlineNote + reply, venues: matchedVenues.length > 0 ? matchedVenues : undefined },
      ]);
      setIsTyping(false);
      setConnectionState('offline');
      return;
    }

    // Check auth — concierge.chat requires a logged-in user
    const token = localStorage.getItem('bytspot_auth_token');
    if (!token) {
      // Unauthenticated: use local venue-matching fallback
      const { reply, matchedVenues } = getLocalResponse(query);
      setMessages(prev => [
        ...prev,
        { id: createMessageId(), sender: 'ai', text: reply, venues: matchedVenues.length > 0 ? matchedVenues : undefined },
      ]);
      setIsTyping(false);
      setConnectionState('fallback');
      return;
    }

    const history = [...messages, userMsg].map(m => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

    const venueContext = venues.map(v => ({
      id: String(v.id ?? v.name),
      name: v.name,
      category: v.category ?? v.type ?? 'venue',
      crowd: v.crowd,
      address: v.address,
    }));

    let quizAnswers: Record<string, string> | undefined;
    try {
      const raw = localStorage.getItem('bytspot_quiz_answers');
      if (raw) quizAnswers = JSON.parse(raw);
    } catch { /* ignore */ }

    try {
      const result = await trpc.concierge.chat.mutate({ messages: history, venues: venueContext, quizAnswers });
      const { reply, venueIds, liveEvents, livePlaces } = result as any;
      // Map returned IDs back to full venue objects for the card UI
      const venueCards = (venueIds ?? [])
        .map((id: string) => venues.find(v => String(v.id ?? v.name) === id))
        .filter((v: Venue | undefined): v is Venue => Boolean(v));
      // Filter events that the AI referenced
      const eventIds: string[] = (result as any).eventIds ?? [];
      const eventCards: LiveEvent[] = eventIds.length > 0 && liveEvents
        ? (liveEvents as LiveEvent[]).filter((e: LiveEvent) => eventIds.includes(`evt:${e.id}`))
        : [];
      // Include live places the AI mentioned (gp: prefix IDs)
      const gpIds = (venueIds ?? []).filter((id: string) => id.startsWith('gp:'));
      const placeCards: LivePlace[] = gpIds.length > 0 && livePlaces
        ? (livePlaces as LivePlace[]).filter((p: LivePlace) => gpIds.includes(`gp:${p.placeId}`))
        : [];

      setMessages(prev => [
        ...prev,
        { id: createMessageId(), sender: 'ai', text: reply || 'I found a few options — want me to narrow it by vibe, price, or distance?', venues: venueCards, events: eventCards.length > 0 ? eventCards : undefined, places: placeCards.length > 0 ? placeCards : undefined },
      ]);
      setConnectionState('ready');
    } catch (err: any) {
      console.warn('[HomeConcierge] Falling back to local response:', err?.message ?? err);
      // API failed — fall back to local responses instead of dead-end error
      const { reply, matchedVenues } = getLocalResponse(query);
      setMessages(prev => [
        ...prev,
        { id: createMessageId(), sender: 'ai', text: `I couldn't reach live AI for a moment, so here's the best local read:\n\n${reply}`, venues: matchedVenues.length > 0 ? matchedVenues : undefined },
      ]);
      setConnectionState('fallback');
    } finally {
      setIsTyping(false);
    }
  };

  const crowdColor = (v: Venue) => {
    const lvl = v.crowd?.level ?? 0;
    return lvl === 4 ? 'text-red-400' : lvl === 3 ? 'text-orange-400' : lvl === 2 ? 'text-yellow-400' : 'text-green-400';
  };

  // Shared inner chat content
  const chatContent = (
    <>
      {/* Header */}
      <div className={`relative overflow-hidden border-b border-white/10 bg-[#0B0B0F]/92 px-5 py-3 backdrop-blur-xl ${tabMode ? 'pt-4' : 'pb-3'}`}>
        <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
        <div className="absolute -right-16 -top-20 h-36 w-36 rounded-full bg-purple-500/25 blur-3xl" />
        <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-purple-500 via-fuchsia-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-white/25">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-white text-[15px] leading-5" style={{ fontWeight: 700 }}>Bytspot Concierge</p>
            <p className="text-[11px] leading-4 text-green-300" style={{ fontWeight: 600 }}>
              ● {connectionState === 'thinking' ? 'Thinking' : connectionState === 'offline' ? 'Offline mode' : connectionState === 'fallback' ? 'Local fallback' : 'Live'} · {cityName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { nextMessageIdRef.current = 2; setMessages([buildWelcomeMessage(cityName)]); setConnectionState('ready'); }}
            className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center backdrop-blur-xl"
            title="Clear chat"
          >
            <RotateCcw className="w-3.5 h-3.5 text-white/60" strokeWidth={2.5} />
          </button>
          {!tabMode && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center backdrop-blur-xl">
              <X className="w-4 h-4 text-white/70" strokeWidth={2.5} />
            </button>
          )}
        </div>
        </div>
      </div>
      {/* Messages */}
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4 scrollbar-hide bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(0,191,255,0.09),transparent_34%)]">
        <AnimatePresence initial={false}>
        {messages.map(m => (
          <motion.div
            key={m.id}
            className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={messageTransition}
          >
            <div className={`relative max-w-[84%] overflow-hidden rounded-[22px] px-4 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.28)] ${m.sender === 'user'
              ? 'bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 text-white ring-1 ring-cyan-200/25'
              : 'bg-[#1C1C1E]/80 border border-white/20 text-white backdrop-blur-xl'}`}>
              {m.sender === 'ai' && <div className="absolute inset-x-3 top-0 h-px bg-white/25" />}
              <p className="text-[14px] leading-[20px] whitespace-pre-wrap" style={{ fontWeight: 400 }}>
                <PremiumAIText text={m.text} animate={m.sender === 'ai'} />
              </p>
              {/* Venue Cards */}
              {m.venues && m.venues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.venues.map(v => (
                    <button key={v.id ?? v.name}
                      onClick={() => { onVenueSelect(v); if (!tabMode) onClose?.(); }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-[16px] bg-white/10 border border-white/10 hover:bg-white/15 transition-colors text-left">
                      <div className="w-9 h-9 rounded-[13px] bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
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
              {/* Google Places Cards */}
              {m.places && m.places.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.places.map(p => (
                    <div key={p.placeId}
                      className="w-full flex items-center gap-3 p-2.5 rounded-[16px] bg-white/10 border border-white/10 text-left">
                      {p.photoUrls[0] ? (
                        <img src={p.photoUrls[0]} alt={p.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-400/30 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-4 h-4 text-cyan-300" strokeWidth={2} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[13px] truncate" style={{ fontWeight: 600 }}>{p.name}</p>
                        <div className="flex items-center gap-1.5">
                          {p.rating && <span className="text-yellow-400 text-[11px] flex items-center gap-0.5"><Star className="w-3 h-3" fill="currentColor" />{p.rating}</span>}
                          <span className="text-white/40 text-[11px]">{p.primaryType ?? 'venue'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Event Cards */}
              {m.events && m.events.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.events.map(e => (
                    <div key={e.id}
                      className="w-full flex items-center gap-3 p-2.5 rounded-[16px] bg-gradient-to-r from-orange-500/10 to-pink-500/10 border border-orange-400/20 text-left">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500/30 to-pink-500/30 border border-orange-400/30 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 text-orange-300" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[13px] truncate" style={{ fontWeight: 600 }}>{e.title}</p>
                        <p className="text-white/50 text-[11px]">{e.venue} · {e.time} · {e.price}</p>
                      </div>
                      <span className="text-orange-300 text-[11px]" style={{ fontWeight: 600 }}>🎫</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
        {isTyping && (
          <motion.div className="flex justify-start" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={messageTransition}>
            <div className="bg-[#1C1C1E]/80 border border-white/20 rounded-[20px] px-4 py-3 flex gap-1.5 items-center backdrop-blur-xl shadow-[0_12px_30px_rgba(0,0,0,0.24)]">
              {[0, 0.2, 0.4].map(d => (
                <motion.div key={d} className="w-2 h-2 rounded-full bg-white/50"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: d }} />
              ))}
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>
      {/* Suggestions */}
      <div className="px-4 pt-2 pb-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0 bg-[#0B0B0F]/92 backdrop-blur-xl">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => handleSend(s)}
            className="flex-shrink-0 px-3.5 py-2 rounded-full text-[12px] bg-purple-500/15 border border-purple-400/30 text-purple-200 shadow-sm shadow-purple-500/10"
            style={{ fontWeight: 500 }}>
            {s}
          </button>
        ))}
      </div>
      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10 bg-[#0B0B0F]/92 backdrop-blur-xl flex-shrink-0" style={{ paddingBottom: tabMode ? 'calc(12px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Find me somewhere chill…"
          className="flex-1 px-4 py-3 rounded-full bg-[#1C1C1E]/80 border border-white/20 text-white text-[15px] leading-5 placeholder:text-white/40 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 transition-colors backdrop-blur-xl"
        />
        {/* Voice Input */}
        <motion.button onClick={toggleVoice}
          className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/15 ${isListening ? 'bg-red-500/80 animate-pulse' : 'bg-white/10'}`}
          whileTap={{ scale: 0.9 }}
          title="Voice input">
          {isListening ? <MicOff className="w-4 h-4 text-white" strokeWidth={2.5} /> : <Mic className="w-4 h-4 text-white/50" strokeWidth={2.5} />}
        </motion.button>
        {/* Send */}
        <motion.button onClick={() => handleSend()}
          disabled={!input.trim()}
          className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/15 shadow-lg ${input.trim() ? 'bg-gradient-to-br from-purple-500 to-fuchsia-500 shadow-purple-500/25' : 'bg-white/10'}`}
          whileTap={{ scale: 0.9 }}>
          <Send className={`w-4 h-4 ${input.trim() ? 'text-white' : 'text-white/30'}`} strokeWidth={2.5} />
        </motion.button>
      </div>
    </>
  );

  // Tab mode: render as full-height inline panel
  if (tabMode) {
    return (
      <div className="absolute inset-0 flex flex-col bg-[#050507]">
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
            className="fixed bottom-0 left-0 right-0 z-[71] bg-[#050507] rounded-t-[32px] border-t border-white/20 flex flex-col overflow-hidden shadow-[0_-24px_70px_rgba(0,0,0,0.55)]"
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

