import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, MapPin, DollarSign, Clock, Mic, MicOff, Navigation, Calendar, Cloud, Users, AlertCircle, Phone, Zap, TrendingDown, TrendingUp, Shield, Star } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner@2.0.3';
import { trpc } from '../utils/trpc';

interface ConciergeSectionProps {
  isDarkMode: boolean;
}

interface Message {
  id: number;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  recommendations?: Recommendation[];
  metadata?: {
    weather?: string;
    location?: string;
    budget?: string;
    urgency?: 'normal' | 'urgent';
  };
}

interface Recommendation {
  id: string;
  type: 'parking' | 'valet' | 'venue' | 'transportation';
  title: string;
  subtitle: string;
  price: string;
  distance: string;
  rating?: number;
  badge?: string;
  savings?: string;
  walkTime?: string;
  icon: 'parking' | 'valet' | 'venue' | 'bus' | 'train';
}

export function ConciergeSection({ isDarkMode }: ConciergeSectionProps) {
  const initialMessages = useMemo(() => [
    {
      id: 1,
      type: 'ai' as const,
      content: "👋 Hey there! I'm your Bytspot AI Concierge. I can help you find parking, discover venues, book valet services, and optimize your budget.\n\nWhat can I help you with today?",
      timestamp: new Date(),
      suggestions: [
        '🅿️ Find parking near Midtown',
        '🎉 Best parking for events',
        '💰 Cheapest options',
        '🆘 Help with reservation',
      ],
    },
  ], []);

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [locationShared, setLocationShared] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('Atlanta, GA');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        setIsListening(false);
        toast.success('Voice input captured!');
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
        toast.error('Voice input failed. Please try again.');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (!recognitionRef.current) {
      toast.error('Voice input not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      toast('Listening... Speak now', {
        icon: '🎤',
        duration: 3000,
      });
    }
  }, [isListening]);

  const shareLocation = useCallback(() => {
    if (!locationShared) {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocationShared(true);
            setCurrentLocation('Current Location');
            toast.success('Location shared! Precision: 100m accuracy', {
              description: 'I can now give you personalized recommendations',
              duration: 3000,
            });
          },
          () => {
            toast.error('Location access denied', {
              description: 'Using default location: Atlanta',
            });
          }
        );
      }
    } else {
      setLocationShared(false);
      setCurrentLocation('Atlanta, GA');
      toast('Location sharing disabled');
    }
  }, [locationShared]);

  const getSmartAIResponse = (userMessage: string): { content: string; suggestions?: string[]; recommendations?: Recommendation[] } => {
    const lowerMessage = userMessage.toLowerCase();
    const weather = '72° Clear'; // This could be fetched from an API
    
    // Parking near Midtown under $15
    if (lowerMessage.includes('midtown') || (lowerMessage.includes('parking') && lowerMessage.includes('$15'))) {
      return {
        content: `🎯 Found 6 covered parking options near Midtown under $15/hour:\n\nBased on current weather (${weather}), time (${new Date().toLocaleTimeString()}), and your budget, here are my top recommendations:`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Colony Square Garage',
            subtitle: 'Covered • Security 24/7',
            price: '$12/hr',
            distance: '0.1 mi',
            rating: 4.8,
            badge: '🎯 Best Match',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'parking',
            title: 'Atlantic Station Deck',
            subtitle: 'Covered • EV Charging',
            price: '$14/hr',
            distance: '0.2 mi',
            rating: 4.6,
            savings: 'Save $3',
            walkTime: '3 min walk',
            icon: 'parking',
          },
          {
            id: '3',
            type: 'parking',
            title: 'Peachtree Center Garage',
            subtitle: 'Covered • Easy Access',
            price: '$11/hr',
            distance: '0.3 mi',
            rating: 4.5,
            savings: 'Save $5',
            walkTime: '5 min walk',
            badge: '💰 Budget Pick',
            icon: 'parking',
          },
        ],
        suggestions: [
          '🎫 Reserve Colony Square Garage now',
          '💰 Show me all options under $10/hour',
          '🚶 What\'s the walking time for each?',
          '⚡ Which has EV charging?',
        ],
      };
    }

    // Atlanta United / game parking
    if (lowerMessage.includes('united') || lowerMessage.includes('game') || lowerMessage.includes('falcons') || lowerMessage.includes('stadium')) {
      return {
        content: `⚽ Atlanta United game tonight at Mercedes-Benz Stadium! Traffic will be heavy.\n\nHere's your best strategy for easy parking & exit:\n\n🚗 **Smart Pick**: Park further out and avoid post-game gridlock. I found spots with dedicated shuttle service:`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Gulch Parking Deck',
            subtitle: 'Free shuttle • Quick exit',
            price: '$18 flat',
            distance: '0.3 mi',
            rating: 4.9,
            badge: '⚡ Easy Exit',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'valet',
            title: 'MBS Premium Valet',
            subtitle: 'Door-to-door service',
            price: '$45 flat',
            distance: 'At venue',
            rating: 5.0,
            badge: '⭐ Premium',
            icon: 'valet',
          },
          {
            id: '3',
            type: 'transportation',
            title: 'MARTA + 5 min walk',
            subtitle: 'No parking stress',
            price: '$2.50',
            distance: 'N/A',
            savings: 'Save $16-42',
            badge: '🚇 Eco Option',
            icon: 'train',
          },
        ],
        suggestions: [
          '🎫 Reserve Gulch Deck now (25 spots left)',
          '🚇 Show me MARTA options',
          '💰 Cheapest parking within 10 blocks',
          '⏱️ What time should I arrive?',
        ],
      };
    }

    // Cheapest secure parking
    if ((lowerMessage.includes('cheapest') || lowerMessage.includes('cheap')) && lowerMessage.includes('parking')) {
      return {
        content: `💰 Here are the cheapest secure parking options within 5 blocks of your destination:\n\n**Budget Analysis**: By walking 2-3 extra blocks, you can save $5-15 per hour! All options have security cameras and are well-lit.`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Spring & 10th Lot',
            subtitle: 'Security cameras • Well-lit',
            price: '$6/hr',
            distance: '0.4 mi',
            rating: 4.3,
            badge: '💰 Cheapest',
            savings: 'Save $9/hr',
            walkTime: '6 min walk',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'parking',
            title: 'Peachtree & 14th Garage',
            subtitle: 'Security patrol • Covered',
            price: '$8/hr',
            distance: '0.3 mi',
            rating: 4.4,
            savings: 'Save $7/hr',
            walkTime: '5 min walk',
            icon: 'parking',
          },
          {
            id: '3',
            type: 'parking',
            title: 'Juniper Street Lot',
            subtitle: 'Attendant on-site',
            price: '$10/hr',
            distance: '0.2 mi',
            rating: 4.6,
            savings: 'Save $5/hr',
            walkTime: '3 min walk',
            badge: '⚖️ Best Value',
            icon: 'parking',
          },
        ],
        suggestions: [
          '🎫 Reserve the cheapest spot now',
          '🚶 Show walking routes for each',
          '💡 What about monthly parking passes?',
          '⚡ Include premium options for comparison',
        ],
      };
    }

    // Expired reservation problem
    if (lowerMessage.includes('expired') || lowerMessage.includes('reservation')) {
      return {
        content: `🆘 No worries! Your reservation expired 10 minutes ago, but I have solutions:\n\n**Option 1**: Extend your current spot (if available)\n**Option 2**: Find nearby alternatives immediately\n**Option 3**: Get valet to move your car\n\n⚡ **Urgent**: Your car may be at risk of citation. Here are instant options:`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Same Garage - Extend',
            subtitle: 'Available now • 2 hours',
            price: '$16/2hr',
            distance: '0.0 mi',
            rating: 4.5,
            badge: '⚡ Fastest',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'parking',
            title: 'Next Door Garage',
            subtitle: 'Walk 1 block • Move car now',
            price: '$14/2hr',
            distance: '0.1 mi',
            rating: 4.6,
            savings: 'Save $2',
            walkTime: '2 min walk',
            icon: 'parking',
          },
          {
            id: '3',
            type: 'valet',
            title: 'Emergency Valet Service',
            subtitle: 'We move your car for you',
            price: '$30 flat',
            distance: 'Full service',
            badge: '🛎️ Concierge',
            icon: 'valet',
          },
        ],
        suggestions: [
          '✅ Extend current spot now',
          '📞 Call human support (urgent)',
          '🚗 Book emergency valet',
          '💡 Set up auto-extend for future',
        ],
      };
    }

    // Premium security features
    if (lowerMessage.includes('premium') || lowerMessage.includes('security')) {
      return {
        content: `🛡️ **Premium Security Features Explained**:\n\n✓ 24/7 Security Patrol (on-site guards)\n✓ HD Camera System (recorded)\n✓ License Plate Recognition\n✓ Gated Access (key card entry)\n✓ Theft Insurance Coverage\n✓ Instant Alert System\n\n**Is it worth it?** Yes, if:\n• High-value vehicle ($40k+)\n• Overnight/extended parking\n• High-crime area\n• Peace of mind matters\n\n**Cost**: Usually $3-5 more per hour.\n\nHere's a comparison:`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Premium Secure Garage',
            subtitle: 'All security features',
            price: '$18/hr',
            distance: '0.2 mi',
            rating: 4.9,
            badge: '🛡️ Premium',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'parking',
            title: 'Standard Garage',
            subtitle: 'Camera monitoring only',
            price: '$13/hr',
            distance: '0.2 mi',
            rating: 4.5,
            savings: 'Save $5/hr',
            icon: 'parking',
          },
          {
            id: '3',
            type: 'valet',
            title: 'Valet + Premium Security',
            subtitle: 'Attendant parks in secure lot',
            price: '$35 flat',
            distance: 'Door service',
            rating: 5.0,
            badge: '⭐ Best',
            icon: 'valet',
          },
        ],
        suggestions: [
          '🎫 Book premium garage',
          '💰 Show standard options',
          '📊 Compare insurance coverage',
          '💡 What about valet security?',
        ],
      };
    }

    // Group coordination
    if (lowerMessage.includes('group') || lowerMessage.includes('multiple')) {
      return {
        content: `👥 **Group Parking Coordination**:\n\nI can help you book multiple spots with synchronized times! Here's what I found for your group:\n\n✓ Same garage, different levels\n✓ Synchronized booking times\n✓ Group discount available\n✓ Easy meetup coordination`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Group Package (3-5 cars)',
            subtitle: 'Same garage • 15% group discount',
            price: '$12/hr each',
            distance: '0.2 mi',
            rating: 4.7,
            badge: '👥 Group Deal',
            savings: 'Save $3 each',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'parking',
            title: 'Adjacent Garages',
            subtitle: 'Walk to same exit point',
            price: '$10-14/hr',
            distance: '0.1-0.2 mi',
            rating: 4.5,
            walkTime: '2 min between',
            icon: 'parking',
          },
        ],
        suggestions: [
          '📋 Reserve spots for 3 vehicles',
          '📍 Show best meetup points',
          '💰 Calculate total group cost',
          '⚡ Book all spots at once',
        ],
      };
    }

    // Weather considerations
    if (lowerMessage.includes('weather') || lowerMessage.includes('rain')) {
      return {
        content: `☔ **Weather-Smart Recommendations**:\n\nCurrent weather: ${weather}\nForecast: Clear skies all day\n\nBased on current conditions, here's what I recommend:`,
        recommendations: [
          {
            id: '1',
            type: 'parking',
            title: 'Covered Garage',
            subtitle: 'Protected from elements',
            price: '$15/hr',
            distance: '0.2 mi',
            rating: 4.8,
            badge: '🌤️ Weather-proof',
            icon: 'parking',
          },
          {
            id: '2',
            type: 'valet',
            title: 'Valet Service',
            subtitle: 'No walking in weather',
            price: '$30 flat',
            distance: 'Door service',
            rating: 4.9,
            icon: 'valet',
          },
        ],
        suggestions: [
          '🅿️ Show only covered parking',
          '🚗 Book valet service',
          '🌦️ Set weather alerts',
        ],
      };
    }

    // Default smart response
    return {
      content: `I can help you navigate Atlanta! Here's what I do best:\n\n🅿️ **Parking** — find & reserve spots by location, price, or event\n📍 **Venues** — crowd levels, wait times, and what's trending\n🚗 **Rides** — compare options and plan your route\n🎉 **Events** — tonight's happenings and nearby plans\n\nTry asking me something like:\n• "Where should I park near Piedmont Park?"\n• "What's happening in Midtown tonight?"\n• "Find me cheap parking for the game"`,
      suggestions: [
        '🅿️ Find parking near me',
        '🎉 What\'s happening tonight?',
        '📍 Trending spots in Midtown',
        '🚗 Plan my night out',
      ],
    };
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userInput = inputValue;
    const userMessage: Message = {
      id: Date.now(),
      type: 'user',
      content: userInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Offline: respond locally instead of hitting the API
    if (!navigator.onLine) {
      const response = getSmartAIResponse(userInput);
      const aiMessage: Message = {
        id: Date.now() + 1, type: 'ai',
        content: '📡 *You\'re offline.* Here\'s what I found from cached data:\n\n' + response.content,
        timestamp: new Date(), suggestions: response.suggestions, recommendations: response.recommendations,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
      return;
    }

    // Build conversation history for the API (last 10 messages)
    const conversationHistory = [...messages, userMessage]
      .filter((m) => m.type === 'user' || m.type === 'ai')
      .slice(-10)
      .map((m) => ({ role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.content }));

    try {
      const token = localStorage.getItem('bytspot_auth_token');
      if (!token) {
        // Unauthenticated — fall back to local mock
        const response = getSmartAIResponse(userInput);
        const aiMessage: Message = {
          id: Date.now() + 1, type: 'ai', content: response.content,
          timestamp: new Date(), suggestions: response.suggestions, recommendations: response.recommendations,
        };
        setMessages((prev) => [...prev, aiMessage]);
        setIsTyping(false);
        return;
      }

      const result = await trpc.concierge.chat.mutate({
        messages: conversationHistory,
        venues: [],
        quizAnswers: undefined,
      });

      const suggestions: string[] = [];
      if (result.liveEvents && result.liveEvents.length > 0) {
        suggestions.push(`🎫 ${result.liveEvents[0].title}`);
      }
      if (result.livePlaces && result.livePlaces.length > 0) {
        suggestions.push(`📍 Tell me about ${result.livePlaces[0].name}`);
      }
      suggestions.push('🅿️ Find parking nearby', '🌙 Plan my night');

      const aiMessage: Message = {
        id: Date.now() + 1,
        type: 'ai',
        content: result.reply,
        timestamp: new Date(),
        suggestions: suggestions.slice(0, 4),
        metadata: {
          location: currentLocation,
          budget: 'Standard',
          urgency: 'normal',
        },
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      console.error('[Concierge] API error:', err?.message);
      // Fall back to local mock on error
      const response = getSmartAIResponse(userInput);
      const aiMessage: Message = {
        id: Date.now() + 1, type: 'ai', content: response.content,
        timestamp: new Date(), suggestions: response.suggestions, recommendations: response.recommendations,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestion = useCallback((suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  }, []);

  const getRecommendationIcon = useCallback((icon: string) => {
    switch (icon) {
      case 'parking': return <MapPin className="w-5 h-5" />;
      case 'valet': return <Star className="w-5 h-5" />;
      case 'venue': return <Sparkles className="w-5 h-5" />;
      case 'bus': return <Navigation className="w-5 h-5" />;
      case 'train': return <Navigation className="w-5 h-5" />;
      default: return <MapPin className="w-5 h-5" />;
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Section Header */}
      <motion.div
        className="px-4 pt-4 pb-3 flex-shrink-0"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center relative">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
              <motion.div
                className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#000000]"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h2 className="text-title-2 text-white">
                AI Concierge
              </h2>
              <p className="text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                Powered by Advanced AI • Online 24/7
              </p>
            </div>
          </div>
        </div>

        {/* Context Bar */}
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
          <motion.button
            onClick={shareLocation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border-2 whitespace-nowrap ${
              locationShared
                ? 'bg-green-500/20 border-green-400 text-green-400'
                : 'bg-[#1C1C1E]/80 border-white/30 text-white/80'
            }`}
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.95 }}
            transition={springConfig}
          >
            <Navigation className="w-3 h-3" />
            {locationShared ? 'Location On' : 'Share Location'}
          </motion.button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] bg-[#1C1C1E]/80 border-2 border-white/30 text-white/80 whitespace-nowrap" style={{ fontWeight: 600 }}>
            <Cloud className="w-3 h-3" />
            72° Clear
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] bg-[#1C1C1E]/80 border-2 border-white/30 text-white/80 whitespace-nowrap" style={{ fontWeight: 600 }}>
            <Clock className="w-3 h-3" />
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </motion.div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4" style={{ paddingBottom: '200px' }}>
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ ...springConfig, delay: 0 }}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                {/* Urgency Badge */}
                {message.metadata?.urgency === 'urgent' && message.type === 'ai' && (
                  <motion.div
                    className="flex items-center gap-1 mb-2 px-2 py-1 rounded-full bg-red-500/20 border border-red-400 w-fit"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    <span className="text-[10px] text-red-400" style={{ fontWeight: 600 }}>
                      URGENT RESPONSE
                    </span>
                  </motion.div>
                )}

                {/* Message Bubble */}
                <div className={`rounded-[20px] px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    : 'bg-[#1C1C1E]/90 border-2 border-white/30 text-white backdrop-blur-xl shadow-xl'
                }`}>
                  <p className="text-[15px] whitespace-pre-line" style={{ fontWeight: 400, lineHeight: '1.5' }}>
                    {message.content}
                  </p>
                </div>

                {/* Recommendations Cards */}
                {message.recommendations && message.recommendations.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.recommendations.map((rec) => (
                      <motion.div
                        key={rec.id}
                        className="rounded-[16px] p-3 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-lg hover:shadow-xl cursor-pointer"
                        whileTap={{ scale: 0.98 }}
                        transition={springConfig}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white ${
                            rec.type === 'valet' ? 'bg-gradient-to-br from-yellow-500/40 to-orange-500/40' :
                            rec.type === 'transportation' ? 'bg-gradient-to-br from-blue-500/40 to-cyan-500/40' :
                            'bg-gradient-to-br from-purple-500/40 to-pink-500/40'
                          }`}>
                            {getRecommendationIcon(rec.icon)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-[15px] text-white truncate" style={{ fontWeight: 600 }}>
                                {rec.title}
                              </h4>
                              {rec.badge && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-400 text-purple-200 whitespace-nowrap flex-shrink-0" style={{ fontWeight: 600 }}>
                                  {rec.badge}
                                </span>
                              )}
                            </div>

                            <p className="text-[13px] text-white/80 mb-2" style={{ fontWeight: 400 }}>
                              {rec.subtitle}
                            </p>

                            <div className="flex items-center gap-3 text-[12px]">
                              <span className="text-green-400" style={{ fontWeight: 700 }}>
                                {rec.price}
                              </span>
                              <span className="text-white/60">•</span>
                              <span className="text-white/80" style={{ fontWeight: 500 }}>
                                {rec.distance}
                              </span>
                              {rec.rating && (
                                <>
                                  <span className="text-white/60">•</span>
                                  <div className="flex items-center gap-1">
                                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                    <span className="text-white/80" style={{ fontWeight: 500 }}>
                                      {rec.rating}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>

                            {(rec.savings || rec.walkTime) && (
                              <div className="flex items-center gap-2 mt-2">
                                {rec.savings && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 border border-green-400 text-green-400" style={{ fontWeight: 600 }}>
                                    {rec.savings}
                                  </span>
                                )}
                                {rec.walkTime && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400 text-blue-400" style={{ fontWeight: 600 }}>
                                    🚶 {rec.walkTime}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Suggestions */}
                {message.suggestions && message.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.suggestions.map((suggestion, idx) => (
                      <motion.button
                        key={idx}
                        onClick={() => handleSuggestion(suggestion)}
                        className="block w-full text-left rounded-[16px] px-4 py-2.5 border-2 border-white/30 bg-[#1C1C1E]/60 text-white hover:bg-[#1C1C1E]/80 backdrop-blur-xl shadow-lg"
                        whileTap={{ scale: 0.98 }}
                        transition={springConfig}
                      >
                        <span className="text-[14px]" style={{ fontWeight: 500 }}>
                          {suggestion}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <p className={`text-[11px] mt-1.5 ${
                  message.type === 'user' ? 'text-right' : 'text-left'
                } text-white/60`} style={{ fontWeight: 400 }}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex justify-start"
          >
            <div className="bg-[#1C1C1E]/90 border-2 border-white/30 rounded-[20px] px-4 py-3 backdrop-blur-xl">
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

      {/* Input Area */}
      <div className="px-4 pb-28 flex-shrink-0">
        {/* Quick Actions Row */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          <motion.button
            onClick={() => handleSuggestion('🅿️ Find parking near me')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] bg-[#1C1C1E]/80 border border-white/30 text-white whitespace-nowrap"
            style={{ fontWeight: 500 }}
            whileTap={{ scale: 0.95 }}
          >
            <MapPin className="w-3.5 h-3.5" />
            Parking
          </motion.button>

          <motion.button
            onClick={() => handleSuggestion('🎉 Best venues tonight')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] bg-[#1C1C1E]/80 border border-white/30 text-white whitespace-nowrap"
            style={{ fontWeight: 500 }}
            whileTap={{ scale: 0.95 }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Venues
          </motion.button>

          <motion.button
            onClick={() => handleSuggestion('💰 Cheapest options')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] bg-[#1C1C1E]/80 border border-white/30 text-white whitespace-nowrap"
            style={{ fontWeight: 500 }}
            whileTap={{ scale: 0.95 }}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Budget
          </motion.button>

          <motion.button
            onClick={() => {
              toast('📞 Connecting to human support...', {
                description: 'Average wait time: 2 minutes',
                duration: 3000,
              });
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] bg-red-500/20 border border-red-400 text-red-400 whitespace-nowrap"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.95 }}
          >
            <Phone className="w-3.5 h-3.5" />
            Human Support
          </motion.button>
        </div>

        {/* Input Box */}
        <div className="rounded-[24px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
          <div className="flex items-end gap-2 p-2">
            {/* Voice Input Button */}
            <motion.button
              onClick={toggleVoiceInput}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isListening
                  ? 'bg-gradient-to-br from-red-500 to-pink-500 shadow-lg shadow-red-500/25'
                  : 'bg-white/10 border-2 border-white/30'
              }`}
              whileTap={{ scale: 0.9 }}
              transition={isListening ? { duration: 1, repeat: Infinity } : springConfig}
              animate={isListening ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            >
              {isListening ? (
                <MicOff className="w-5 h-5 text-white" strokeWidth={2.5} />
              ) : (
                <Mic className="w-5 h-5 text-white" strokeWidth={2.5} />
              )}
            </motion.button>

            {/* Text Input */}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isListening ? 'Listening...' : 'Ask me anything...'}
              className="flex-1 bg-transparent text-[15px] outline-none resize-none px-3 py-2 min-h-[40px] max-h-[120px] text-white placeholder:text-white/50"
              style={{ fontWeight: 400 }}
              rows={1}
              disabled={isListening}
            />

            {/* Send Button */}
            <motion.button
              onClick={handleSend}
              disabled={!inputValue.trim() || isListening}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                inputValue.trim() && !isListening
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25'
                  : 'bg-white/10'
              }`}
              whileTap={{ scale: inputValue.trim() && !isListening ? 0.9 : 1 }}
              transition={springConfig}
            >
              <Send className={`w-5 h-5 ${
                inputValue.trim() && !isListening ? 'text-white' : 'text-white/40'
              }`} strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-white/40 text-center mt-2" style={{ fontWeight: 400 }}>
          🤖 AI-powered suggestions • 📞 Human support available 24/7 • 🔒 Your data is secure
        </p>
      </div>
    </div>
  );
}
