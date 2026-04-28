import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, MapPin, Star, Shield, Clock, DollarSign,
  Phone, Camera, Check, AlertCircle, Navigation, User, Car,
  CreditCard, Apple, Smartphone, ChevronRight, MessageCircle,
  Award, TrendingUp, Zap, Bell, Info, FileText, Image as ImageIcon,
  Share2, Mail, Download, Trophy, Gift, Calendar, Sparkles, Droplet,
  Wrench, Package, Fuel, Bike
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';

const VALET_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyB-b2l6T-saxk5h9PZUPRBmC7R_4pxryNk';

const VALET_DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252525' }] },
];

interface ValetService {
  id: string;
  name: string;
  photo: string;
  rating: number;
  totalServices: number;
  baseRate: number;
  responseTime: string;
  serviceArea: string;
  certifications: string[];
  bio: string;
}

interface ValetFlowProps {
  service: ValetService;
  isDarkMode: boolean;
  onClose: () => void;
}

type FlowStep = 'overview' | 'booking' | 'payment' | 'tracking' | 'retrieval' | 'completion';

interface AddonService {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number; // in minutes
  icon: any;
  popular?: boolean;
}

interface BookingDetails {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  licensePlate: string;
  specialInstructions: string;
  pickupLocation: string;
  addonServices: string[]; // array of addon service IDs
}

interface ServiceStatus {
  phase: 'assigned' | 'en-route' | 'picked-up' | 'bike-stowed' | 'parked' | 'retrieving' | 'bike-removed' | 'ready';
  message: string;
  timestamp: Date;
  location?: { lat: number; lng: number };
}

const VALET_PHASES = [
  { key: 'assigned', label: 'Valet Assigned', icon: User },
  { key: 'en-route', label: 'En Route to Pickup', icon: Navigation },
  { key: 'picked-up', label: 'Vehicle Picked Up', icon: Car },
  { key: 'bike-stowed', label: 'E-Bike Stowed', icon: Bike },
  { key: 'parked', label: 'Safely Parked', icon: MapPin },
  { key: 'retrieving', label: 'Retrieving Vehicle', icon: Car },
  { key: 'bike-removed', label: 'E-Bike Removed', icon: Bike },
  { key: 'ready', label: 'Ready for Pickup', icon: Bell },
];

const ADDON_SERVICES: AddonService[] = [
  {
    id: 'car_wash',
    name: 'Premium Car Wash',
    description: 'Full exterior wash, interior vacuum & wipe down',
    price: 35,
    duration: 30,
    icon: Droplet,
    popular: true,
  },
  {
    id: 'oil_change',
    name: 'Quick Oil Change',
    description: 'Full synthetic oil change while parked',
    price: 75,
    duration: 45,
    icon: Wrench,
  },
  {
    id: 'fuel_fill',
    name: 'Fuel Fill-Up',
    description: 'We\'ll fill your tank at local market price',
    price: 15,
    duration: 15,
    icon: Fuel,
    popular: true,
  },
  {
    id: 'delivery_pickup',
    name: 'Delivery Pickup',
    description: 'Pick up a package or delivery en route',
    price: 25,
    duration: 20,
    icon: Package,
  },
];

export function ValetFlow({ service: initialService, isDarkMode, onClose }: ValetFlowProps) {
  const { isLoaded: mapsLoaded } = useJsApiLoader({ googleMapsApiKey: VALET_MAPS_API_KEY });
  const [currentStep, setCurrentStep] = useState<FlowStep>('overview');
  const [bookingDetails, setBookingDetails] = useState<BookingDetails>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    licensePlate: '',
    specialInstructions: '',
    pickupLocation: 'Main Entrance',
    addonServices: [],
  });
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'apple' | 'google'>('card');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assignedValet, setAssignedValet] = useState({
    name: 'Michael Chen',
    photo: 'https://i.pravatar.cc/150?img=12',
    rating: 4.9,
    totalServices: 524,
    phone: '(415) 555-0123',
  });
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    phase: 'assigned',
    message: 'Your valet is reviewing your request',
    timestamp: new Date(),
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [estimatedTime, setEstimatedTime] = useState(8); // minutes
  const [duration, setDuration] = useState(2); // hours
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Simulate status updates - only run once when tracking starts
  useEffect(() => {
    if (currentStep !== 'tracking') return;
    
    const phases: ServiceStatus['phase'][] = ['assigned', 'en-route', 'picked-up', 'bike-stowed', 'parked'];
    let currentPhaseIndex = 0;
    let mounted = true;

    const interval = setInterval(() => {
      if (!mounted || currentPhaseIndex >= phases.length - 1) {
        clearInterval(interval);
        return;
      }
      currentPhaseIndex++;
      setServiceStatus({
        phase: phases[currentPhaseIndex],
        message: getStatusMessage(phases[currentPhaseIndex]),
        timestamp: new Date(),
      });
      setEstimatedTime(prev => Math.max(1, prev - 2));
    }, 8000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentStep]);

  const getStatusMessage = (phase: ServiceStatus['phase']) => {
    const messages = {
      assigned: 'Your valet is reviewing your request',
      'en-route': 'Michael is on the way to pick up your vehicle',
      'picked-up': 'Your vehicle has been picked up safely',
      'bike-stowed': 'Folding e-bike stowed in your trunk — driving to lot',
      parked: 'Your vehicle is parked and secured',
      retrieving: 'Michael is retrieving your vehicle',
      'bike-removed': 'E-bike removed from your trunk — trunk clean',
      ready: 'Your vehicle is ready for pickup!',
    };
    return messages[phase];
  };

  const handleBookingSubmit = () => {
    setCurrentStep('payment');
  };

  const handlePaymentSubmit = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setVerificationCode(Math.floor(1000 + Math.random() * 9000).toString());
      setIsProcessing(false);
      setCurrentStep('tracking');
    }, 2000);
  };

  const handleRequestRetrieval = () => {
    setServiceStatus({
      phase: 'retrieving',
      message: getStatusMessage('retrieving'),
      timestamp: new Date(),
    });
    setTimeout(() => {
      setServiceStatus({
        phase: 'bike-removed',
        message: getStatusMessage('bike-removed'),
        timestamp: new Date(),
      });
    }, 3500);
    setTimeout(() => {
      setServiceStatus({
        phase: 'ready',
        message: getStatusMessage('ready'),
        timestamp: new Date(),
      });
      setCurrentStep('retrieval');
    }, 5000);
  };

  const handleCompleteService = () => {
    setCurrentStep('completion');
  };

  const serviceFee = initialService.baseRate * duration;
  const addonsCost = bookingDetails.addonServices.reduce((total, addonId) => {
    const addon = ADDON_SERVICES.find(s => s.id === addonId);
    return total + (addon?.price || 0);
  }, 0);
  const platformFee = 3.5;
  const tax = (serviceFee + addonsCost + platformFee) * 0.0875;
  const totalCost = serviceFee + addonsCost + platformFee + tax;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-[#000000]"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={springConfig}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-b-2 border-white/30 backdrop-blur-xl">
          <div className="max-w-[393px] mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentStep !== 'overview' && !['tracking', 'retrieval', 'completion'].includes(currentStep) && (
                  <motion.button
                    onClick={() => {
                      const steps: FlowStep[] = ['overview', 'booking', 'payment', 'tracking', 'retrieval', 'completion'];
                      const currentIndex = steps.indexOf(currentStep);
                      if (currentIndex > 0) {
                        setCurrentStep(steps[currentIndex - 1]);
                      }
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/30 tap-target"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                )}
                <div>
                  <h2 className="text-[17px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {currentStep === 'overview' && 'Valet Service'}
                    {currentStep === 'booking' && 'Booking Details'}
                    {currentStep === 'payment' && 'Payment'}
                    {currentStep === 'tracking' && 'Active Service'}
                    {currentStep === 'retrieval' && 'Vehicle Ready'}
                    {currentStep === 'completion' && 'Service Complete'}
                  </h2>
                  <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {currentStep === 'tracking' && `Code: ${verificationCode}`}
                    {currentStep !== 'tracking' && 'Premium Valet'}
                  </p>
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

            {/* Progress Indicator */}
            {currentStep !== 'completion' && (
              <div className="mt-4 flex gap-1">
                {['overview', 'booking', 'payment', 'tracking', 'retrieval'].map((step, index) => (
                  <div
                    key={step}
                    className={`h-1 flex-1 rounded-full ${
                      ['overview', 'booking', 'payment', 'tracking', 'retrieval'].indexOf(currentStep) >= index
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                        : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {currentStep === 'overview' && (
              <OverviewStep
                service={initialService}
                duration={duration}
                setDuration={setDuration}
                serviceFee={serviceFee}
                details={bookingDetails}
                setDetails={setBookingDetails}
                onContinue={() => setCurrentStep('booking')}
                springConfig={springConfig}
                mapsLoaded={mapsLoaded}
              />
            )}

            {currentStep === 'booking' && (
              <BookingStep
                details={bookingDetails}
                setDetails={setBookingDetails}
                onContinue={handleBookingSubmit}
                springConfig={springConfig}
              />
            )}

            {currentStep === 'payment' && (
              <PaymentStep
                serviceFee={serviceFee}
                addonsCost={addonsCost}
                platformFee={platformFee}
                tax={tax}
                totalCost={totalCost}
                selectedPayment={selectedPayment}
                setSelectedPayment={setSelectedPayment}
                agreeToTerms={agreeToTerms}
                setAgreeToTerms={setAgreeToTerms}
                isProcessing={isProcessing}
                details={bookingDetails}
                onConfirm={handlePaymentSubmit}
                springConfig={springConfig}
              />
            )}

            {currentStep === 'tracking' && (
              <TrackingStep
                valet={assignedValet}
                status={serviceStatus}
                estimatedTime={estimatedTime}
                onRequestRetrieval={handleRequestRetrieval}
                springConfig={springConfig}
                mapsLoaded={mapsLoaded}
              />
            )}

            {currentStep === 'retrieval' && (
              <RetrievalStep
                valet={assignedValet}
                verificationCode={verificationCode}
                pickupLocation={bookingDetails.pickupLocation}
                onComplete={handleCompleteService}
                springConfig={springConfig}
              />
            )}

            {currentStep === 'completion' && (
              <CompletionStep
                valet={assignedValet}
                totalCost={totalCost}
                duration={duration}
                rating={rating}
                setRating={setRating}
                review={review}
                setReview={setReview}
                onClose={onClose}
                springConfig={springConfig}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Step 1: Service Overview
function OverviewStep({ service, duration, setDuration, serviceFee, onContinue, springConfig, details, setDetails, mapsLoaded }: any) {
  const toggleAddon = (addonId: string) => {
    setDetails((prev: BookingDetails) => ({
      ...prev,
      addonServices: prev.addonServices.includes(addonId)
        ? prev.addonServices.filter(id => id !== addonId)
        : [...prev.addonServices, addonId]
    }));
  };

  const selectedAddonsCost = details.addonServices.reduce((total: number, addonId: string) => {
    const addon = ADDON_SERVICES.find(s => s.id === addonId);
    return total + (addon?.price || 0);
  }, 0);

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Valet Profile */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-2 border-purple-400/40">
        <div className="flex items-start gap-3 mb-4">
          <img
            src={service.photo}
            alt={service.name}
            className="w-16 h-16 rounded-full border-2 border-white/30"
          />
          <div className="flex-1">
            <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
              {service.name}
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                  {service.rating}
                </span>
              </div>
              <span className="text-white/50">•</span>
              <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                {service.totalServices}+ services
              </span>
            </div>
            <p className="text-[13px] text-white/90" style={{ fontWeight: 400 }}>
              {service.bio}
            </p>
          </div>
        </div>

        {/* Certifications */}
        {service.certifications && service.certifications.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {service.certifications.map((cert: string) => (
              <div
                key={cert}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/30"
              >
                <Shield className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] text-white" style={{ fontWeight: 600 }}>
                  {cert}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service Area Map */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
          Service Area
        </h3>
        <div className="w-full h-48 rounded-[12px] overflow-hidden bg-gray-800 mb-3 relative">
          {mapsLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={{ lat: 33.7756, lng: -84.3963 }}
              zoom={13}
              options={{ disableDefaultUI: true, styles: VALET_DARK_STYLES, gestureHandling: 'cooperative' }}
            >
              <MarkerF position={{ lat: 33.7756, lng: -84.3963 }} />
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <MapPin className="w-6 h-6 text-white/40" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-[13px] text-white/70">
          <MapPin className="w-4 h-4" />
          <span style={{ fontWeight: 500 }}>{service.serviceArea}</span>
        </div>
      </div>

      {/* Duration & Pricing */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
            Service Duration
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
              {duration} {duration === 1 ? 'hour' : 'hours'}
            </span>
          </div>
        </div>
        
        <input
          type="range"
          min="0.5"
          max="8"
          step="0.5"
          value={duration}
          onChange={(e) => setDuration(parseFloat(e.target.value))}
          className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-pink-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white mb-2"
        />
        
        <div className="flex items-center justify-between text-[13px] text-white/70 mb-4" style={{ fontWeight: 500 }}>
          <span>30 min</span>
          <span>8 hours</span>
        </div>

        <div className="p-3 rounded-[12px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-400/40">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
              ${service.baseRate}/hour
            </span>
            <div className="text-right">
              <div className="text-[13px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
                Estimated Total
              </div>
              <div className="text-[24px] text-white" style={{ fontWeight: 700 }}>
                ${serviceFee.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Response Time */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
              Fast Response Time
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              Average pickup: {service.responseTime}
            </div>
          </div>
        </div>
      </div>

      {/* Legal Notice - Independent Contractor */}
      <div className="p-3 rounded-[12px] bg-yellow-500/10 border border-yellow-400/30">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
          <div>
            <p className="text-[11px] text-yellow-300 mb-1" style={{ fontWeight: 600 }}>
              Independent Service Provider
            </p>
            <p className="text-[11px] text-yellow-200/80 mb-2" style={{ fontWeight: 400 }}>
              Valet services are provided by verified independent contractors, not Bytspot employees. Service providers maintain their own commercial insurance and operate autonomous businesses.
            </p>
            <p className="text-[10px] text-yellow-200/60 italic" style={{ fontWeight: 400 }}>
              Photo verification required. Bytspot is a platform only - not liable for service provider actions.
            </p>
          </div>
        </div>
      </div>

      {/* Add-on Services */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Add-on Services
            </h3>
          </div>
          {details.addonServices.length > 0 && (
            <div className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/50">
              <span className="text-[11px] text-purple-300" style={{ fontWeight: 600 }}>
                {details.addonServices.length} selected
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {ADDON_SERVICES.map((addon) => {
            const Icon = addon.icon;
            const isSelected = details.addonServices.includes(addon.id);
            
            return (
              <motion.button
                key={addon.id}
                onClick={() => toggleAddon(addon.id)}
                className={`w-full p-3 rounded-[12px] border-2 text-left transition-all ${
                  isSelected
                    ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-400/50'
                    : 'bg-[#2C2C2E]/60 border-white/20 hover:border-white/30'
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isSelected 
                      ? 'bg-purple-500/30 border-2 border-purple-400/50' 
                      : 'bg-white/10 border-2 border-white/20'
                  }`}>
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-purple-300' : 'text-white/70'}`} strokeWidth={2.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                          {addon.name}
                        </span>
                        {addon.popular && (
                          <div className="px-1.5 py-0.5 rounded bg-yellow-500/20 border border-yellow-400/40">
                            <span className="text-[9px] text-yellow-300" style={{ fontWeight: 700 }}>
                              POPULAR
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-[15px] text-green-400" style={{ fontWeight: 700 }}>
                        +${addon.price}
                      </span>
                    </div>
                    <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                      {addon.description}
                    </p>
                    <div className="flex items-center gap-2 text-[12px] text-white/60">
                      <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>{addon.duration} min</span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {selectedAddonsCost > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between text-[15px]">
              <span className="text-white/70" style={{ fontWeight: 500 }}>
                Add-ons Total
              </span>
              <span className="text-green-400" style={{ fontWeight: 700 }}>
                +${selectedAddonsCost.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Continue Button */}
      <motion.button
        onClick={onContinue}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
      >
        Continue to Booking
      </motion.button>
    </motion.div>
  );
}

// Step 2: Booking Details
function BookingStep({ details, setDetails, onContinue, springConfig }: any) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!details.firstName.trim()) newErrors.firstName = 'First name required';
    if (!details.lastName.trim()) newErrors.lastName = 'Last name required';
    if (!details.phone.trim()) newErrors.phone = 'Phone number required';
    if (!details.email.trim() || !details.email.includes('@')) newErrors.email = 'Valid email required';
    if (!details.vehicleMake.trim()) newErrors.vehicleMake = 'Vehicle make required';
    if (!details.vehicleModel.trim()) newErrors.vehicleModel = 'Vehicle model required';
    if (!details.vehicleColor.trim()) newErrors.vehicleColor = 'Vehicle color required';
    if (!details.licensePlate.trim()) newErrors.licensePlate = 'License plate required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onContinue();
    }
  };

  const updateField = (field: keyof BookingDetails, value: string) => {
    setDetails((prev: BookingDetails) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <motion.div
      key="booking"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Personal Information */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Personal Information
        </h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
                First Name *
              </label>
              <input
                type="text"
                value={details.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                  errors.firstName ? 'border-red-400' : 'border-white/30'
                } text-white text-[15px] outline-none focus:border-purple-400`}
                style={{ fontWeight: 400 }}
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
                Last Name *
              </label>
              <input
                type="text"
                value={details.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                  errors.lastName ? 'border-red-400' : 'border-white/30'
                } text-white text-[15px] outline-none focus:border-purple-400`}
                style={{ fontWeight: 400 }}
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
              Phone Number *
            </label>
            <input
              type="tel"
              value={details.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                errors.phone ? 'border-red-400' : 'border-white/30'
              } text-white text-[15px] outline-none focus:border-purple-400`}
              style={{ fontWeight: 400 }}
              placeholder="(415) 555-0123"
            />
          </div>

          <div>
            <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
              Email Address *
            </label>
            <input
              type="email"
              value={details.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                errors.email ? 'border-red-400' : 'border-white/30'
              } text-white text-[15px] outline-none focus:border-purple-400`}
              style={{ fontWeight: 400 }}
              placeholder="john@example.com"
            />
          </div>
        </div>
      </div>

      {/* Vehicle Information */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Vehicle Information
        </h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
                Make *
              </label>
              <input
                type="text"
                value={details.vehicleMake}
                onChange={(e) => updateField('vehicleMake', e.target.value)}
                className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                  errors.vehicleMake ? 'border-red-400' : 'border-white/30'
                } text-white text-[15px] outline-none focus:border-purple-400`}
                style={{ fontWeight: 400 }}
                placeholder="Tesla"
              />
            </div>
            <div>
              <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
                Model *
              </label>
              <input
                type="text"
                value={details.vehicleModel}
                onChange={(e) => updateField('vehicleModel', e.target.value)}
                className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                  errors.vehicleModel ? 'border-red-400' : 'border-white/30'
                } text-white text-[15px] outline-none focus:border-purple-400`}
                style={{ fontWeight: 400 }}
                placeholder="Model 3"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
                Year
              </label>
              <input
                type="text"
                value={details.vehicleYear}
                onChange={(e) => updateField('vehicleYear', e.target.value)}
                className="w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 border-white/30 text-white text-[15px] outline-none focus:border-purple-400"
                style={{ fontWeight: 400 }}
                placeholder="2024"
              />
            </div>
            <div>
              <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
                Color *
              </label>
              <input
                type="text"
                value={details.vehicleColor}
                onChange={(e) => updateField('vehicleColor', e.target.value)}
                className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                  errors.vehicleColor ? 'border-red-400' : 'border-white/30'
                } text-white text-[15px] outline-none focus:border-purple-400`}
                style={{ fontWeight: 400 }}
                placeholder="White"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] text-white/70 mb-1.5" style={{ fontWeight: 500 }}>
              License Plate *
            </label>
            <input
              type="text"
              value={details.licensePlate}
              onChange={(e) => updateField('licensePlate', e.target.value.toUpperCase())}
              className={`w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 ${
                errors.licensePlate ? 'border-red-400' : 'border-white/30'
              } text-white text-[15px] outline-none focus:border-purple-400 uppercase`}
              style={{ fontWeight: 600, letterSpacing: '0.1em' }}
              placeholder="ABC1234"
            />
          </div>
        </div>
      </div>

      {/* Special Instructions */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>
          Special Instructions
        </h3>
        <p className="text-[13px] text-white/70 mb-3" style={{ fontWeight: 400 }}>
          Any special requirements or notes for the valet
        </p>
        <textarea
          value={details.specialInstructions}
          onChange={(e) => updateField('specialInstructions', e.target.value)}
          maxLength={500}
          className="w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 border-white/30 text-white text-[15px] outline-none focus:border-purple-400 resize-none"
          style={{ fontWeight: 400 }}
          rows={4}
          placeholder="E.g., Parking brake is sensitive, spare key in glove box..."
        />
        <div className="text-[11px] text-white/50 text-right mt-1" style={{ fontWeight: 400 }}>
          {details.specialInstructions.length}/500
        </div>
      </div>

      {/* Pickup Location */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
          Pickup Location
        </h3>
        <div className="space-y-2">
          {['Main Entrance', 'North Parking Lot', 'Valet Stand', 'Custom Location'].map((location) => (
            <label
              key={location}
              className="flex items-center gap-3 p-3 rounded-[12px] bg-white/5 border-2 border-white/20 cursor-pointer hover:border-purple-400"
            >
              <input
                type="radio"
                name="pickup"
                checked={details.pickupLocation === location}
                onChange={() => updateField('pickupLocation', location)}
                className="w-5 h-5"
              />
              <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                {location}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Continue Button */}
      <motion.button
        onClick={handleSubmit}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
      >
        Continue to Payment
      </motion.button>
    </motion.div>
  );
}

// Step 3: Payment
function PaymentStep({ serviceFee, addonsCost, platformFee, tax, totalCost, selectedPayment, setSelectedPayment, agreeToTerms, setAgreeToTerms, isProcessing, onConfirm, springConfig, details }: any) {
  return (
    <motion.div
      key="payment"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Cost Breakdown */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-400/40">
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Cost Breakdown
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-white/70" style={{ fontWeight: 400 }}>Service Fee</span>
            <span className="text-white" style={{ fontWeight: 600 }}>${serviceFee.toFixed(2)}</span>
          </div>

          {/* Show addon services if any */}
          {details.addonServices.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-purple-300 mt-2">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span style={{ fontWeight: 600 }}>Add-on Services:</span>
              </div>
              {details.addonServices.map((addonId: string) => {
                const addon = ADDON_SERVICES.find(s => s.id === addonId);
                if (!addon) return null;
                
                return (
                  <div key={addonId} className="flex items-center justify-between text-[14px] pl-5">
                    <span className="text-white/60" style={{ fontWeight: 400 }}>{addon.name}</span>
                    <span className="text-white/90" style={{ fontWeight: 500 }}>${addon.price.toFixed(2)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between text-[15px] pl-5 pt-1 border-t border-white/10">
                <span className="text-white/70" style={{ fontWeight: 500 }}>Add-ons Subtotal</span>
                <span className="text-white" style={{ fontWeight: 600 }}>${addonsCost.toFixed(2)}</span>
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-white/70" style={{ fontWeight: 400 }}>Platform Fee</span>
            <span className="text-white" style={{ fontWeight: 600 }}>${platformFee.toFixed(2)}</span>
          </div>
          
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-white/70" style={{ fontWeight: 400 }}>Tax (8.75%)</span>
            <span className="text-white" style={{ fontWeight: 600 }}>${tax.toFixed(2)}</span>
          </div>
          
          <div className="h-px bg-white/30 my-2" />
          
          <div className="flex items-center justify-between">
            <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>Total</span>
            <span className="text-[28px] text-white" style={{ fontWeight: 700 }}>${totalCost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Payment Method
        </h3>
        
        <div className="space-y-3">
          <motion.button
            onClick={() => setSelectedPayment('card')}
            className={`w-full p-4 rounded-[12px] border-2 flex items-center justify-between ${
              selectedPayment === 'card'
                ? 'bg-purple-500/20 border-purple-400'
                : 'bg-white/5 border-white/30'
            }`}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 rounded bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  •••• 4242
                </div>
                <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  Visa
                </div>
              </div>
            </div>
            {selectedPayment === 'card' && (
              <Check className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            )}
          </motion.button>

          <motion.button
            onClick={() => setSelectedPayment('apple')}
            className={`w-full p-4 rounded-[12px] border-2 flex items-center justify-between ${
              selectedPayment === 'apple'
                ? 'bg-purple-500/20 border-purple-400'
                : 'bg-white/5 border-white/30'
            }`}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 rounded bg-black flex items-center justify-center">
                <Apple className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Apple Pay
                </div>
              </div>
            </div>
            {selectedPayment === 'apple' && (
              <Check className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            )}
          </motion.button>

          <motion.button
            onClick={() => setSelectedPayment('google')}
            className={`w-full p-4 rounded-[12px] border-2 flex items-center justify-between ${
              selectedPayment === 'google'
                ? 'bg-purple-500/20 border-purple-400'
                : 'bg-white/5 border-white/30'
            }`}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 rounded bg-white flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-gray-800" />
              </div>
              <div className="text-left">
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Google Pay
                </div>
              </div>
            </div>
            {selectedPayment === 'google' && (
              <Check className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            )}
          </motion.button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
              PCI-Compliant Security
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              Your payment information is encrypted and securely processed. We never store your full card details.
            </div>
          </div>
        </div>
      </div>

      {/* Fund Holding Notice */}
      <div className="p-4 rounded-[16px] bg-yellow-500/10 border border-yellow-400/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[15px] text-yellow-300 mb-1" style={{ fontWeight: 600 }}>
              Payment Holding Period
            </div>
            <div className="text-[13px] text-yellow-200/80" style={{ fontWeight: 400 }}>
              Service provider payment is held for 24-48 hours after service completion to allow for damage/fraud claim review. This protects both parties.
            </div>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30 space-y-3">
        <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
          Legal Agreement
        </h3>
        
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreeToTerms}
            onChange={(e) => setAgreeToTerms(e.target.checked)}
            className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
          />
          <div className="flex-1">
            <p className="text-[14px] text-white mb-2" style={{ fontWeight: 500 }}>
              I agree to the{' '}
              <span className="text-purple-400" style={{ fontWeight: 600 }}>
                Terms of Service
              </span>
              ,{' '}
              <span className="text-purple-400" style={{ fontWeight: 600 }}>
                Privacy Policy
              </span>
              , and{' '}
              <span className="text-purple-400" style={{ fontWeight: 600 }}>
                Liability Waiver
              </span>
            </p>
            <div className="text-[12px] text-white/60 space-y-1" style={{ fontWeight: 400 }}>
              <p>• Bytspot is a platform connecting users with independent service providers</p>
              <p>• Service providers are NOT employees of Bytspot</p>
              <p>• Bytspot is not liable for vehicle damage, theft, or service issues</p>
              <p>• Pre-existing damage must be documented with photos</p>
              <p>• This app is NOT intended for PII collection or sensitive data storage</p>
            </div>
          </div>
        </label>
      </div>

      {/* Confirm Button */}
      <motion.button
        onClick={onConfirm}
        disabled={!agreeToTerms || isProcessing}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target disabled:opacity-50"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: !agreeToTerms || isProcessing ? 1 : 0.98 }}
        transition={springConfig}
      >
        {isProcessing ? 'Processing...' : `Confirm & Pay $${totalCost.toFixed(2)}`}
      </motion.button>
    </motion.div>
  );
}

// Step 4: Active Service Tracking
function TrackingStep({ valet, status, estimatedTime, onRequestRetrieval, springConfig, mapsLoaded }: any) {
  const currentPhaseIndex = VALET_PHASES.findIndex(p => p.key === status.phase);

  return (
    <motion.div
      key="tracking"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Valet Info */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-2 border-purple-400/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img
              src={valet.photo}
              alt={valet.name}
              className="w-14 h-14 rounded-full border-2 border-white/30"
            />
            <div>
              <div className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                {valet.name}
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                  {valet.rating}
                </span>
                <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  • {valet.totalServices}+ services
                </span>
              </div>
            </div>
          </div>

          <motion.button
            className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-500 border-2 border-white/30 tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <Phone className="w-5 h-5 text-white" />
          </motion.button>
        </div>

        <motion.button
          className="w-full py-2.5 rounded-[12px] bg-white/10 border border-white/30 flex items-center justify-center gap-2 text-[15px] text-white"
          style={{ fontWeight: 600 }}
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <MessageCircle className="w-4 h-4" />
          Message Valet
        </motion.button>
      </div>

      {/* Live Tracking Map */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
            Live GPS Tracking
          </h3>
          <div className="flex items-center gap-1.5 text-[13px] text-cyan-400" style={{ fontWeight: 600 }}>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Zap className="w-3.5 h-3.5" />
            </motion.div>
            Updates every 30s
          </div>
        </div>
        
        <div className="w-full h-56 rounded-[12px] overflow-hidden bg-gray-800 relative">
          {mapsLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={{ lat: 33.7756, lng: -84.3963 }}
              zoom={15}
              options={{
                styles: VALET_DARK_STYLES,
                disableDefaultUI: true,
                gestureHandling: 'none',
                zoomControl: false,
              }}
            >
              {/* Simulated driver marker */}
              <MarkerF
                position={{ lat: 33.7770, lng: -84.3950 }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="%23A855F7" stroke="white" stroke-width="3"/><text x="20" y="26" text-anchor="middle" font-size="18" fill="white">🚗</text></svg>'
                  ),
                  scaledSize: new google.maps.Size(40, 40),
                  anchor: new google.maps.Point(20, 20),
                }}
              />
              {/* User pickup pin */}
              <MarkerF
                position={{ lat: 33.7740, lng: -84.3975 }}
                icon={{
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%2300BCD4" stroke="white" stroke-width="3"/><text x="16" y="22" text-anchor="middle" font-size="14" fill="white">📍</text></svg>'
                  ),
                  scaledSize: new google.maps.Size(32, 32),
                  anchor: new google.maps.Point(16, 16),
                }}
              />
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-purple-500 animate-spin" />
            </div>
          )}
          {/* Pulsing car overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-16 h-16 rounded-full bg-purple-500/90 border-4 border-white flex items-center justify-center shadow-xl"
            >
              <Car className="w-8 h-8 text-white" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Service Status */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center"
          >
            <Zap className="w-6 h-6 text-cyan-400" />
          </motion.div>
          <div className="flex-1">
            <div className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
              {status.message}
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              Updated {Math.floor((Date.now() - status.timestamp.getTime()) / 1000)}s ago
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {VALET_PHASES.map((phase, index) => {
            const Icon = phase.icon;
            const isActive = index === currentPhaseIndex;
            const isComplete = index < currentPhaseIndex;
            
            return (
              <div
                key={phase.key}
                className={`flex items-center gap-3 p-3 rounded-[12px] ${
                  isActive
                    ? 'bg-cyan-500/20 border-2 border-cyan-400'
                    : isComplete
                    ? 'bg-green-500/10 border-2 border-green-400/40'
                    : 'bg-white/5 border-2 border-white/20'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isActive
                      ? 'bg-cyan-500'
                      : isComplete
                      ? 'bg-green-500'
                      : 'bg-white/20'
                  }`}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
                  ) : (
                    <Icon className="w-4 h-4 text-white" />
                  )}
                </div>
                <span
                  className={`text-[15px] ${
                    isActive || isComplete ? 'text-white' : 'text-white/50'
                  }`}
                  style={{ fontWeight: isActive ? 600 : 500 }}
                >
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ETA */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-orange-500/10 to-red-500/10 border-2 border-orange-400/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-orange-400" />
            <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Estimated Completion
            </div>
          </div>
          <div className="text-[24px] text-white" style={{ fontWeight: 700 }}>
            {estimatedTime} min
          </div>
        </div>
      </div>

      {/* Request Retrieval Button */}
      {status.phase === 'parked' && (
        <motion.button
          onClick={onRequestRetrieval}
          className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
          style={{ fontWeight: 600 }}
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Request Vehicle Retrieval
        </motion.button>
      )}
    </motion.div>
  );
}

// Step 5: Vehicle Retrieval
function RetrievalStep({ valet, verificationCode, pickupLocation, onComplete, springConfig }: any) {
  return (
    <motion.div
      key="retrieval"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Success Message */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="flex flex-col items-center justify-center py-6"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4">
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </div>
        <h2 className="text-[24px] text-white mb-2" style={{ fontWeight: 700 }}>
          Your Vehicle is Ready!
        </h2>
        <p className="text-[15px] text-white/70 text-center" style={{ fontWeight: 400 }}>
          {valet.name} is waiting at the pickup location
        </p>
      </motion.div>

      {/* Verification Code */}
      <div className="p-6 rounded-[16px] bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-purple-400">
        <div className="text-center">
          <div className="text-[15px] text-white/70 mb-2" style={{ fontWeight: 500 }}>
            Verification Code
          </div>
          <div className="text-[56px] text-white mb-2" style={{ fontWeight: 700, letterSpacing: '0.15em', fontFamily: 'monospace' }}>
            {verificationCode}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
            Show this code to the valet
          </div>
        </div>
      </div>

      {/* Valet Contact */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
          Valet Information
        </h3>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img
              src={valet.photo}
              alt={valet.name}
              className="w-12 h-12 rounded-full border-2 border-white/30"
            />
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                {valet.name}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                {valet.phone}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button
              className="w-10 h-10 rounded-full flex items-center justify-center bg-green-500/20 border-2 border-green-400/40 tap-target"
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <Phone className="w-4 h-4 text-green-400" />
            </motion.button>
            <motion.button
              className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500/20 border-2 border-blue-400/40 tap-target"
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <MessageCircle className="w-4 h-4 text-blue-400" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Pickup Location */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
          Pickup Location
        </h3>
        <div className="flex items-start gap-3 mb-3">
          <MapPin className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
              {pickupLocation}
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              Near the main valet stand, look for the purple Bytspot sign
            </div>
          </div>
        </div>
        <motion.button
          className="w-full py-2.5 rounded-[12px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 flex items-center justify-center gap-2 text-[15px] text-white"
          style={{ fontWeight: 600 }}
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <Navigation className="w-4 h-4" />
          Get Directions
        </motion.button>
      </div>

      {/* Vehicle Photo Confirmation */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
        <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
          Vehicle Condition Photo
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="aspect-video rounded-[12px] overflow-hidden border-2 border-white/30">
            <img
              src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400"
              alt="Vehicle Front"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="aspect-video rounded-[12px] overflow-hidden border-2 border-white/30">
            <img
              src="https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400"
              alt="Vehicle Side"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-cyan-400">
          <Camera className="w-4 h-4" />
          <span style={{ fontWeight: 500 }}>
            Photos taken at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Complete Service Button */}
      <motion.button
        onClick={onComplete}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
      >
        Confirm Vehicle Received
      </motion.button>
    </motion.div>
  );
}

// Step 6: Service Completion
function CompletionStep({ valet, totalCost, duration, rating, setRating, review, setReview, onClose, springConfig }: any) {
  const [showReceipt, setShowReceipt] = useState(false);

  return (
    <motion.div
      key="completion"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="max-w-[393px] mx-auto p-4 space-y-4"
    >
      {/* Success Animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="flex flex-col items-center justify-center py-6"
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4 relative">
          <Check className="w-12 h-12 text-white" strokeWidth={3} />
          <motion.div
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 rounded-full border-4 border-green-400"
          />
        </div>
        <h2 className="text-[28px] text-white mb-2" style={{ fontWeight: 700 }}>
          Service Complete!
        </h2>
        <p className="text-[15px] text-white/70 text-center" style={{ fontWeight: 400 }}>
          Thank you for using Bytspot Valet
        </p>
      </motion.div>

      {/* Achievement Unlocked */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="p-4 rounded-[16px] bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-2 border-yellow-400/40"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="flex-1">
            <div className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
              Achievement Unlocked!
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              First Valet Service • +50 points
            </div>
          </div>
        </div>
      </motion.div>

      {/* Service Summary */}
      <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
            Service Summary
          </h3>
          <button
            onClick={() => setShowReceipt(!showReceipt)}
            className="text-[15px] text-purple-400"
            style={{ fontWeight: 600 }}
          >
            {showReceipt ? 'Hide' : 'View'} Receipt
          </button>
        </div>

        {showReceipt && (
          <div className="space-y-2 text-[15px] mb-3 pb-3 border-b-2 border-white/20">
            <div className="flex justify-between">
              <span className="text-white/70" style={{ fontWeight: 400 }}>Duration</span>
              <span className="text-white" style={{ fontWeight: 600 }}>{duration} hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70" style={{ fontWeight: 400 }}>Service Fee</span>
              <span className="text-white" style={{ fontWeight: 600 }}>${(totalCost * 0.85).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70" style={{ fontWeight: 400 }}>Platform Fee</span>
              <span className="text-white" style={{ fontWeight: 600 }}>$3.50</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70" style={{ fontWeight: 400 }}>Tax</span>
              <span className="text-white" style={{ fontWeight: 600 }}>${(totalCost * 0.0875).toFixed(2)}</span>
            </div>
            <div className="h-px bg-white/30 my-2" />
            <div className="flex justify-between">
              <span className="text-white" style={{ fontWeight: 600 }}>Total Paid</span>
              <span className="text-white" style={{ fontWeight: 700 }}>${totalCost.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <motion.button
            className="flex-1 py-2.5 rounded-[12px] bg-white/10 border border-white/30 flex items-center justify-center gap-2 text-[15px] text-white"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            <Mail className="w-4 h-4" />
            Email
          </motion.button>
          <motion.button
            className="flex-1 py-2.5 rounded-[12px] bg-white/10 border border-white/30 flex items-center justify-center gap-2 text-[15px] text-white"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            <Download className="w-4 h-4" />
            Download
          </motion.button>
        </div>
      </div>

      {/* Rate & Review */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-2 border-purple-400/40">
        <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
          How was your service?
        </h3>
        
        <div className="flex justify-center gap-3 mb-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <motion.button
              key={star}
              onClick={() => setRating(star)}
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <Star
                className={`w-10 h-10 ${
                  star <= rating
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-white/30'
                }`}
              />
            </motion.button>
          ))}
        </div>

        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder={`Tell us about your experience with ${valet.name}...`}
          className="w-full px-3 py-2.5 rounded-[12px] bg-white/10 border-2 border-white/30 text-white text-[15px] outline-none focus:border-purple-400 resize-none mb-3"
          style={{ fontWeight: 400 }}
          rows={3}
        />

        <motion.button
          className="w-full py-2.5 rounded-[12px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[15px] text-white"
          style={{ fontWeight: 600 }}
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          Submit Review
        </motion.button>
      </div>

      {/* Future Booking Incentive */}
      <div className="p-4 rounded-[16px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-400/40">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-green-400" />
          </div>
          <div className="flex-1">
            <div className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
              10% Off Next Service
            </div>
            <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              Book again within 7 days
            </div>
          </div>
        </div>
        <motion.button
          className="w-full py-2.5 rounded-[12px] bg-white/10 border border-white/30 flex items-center justify-center gap-2 text-[15px] text-white"
          style={{ fontWeight: 600 }}
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <Calendar className="w-4 h-4" />
          Book Another Service
        </motion.button>
      </div>

      {/* Done Button */}
      <motion.button
        onClick={onClose}
        className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
        style={{ fontWeight: 600 }}
        whileTap={{ scale: 0.98 }}
        transition={springConfig}
      >
        Done
      </motion.button>
    </motion.div>
  );
}
