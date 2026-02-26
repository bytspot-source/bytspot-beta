import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Clock, MapPin, DollarSign, Users } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ConciergeChatProps {
  venue: any;
  isDarkMode: boolean;
  onClose: () => void;
}

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  suggestions?: string[];
}

const initialMessages: Message[] = [
  {
    id: 1,
    text: `Hi! I'm your AI Concierge for ${' '}. I can help you with reservations, recommendations, parking info, and more. What would you like to know?`,
    sender: 'ai',
    timestamp: new Date(),
    suggestions: [
      'Make a reservation',
      'What\'s the dress code?',
      'Parking options nearby',
      'Best time to visit',
    ],
  },
];

export function ConciergeChat({ venue, isDarkMode, onClose }: ConciergeChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      ...initialMessages[0],
      text: `Hi! I'm your AI Concierge for ${venue.name}. I can help you with reservations, recommendations, parking info, and more. What would you like to know?`,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getAIResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('reservation') || lowerMessage.includes('book')) {
      return `I can help you make a reservation at ${venue.name}! We have availability for:\n\n• Tonight at 7:00 PM (2 available)\n• Tomorrow at 6:30 PM (4 available)\n• Friday at 8:00 PM (3 available)\n\nHow many people will be in your party?`;
    }
    
    if (lowerMessage.includes('parking')) {
      return `Great question! For ${venue.name}, I recommend:\n\n🅿️ Downtown Plaza Garage - 0.3 mi away, $8/hr\n🚗 Valet Service - Available at venue, $25 flat rate\n🅿️ Street parking - Limited, metered until 10 PM\n\nThe garage is your best bet. Should I reserve a spot for you?`;
    }
    
    if (lowerMessage.includes('dress code') || lowerMessage.includes('what to wear')) {
      return `${venue.name} has a smart casual to upscale dress code:\n\n✓ Collared shirts, dress shoes\n✓ Cocktail dresses, heels\n✓ Business casual attire\n\n✗ Athletic wear, flip-flops\n✗ Overly casual attire\n\nWeekends tend to be more dressed up!`;
    }
    
    if (lowerMessage.includes('time') || lowerMessage.includes('when')) {
      return `Best times to visit ${venue.name}:\n\n🌅 Happy Hour (5-7 PM): Great deals, moderate crowd\n🌆 Sunset (7-8 PM): Best views, getting busy\n🌃 Peak (9-11 PM): Full energy, DJ, crowded\n🌙 Late Night (11 PM+): Winding down, last call 1:30 AM\n\nI'd recommend arriving around 7 PM for the perfect balance!`;
    }
    
    if (lowerMessage.includes('menu') || lowerMessage.includes('food') || lowerMessage.includes('drink')) {
      return `${venue.name} is known for:\n\n🍸 Signature cocktails ($14-18) - Try the Sunset Sour!\n🥂 Premium spirits selection\n🍽️ Small plates & tapas ($10-16)\n🍺 Craft beer on tap ($8-12)\n\nHappy hour is 5-7 PM with $2 off cocktails. Would you like to see the full menu?`;
    }
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('expensive')) {
      return `${venue.name} pricing:\n\n💰 Average spend: $40-60 per person\n🍸 Cocktails: $14-18\n🍷 Wine: $12-20/glass\n🍽️ Small plates: $10-16\n\nIt's moderately priced for the quality and location. Worth it for the views!`;
    }
    
    return `I can help you with that! Here are some things I can assist with:\n\n• Making reservations\n• Parking and valet info\n• Menu recommendations\n• Dress code and ambiance\n• Best times to visit\n• Special events\n\nWhat would you like to know more about?`;
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI thinking time
    setTimeout(() => {
      const aiResponse: Message = {
        id: messages.length + 2,
        text: getAIResponse(inputValue),
        sender: 'ai',
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-[#000000]"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={springConfig}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 border-b-2 border-white/30 backdrop-blur-xl">
          <div className="max-w-[393px] mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    AI Concierge
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-green-400"
                      animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <span className="text-[13px] text-white/90" style={{ fontWeight: 500 }}>
                      Online • Instant replies
                    </span>
                  </div>
                </div>
              </div>

              <motion.button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                <X className="w-5 h-5 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>

            {/* Venue Context */}
            <div className="flex items-center gap-2 p-3 rounded-[12px] bg-black/30 border border-white/30">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span className="text-[13px] text-white flex-1 truncate" style={{ fontWeight: 500 }}>
                Chatting about: {venue.name}
              </span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4">
          <div className="max-w-[393px] mx-auto space-y-4">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springConfig}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white'
                      : 'bg-[#1C1C1E]/90 border-2 border-white/30 text-white'
                  } rounded-[20px] p-4`}
                >
                  <p className="text-[15px] whitespace-pre-line" style={{ fontWeight: 400 }}>
                    {message.text}
                  </p>
                  <span className={`text-[11px] mt-2 block ${
                    message.sender === 'user' ? 'text-white/80' : 'text-white/60'
                  }`} style={{ fontWeight: 400 }}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  {/* Suggestions */}
                  {message.suggestions && (
                    <div className="mt-3 space-y-2">
                      {message.suggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="w-full text-left px-3 py-2 rounded-[12px] bg-white/10 border border-white/30 text-[13px] text-white hover:bg-white/20 transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div className="bg-[#1C1C1E]/90 border-2 border-white/30 rounded-[20px] p-4">
                  <div className="flex items-center gap-1.5">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-white/70"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-white/70"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-white/70"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 bg-[#000000] border-t-2 border-white/30 backdrop-blur-xl">
          <div className="max-w-[393px] mx-auto p-4">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
              {[
                { icon: <Clock className="w-4 h-4" />, text: 'Hours' },
                { icon: <MapPin className="w-4 h-4" />, text: 'Parking' },
                { icon: <DollarSign className="w-4 h-4" />, text: 'Prices' },
                { icon: <Users className="w-4 h-4" />, text: 'Reservations' },
              ].map((action) => (
                <button
                  key={action.text}
                  onClick={() => handleSuggestionClick(action.text)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] bg-[#1C1C1E]/80 border border-white/30 text-white whitespace-nowrap"
                  style={{ fontWeight: 500 }}
                >
                  {action.icon}
                  {action.text}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask me anything..."
                className="flex-1 px-4 py-3 rounded-full text-[15px] bg-[#1C1C1E]/80 border-2 border-white/30 text-white placeholder:text-white/50 outline-none focus:border-purple-400 transition-colors"
                style={{ fontWeight: 400 }}
              />
              <motion.button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={`w-11 h-11 rounded-full flex items-center justify-center ${
                  inputValue.trim()
                    ? 'bg-gradient-to-br from-purple-500 to-fuchsia-500'
                    : 'bg-white/20'
                } border-2 border-white/30 tap-target`}
                whileTap={{ scale: inputValue.trim() ? 0.9 : 1 }}
                transition={springConfig}
              >
                <Send className={`w-5 h-5 ${inputValue.trim() ? 'text-white' : 'text-white/40'}`} strokeWidth={2.5} />
              </motion.button>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-white/50 text-center mt-2" style={{ fontWeight: 400 }}>
              AI responses are suggestions. Always verify critical information.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
