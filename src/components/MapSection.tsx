import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Navigation, Plus, Minus, Target, Car, Star,
  Zap, Shield, DollarSign, Camera, Umbrella, Filter, X,
  ChevronDown, Battery, Leaf, Home, ShieldAlert
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { MapFunction, MapViewMode } from './MapMenuSlideUp';
import { toast } from 'sonner@2.0.3';
import { ParkingSpotDetails } from './ParkingSpotDetails';
import { TrafficIntelligencePanel } from './TrafficIntelligencePanel';
import { MapIntelligenceOverlays } from './MapIntelligenceOverlays';
import { useVenues } from '../utils/hooks/useVenues';

interface MapSectionProps {
  isDarkMode: boolean;
  selectedFunction?: MapFunction;
  viewMode?: MapViewMode;
  destination?: string;
  onBackToHome?: () => void;
}

type AvailabilityStatus = 'available' | 'limited' | 'full';
type SecurityLevel = 'basic' | 'standard' | 'premium';
type EVConnectorType = 'tesla' | 'ccs' | 'chademo' | 'j1772';

interface ParkingSpot {
  id: number;
  lat: number;
  lng: number;
  name: string;
  available: number;
  total: number;
  price: number; // price per hour in dollars
  isPremium: boolean;
  hasEVCharging: boolean;
  evConnectorTypes?: EVConnectorType[];
  isCovered: boolean;
  securityLevel: SecurityLevel;
  hasCameras: boolean;
  isReserved: boolean; // user has reserved this spot
}

interface Venue {
  id: number;
  lat: number;
  lng: number;
  name: string;
  type: string;
  rating: number;
}

interface FilterState {
  priceRange: [number, number]; // min, max price per hour
  securityLevel: SecurityLevel[];
  evChargingOnly: boolean;
  coveredOnly: boolean;
  showPremiumOnly: boolean;
}

// Sample data with enhanced properties
const SAMPLE_PARKING: ParkingSpot[] = [
  { 
    id: 1, lat: 37.7749, lng: -122.4194, name: 'Downtown Plaza Parking', 
    available: 24, total: 50, price: 8, isPremium: true, 
    hasEVCharging: true, evConnectorTypes: ['tesla', 'ccs'], 
    isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false,
    rating: 4.8, reviews: 234, distance: 0.3, walkTime: 4,
    address: '450 Market Street, San Francisco, CA 94102',
    hours: '24/7 Access',
    description: 'Premium covered parking in the heart of downtown SF. Features Tesla Superchargers, 24/7 security surveillance, and direct elevator access to the plaza. Perfect for shopping, dining, and business meetings.',
    amenities: ['24/7 Security Guard', 'Elevator Access', 'Well Lit', 'Wheelchair Accessible', 'Credit Card Accepted', 'Height Clearance 7ft', 'Mobile App Access', 'Valet Available'],
    hostName: 'Downtown Parking Co.',
    responseTime: 'Usually responds within 5 minutes'
  },
  { 
    id: 2, lat: 37.7779, lng: -122.4164, name: 'Central Station Garage', 
    available: 4, total: 20, price: 6, isPremium: false, 
    hasEVCharging: false, isCovered: false, securityLevel: 'standard', 
    hasCameras: true, isReserved: false,
    rating: 4.3, reviews: 87, distance: 0.5, walkTime: 7,
    address: '825 Mission Street, San Francisco, CA 94103',
    hours: '6 AM - 11 PM',
    description: 'Convenient open-air parking near the Central Station transit hub. Easy access to BART, Muni, and Caltrain. Security cameras throughout the facility.',
    amenities: ['Security Cameras', 'Transit Access', 'Well Lit', 'Credit Card Accepted', 'Height Clearance 8ft', 'Online Booking'],
    hostName: 'Central Parking Solutions',
    responseTime: 'Usually responds within 15 minutes'
  },
  { 
    id: 3, lat: 37.7719, lng: -122.4224, name: 'Bay Area Mall Parking', 
    available: 42, total: 100, price: 5, isPremium: false, 
    hasEVCharging: true, evConnectorTypes: ['j1772'], isCovered: true, 
    securityLevel: 'standard', hasCameras: true, isReserved: false,
    rating: 4.6, reviews: 456, distance: 0.8, walkTime: 11,
    address: '865 Market Street, San Francisco, CA 94103',
    hours: '24/7 Access',
    description: 'Large covered parking structure serving Bay Area Mall. Features Level 2 EV charging stations and validation for mall shoppers. Multiple entry/exit points for easy access.',
    amenities: ['Mall Validation', 'EV Charging L2', 'Covered', 'Security Cameras', 'Wheelchair Accessible', 'Family Parking', 'Height Clearance 7.5ft', 'Restrooms'],
    hostName: 'Bay Area Parking Group',
    responseTime: 'Usually responds within 10 minutes'
  },
  { 
    id: 4, lat: 37.7739, lng: -122.4144, name: 'Tech Hub Premium Garage', 
    available: 0, total: 30, price: 10, isPremium: true, 
    hasEVCharging: true, evConnectorTypes: ['tesla', 'ccs', 'chademo'], 
    isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false,
    rating: 4.9, reviews: 312, distance: 0.4, walkTime: 5,
    address: '555 California Street, San Francisco, CA 94104',
    hours: '24/7 Access',
    description: 'State-of-the-art parking facility serving the Financial District tech corridor. All three major EV charging standards available. Premium security with 24/7 guards and advanced surveillance.',
    amenities: ['Tesla Supercharger', 'CCS Fast Charging', 'CHAdeMO', '24/7 Security Guard', 'Covered', 'Reserved Spots Available', 'Concierge Service', 'Car Wash'],
    hostName: 'Elite Parking Services',
    responseTime: 'Usually responds within 2 minutes'
  },
  { 
    id: 5, lat: 37.7789, lng: -122.4134, name: 'Union Square Premium', 
    available: 18, total: 40, price: 12, isPremium: true, 
    hasEVCharging: true, evConnectorTypes: ['tesla'], isCovered: false, 
    securityLevel: 'premium', hasCameras: true, isReserved: true,
    rating: 4.7, reviews: 189, distance: 0.6, walkTime: 8,
    address: '333 Post Street, San Francisco, CA 94108',
    hours: '24/7 Access',
    description: 'Premium parking in the heart of Union Square shopping district. Tesla Superchargers available. Direct access to luxury shopping, restaurants, and hotels.',
    amenities: ['Tesla Supercharger', 'Valet Service', 'Security Cameras', '24/7 Guard', 'Well Lit', 'Luxury Car Section', 'Credit Card Only', 'Mobile App'],
    hostName: 'Union Square Parking',
    responseTime: 'Usually responds within 3 minutes'
  },
  { 
    id: 6, lat: 37.7709, lng: -122.4154, name: 'Market Street Economy', 
    available: 8, total: 25, price: 7, isPremium: false, 
    hasEVCharging: false, isCovered: false, securityLevel: 'basic', 
    hasCameras: false, isReserved: false,
    rating: 3.9, reviews: 52, distance: 0.5, walkTime: 7,
    address: '1355 Market Street, San Francisco, CA 94103',
    hours: '7 AM - 10 PM',
    description: 'Affordable outdoor parking lot on Market Street. Basic amenities, cash and card accepted. Good for daytime parking.',
    amenities: ['Cash Accepted', 'Card Accepted', 'Attendant On Site', 'Height Clearance 9ft'],
    hostName: 'Quick Park LLC',
    responseTime: 'Usually responds within 30 minutes'
  },
  { 
    id: 7, lat: 37.7769, lng: -122.4214, name: 'Financial District Tower', 
    available: 35, total: 80, price: 15, isPremium: true, 
    hasEVCharging: true, evConnectorTypes: ['tesla', 'ccs'], 
    isCovered: true, securityLevel: 'premium', hasCameras: true, isReserved: false,
    rating: 4.9, reviews: 521, distance: 0.7, walkTime: 9,
    address: '101 California Street, San Francisco, CA 94111',
    hours: '24/7 Access',
    description: 'Exclusive underground parking in prestigious Financial District high-rise. Climate controlled, with dedicated EV charging section. Monthly and corporate accounts available.',
    amenities: ['Tesla Supercharger', 'CCS Fast Charging', 'Climate Controlled', '24/7 Concierge', 'Car Detailing', 'Reserved Spots', 'Corporate Accounts', 'Valet'],
    hostName: 'Prestige Parking Management',
    responseTime: 'Usually responds within 1 minute'
  },
  { 
    id: 8, lat: 37.7729, lng: -122.4174, name: 'Civic Center Public Parking', 
    available: 12, total: 35, price: 6, isPremium: false, 
    hasEVCharging: false, isCovered: false, securityLevel: 'standard', 
    hasCameras: true, isReserved: false,
    rating: 4.2, reviews: 143, distance: 0.4, walkTime: 6,
    address: '355 McAllister Street, San Francisco, CA 94102',
    hours: '24/7 Access',
    description: 'Public parking facility serving Civic Center area. Close to City Hall, libraries, and cultural venues. Security cameras and regular patrols.',
    amenities: ['Security Cameras', 'Well Lit', 'Wheelchair Accessible', 'Credit Card Accepted', 'Height Clearance 7ft', 'Event Parking'],
    hostName: 'SF City Parking',
    responseTime: 'Usually responds within 20 minutes'
  },
];

// SAMPLE_VENUES removed — populated from API below

export function MapSection({ isDarkMode, selectedFunction, viewMode = 'standard', destination, onBackToHome }: MapSectionProps) {
  // Atlanta Midtown center
  const [zoomLevel, setZoomLevel] = useState(14);
  const [centerLat, setCenterLat] = useState(33.7866);
  const [centerLng, setCenterLng] = useState(-84.3833);

  // Live venue data from API
  const { venues: apiVenues } = useVenues();

  // Derive map venues from API data
  const mapVenues: Venue[] = apiVenues.map((v, i) => ({
    id: i + 100,
    lat: v.lat,
    lng: v.lng,
    name: v.name,
    type: v.category,
    rating: 4.5 + Math.random() * 0.5,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [showParkingSpots, setShowParkingSpots] = useState(true);
  const [showVenues, setShowVenues] = useState(true);
  const [parkingData, setParkingData] = useState<ParkingSpot[]>(SAMPLE_PARKING);
  const [showFilters, setShowFilters] = useState(false);
  const [showDistanceRadius, setShowDistanceRadius] = useState(false);
  const [distanceRadius, setDistanceRadius] = useState(0.5); // miles
  const [showPriceHeatmap, setShowPriceHeatmap] = useState(false);
  const [showSecurityOverlay, setShowSecurityOverlay] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [showSpotDetails, setShowSpotDetails] = useState(false);
  const [routeDestination, setRouteDestination] = useState<string>(destination || '');
  const [showTrafficIntel, setShowTrafficIntel] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, 20],
    securityLevel: ['basic', 'standard', 'premium'],
    evChargingOnly: false,
    coveredOnly: false,
    showPremiumOnly: false,
  });
  
  const mapRef = useRef<HTMLDivElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Update route destination when prop changes
  useEffect(() => {
    if (destination) {
      setRouteDestination(destination);
      // Show a toast notification
      toast.success('Route Planning', {
        description: `Setting destination to ${destination}`,
        duration: 2000,
      });
    }
  }, [destination]);

  // Handle map function activations
  useEffect(() => {
    if (selectedFunction === 'traffic-intelligence') {
      setShowTrafficIntel(true);
      toast.success('Traffic Intelligence Active', {
        description: 'Real-time alerts for police, accidents & hazards',
        duration: 2000,
      });
    } else if (selectedFunction === 'trending-hotspots') {
      toast.success('Trending Hotspots', {
        description: 'Showing real-time popular spots and events',
        duration: 2000,
      });
    } else if (selectedFunction === 'live-venue-data') {
      toast.success('Live Venue Data', {
        description: 'Real-time crowd levels and wait times',
        duration: 2000,
      });
    } else if (selectedFunction === 'smart-parking') {
      toast.success('Smart Parking Mode', {
        description: 'Enhanced parking spot analysis active',
        duration: 2000,
      });
    } else if (selectedFunction === 'ai-navigation') {
      toast.success('AI Navigation Premium', {
        description: 'Optimized routing with traffic prediction',
        duration: 2000,
      });
    } else if (selectedFunction === 'spot-radar') {
      toast.success('Spot Radar Active', {
        description: 'Discovering hidden gems near you',
        duration: 2000,
      });
    }
  }, [selectedFunction]);

  // Simulate WebSocket live updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setParkingData(prev => prev.map(spot => ({
        ...spot,
        available: Math.max(0, Math.min(spot.total, spot.available + Math.floor(Math.random() * 7) - 3)),
      })));
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Calculate availability status
  const getAvailabilityStatus = (spot: ParkingSpot): AvailabilityStatus => {
    const percentage = (spot.available / spot.total) * 100;
    if (percentage === 0) return 'full';
    if (percentage < 25) return 'limited';
    return 'available';
  };

  // Get color based on availability
  const getAvailabilityColor = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available': return { primary: '#10B981', glow: 'rgba(16, 185, 129, 0.4)' };
      case 'limited': return { primary: '#F59E0B', glow: 'rgba(245, 158, 11, 0.4)' };
      case 'full': return { primary: '#EF4444', glow: 'rgba(239, 68, 68, 0.4)' };
    }
  };

  // Filter parking spots based on filter state
  const filteredParkingSpots = parkingData.filter(spot => {
    if (spot.price < filters.priceRange[0] || spot.price > filters.priceRange[1]) return false;
    if (!filters.securityLevel.includes(spot.securityLevel)) return false;
    if (filters.evChargingOnly && !spot.hasEVCharging) return false;
    if (filters.coveredOnly && !spot.isCovered) return false;
    if (filters.showPremiumOnly && !spot.isPremium) return false;
    return true;
  });

  // Convert lat/lng to screen coordinates
  const latLngToScreen = (lat: number, lng: number) => {
    const scale = Math.pow(2, zoomLevel - 10);
    const x = ((lng - centerLng) * scale * 1000) + mapOffset.x;
    const y = ((centerLat - lat) * scale * 1000) + mapOffset.y;
    return { x, y };
  };

  // Calculate zoom scale for visual elements
  const getZoomScale = () => {
    return Math.pow(1.4, zoomLevel - 14);
  };

  const zoomScale = getZoomScale();

  // Calculate distance radius in pixels
  const getRadiusInPixels = (miles: number) => {
    // Approximate: 1 degree latitude ≈ 69 miles
    const scale = Math.pow(2, zoomLevel - 10);
    return (miles / 69) * scale * 1000;
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 1, 20));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 1, 10));
  };

  const handleRecenter = () => {
    setCenterLat(37.7749);
    setCenterLng(-122.4194);
    setMapOffset({ x: 0, y: 0 });
    setZoomLevel(14);
  };

  // Touch/Mouse drag handling
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - mapOffset.x, y: clientY - mapOffset.y });
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setMapOffset({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y,
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Get price heat map color
  const getPriceHeatColor = (price: number) => {
    // Price range: $5-$15, mapped to green->yellow->red
    const normalized = Math.min(Math.max((price - 5) / 10, 0), 1);
    if (normalized < 0.5) {
      // Green to Yellow
      const r = Math.floor(16 + (239 - 16) * (normalized * 2));
      const g = Math.floor(185 + (68 - 185) * (normalized * 2));
      return `rgba(${r}, ${g}, 129, 0.6)`;
    } else {
      // Yellow to Red
      const r = 239;
      const g = Math.floor(68 - (68 - 68) * ((normalized - 0.5) * 2));
      return `rgba(${r}, ${g}, 68, 0.6)`;
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Canvas */}
      <div
        ref={mapRef}
        className="absolute inset-0 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        style={{ 
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* Map Base */}
        <div className="w-full h-full relative" style={{ backgroundColor: viewMode === 'satellite' ? '#2C3E35' : '#0F0F0F' }}>
          {/* Satellite View Background */}
          {viewMode === 'satellite' && (
            <div 
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 20% 30%, rgba(34, 139, 34, 0.3) 0%, transparent 50%),
                  radial-gradient(circle at 80% 70%, rgba(70, 130, 180, 0.4) 0%, transparent 50%),
                  radial-gradient(circle at 50% 50%, rgba(139, 90, 43, 0.2) 0%, transparent 60%)
                `,
                backgroundPosition: `${mapOffset.x * 0.5}px ${mapOffset.y * 0.5}px`,
              }}
            >
              {/* Satellite texture overlay */}
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: `
                    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.01) 2px, rgba(255, 255, 255, 0.01) 4px),
                    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255, 255, 255, 0.01) 2px, rgba(255, 255, 255, 0.01) 4px)
                  `,
                  mixBlendMode: 'overlay',
                }}
              />
            </div>
          )}
          
          {/* Standard Grid Pattern Background */}
          {viewMode === 'standard' && (
            <div 
              className="absolute inset-0 w-full h-full"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                  linear-gradient(rgba(255, 255, 255, 0.06) 2px, transparent 2px),
                  linear-gradient(90deg, rgba(255, 255, 255, 0.06) 2px, transparent 2px)
                `,
                backgroundSize: `${20 * zoomScale}px ${20 * zoomScale}px, ${20 * zoomScale}px ${20 * zoomScale}px, ${80 * zoomScale}px ${80 * zoomScale}px, ${80 * zoomScale}px ${80 * zoomScale}px`,
                backgroundPosition: `${mapOffset.x}px ${mapOffset.y}px`,
              }}
            />
          )}

          {/* Main Roads */}
          <div className="absolute inset-0 w-full h-full overflow-hidden">
            {/* Vertical Roads */}
            {[
              { pos: '50%', width: 4, opacity: viewMode === 'satellite' ? 0.6 : 0.45 },
              { pos: '30%', width: 2, opacity: viewMode === 'satellite' ? 0.5 : 0.3 },
              { pos: '70%', width: 2, opacity: viewMode === 'satellite' ? 0.5 : 0.3 },
            ].map((road, i) => (
              <div 
                key={`v-road-${i}`}
                className="absolute h-full"
                style={{ 
                  left: road.pos,
                  width: `${Math.max(1, road.width * zoomScale)}px`,
                  transform: `translateX(${mapOffset.x}px)`,
                  background: viewMode === 'satellite' 
                    ? `linear-gradient(to bottom, rgba(255, 224, 178, ${road.opacity}), rgba(255, 214, 160, ${road.opacity + 0.1}), rgba(255, 224, 178, ${road.opacity}))` 
                    : `linear-gradient(to bottom, rgba(0, 191, 255, ${road.opacity - 0.05}), rgba(0, 191, 255, ${road.opacity + 0.05}), rgba(0, 191, 255, ${road.opacity - 0.05}))`,
                  boxShadow: viewMode === 'satellite' 
                    ? `0 0 ${10 * zoomScale}px rgba(255, 200, 100, ${road.opacity * 0.5})` 
                    : `0 0 ${10 * zoomScale}px rgba(0, 191, 255, ${road.opacity * 0.6})`,
                }}
              />
            ))}
            
            {/* Horizontal Roads */}
            {[
              { pos: '50%', height: 4, opacity: viewMode === 'satellite' ? 0.6 : 0.45 },
              { pos: '30%', height: 2, opacity: viewMode === 'satellite' ? 0.5 : 0.3 },
              { pos: '70%', height: 2, opacity: viewMode === 'satellite' ? 0.5 : 0.3 },
            ].map((road, i) => (
              <div 
                key={`h-road-${i}`}
                className="absolute w-full"
                style={{ 
                  top: road.pos,
                  height: `${Math.max(1, road.height * zoomScale)}px`,
                  transform: `translateY(${mapOffset.y}px)`,
                  background: viewMode === 'satellite' 
                    ? `linear-gradient(to right, rgba(255, 224, 178, ${road.opacity}), rgba(255, 214, 160, ${road.opacity + 0.1}), rgba(255, 224, 178, ${road.opacity}))` 
                    : `linear-gradient(to right, rgba(0, 191, 255, ${road.opacity - 0.05}), rgba(0, 191, 255, ${road.opacity + 0.05}), rgba(0, 191, 255, ${road.opacity - 0.05}))`,
                  boxShadow: viewMode === 'satellite' 
                    ? `0 0 ${10 * zoomScale}px rgba(255, 200, 100, ${road.opacity * 0.5})` 
                    : `0 0 ${10 * zoomScale}px rgba(0, 191, 255, ${road.opacity * 0.6})`,
                }}
              />
            ))}
          </div>

          {/* Distance Radius Visualization */}
          {showDistanceRadius && (
            <div 
              className="absolute rounded-full border-2 border-dashed pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                width: `${getRadiusInPixels(distanceRadius) * 2}px`,
                height: `${getRadiusInPixels(distanceRadius) * 2}px`,
                transform: 'translate(-50%, -50%)',
                borderColor: 'rgba(168, 85, 247, 0.6)',
                background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
              }}
            >
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-purple-500/90 backdrop-blur-sm">
                <span className="text-[11px] text-white" style={{ fontWeight: 600 }}>
                  {distanceRadius} mi radius
                </span>
              </div>
            </div>
          )}

          {/* Security Camera Coverage Overlay */}
          {showSecurityOverlay && filteredParkingSpots.map(spot => {
            if (!spot.hasCameras) return null;
            const { x, y } = latLngToScreen(spot.lat, spot.lng);
            
            return (
              <motion.div
                key={`security-${spot.id}`}
                className="absolute pointer-events-none"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 0.3, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
              >
                <div 
                  className="rounded-full"
                  style={{
                    width: `${80 * Math.min(zoomScale, 1.5)}px`,
                    height: `${80 * Math.min(zoomScale, 1.5)}px`,
                    background: 'radial-gradient(circle, rgba(96, 165, 250, 0.3) 0%, transparent 70%)',
                  }}
                />
              </motion.div>
            );
          })}

          {/* Price Heat Map Overlay */}
          {showPriceHeatmap && filteredParkingSpots.map(spot => {
            const { x, y } = latLngToScreen(spot.lat, spot.lng);
            
            return (
              <motion.div
                key={`heatmap-${spot.id}`}
                className="absolute pointer-events-none rounded-full blur-2xl"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  transform: 'translate(-50%, -50%)',
                  width: `${120 * Math.min(zoomScale, 1.5)}px`,
                  height: `${120 * Math.min(zoomScale, 1.5)}px`,
                  background: getPriceHeatColor(spot.price),
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            );
          })}

          {/* Parking Spots */}
          <AnimatePresence>
            {showParkingSpots && filteredParkingSpots.map((spot) => {
              const { x, y } = latLngToScreen(spot.lat, spot.lng);
              const status = getAvailabilityStatus(spot);
              const colors = getAvailabilityColor(status);
              const isSelected = selectedSpot === spot.id;
              
              return (
                <motion.div
                  key={`parking-${spot.id}`}
                  className="absolute"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isSelected ? 30 : spot.isPremium ? 20 : 10,
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={springConfig}
                >
                  <div 
                    className="relative group cursor-pointer" 
                    onClick={() => {
                      setSelectedSpot(spot.id);
                      setShowSpotDetails(true);
                    }}
                  >
                    {/* Premium Spotlight Effect */}
                    {spot.isPremium && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{
                          width: `${60 * Math.min(zoomScale, 1.5)}px`,
                          height: `${60 * Math.min(zoomScale, 1.5)}px`,
                        }}
                        animate={{ 
                          scale: [1, 1.2, 1],
                          opacity: [0.3, 0.5, 0.3],
                        }}
                        transition={{ duration: 3, repeat: Infinity }}
                      >
                        <div 
                          className="w-full h-full rounded-full"
                          style={{
                            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)',
                          }}
                        />
                      </motion.div>
                    )}

                    {/* Pulse Effect */}
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{
                        width: `${48 * Math.min(zoomScale, 1.5)}px`,
                        height: `${48 * Math.min(zoomScale, 1.5)}px`,
                        backgroundColor: colors.primary,
                      }}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    
                    {/* Main Marker */}
                    <div 
                      className="rounded-full flex items-center justify-center shadow-2xl relative"
                      style={{
                        width: `${40 * Math.min(zoomScale, 1.5)}px`,
                        height: `${40 * Math.min(zoomScale, 1.5)}px`,
                        backgroundColor: colors.primary,
                        border: `${3 * Math.min(zoomScale, 1.5)}px solid ${spot.isPremium ? '#A855F7' : 'white'}`,
                        boxShadow: `0 0 ${20 * Math.min(zoomScale, 1.5)}px ${colors.glow}`,
                      }}
                    >
                      <Car 
                        className="text-white" 
                        strokeWidth={2.5}
                        style={{
                          width: `${20 * Math.min(zoomScale, 1.5)}px`,
                          height: `${20 * Math.min(zoomScale, 1.5)}px`,
                        }}
                      />

                      {/* Reserved Indicator */}
                      {spot.isReserved && (
                        <div 
                          className="absolute -top-1 -right-1 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center"
                          style={{
                            width: `${16 * Math.min(zoomScale, 1.5)}px`,
                            height: `${16 * Math.min(zoomScale, 1.5)}px`,
                          }}
                        >
                          <Star 
                            className="text-white fill-white" 
                            strokeWidth={2}
                            style={{
                              width: `${10 * Math.min(zoomScale, 1.5)}px`,
                              height: `${10 * Math.min(zoomScale, 1.5)}px`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Feature Badges */}
                    <div 
                      className="absolute flex gap-0.5"
                      style={{
                        top: `${-8 * Math.min(zoomScale, 1.5)}px`,
                        left: '50%',
                        transform: 'translateX(-50%)',
                      }}
                    >
                      {spot.hasEVCharging && (
                        <div 
                          className="rounded-full bg-green-500 border border-white flex items-center justify-center"
                          style={{
                            width: `${14 * Math.min(zoomScale, 1.5)}px`,
                            height: `${14 * Math.min(zoomScale, 1.5)}px`,
                          }}
                        >
                          <Zap 
                            className="text-white fill-white" 
                            strokeWidth={2}
                            style={{
                              width: `${8 * Math.min(zoomScale, 1.5)}px`,
                              height: `${8 * Math.min(zoomScale, 1.5)}px`,
                            }}
                          />
                        </div>
                      )}
                      {spot.isCovered && (
                        <div 
                          className="rounded-full bg-blue-500 border border-white flex items-center justify-center"
                          style={{
                            width: `${14 * Math.min(zoomScale, 1.5)}px`,
                            height: `${14 * Math.min(zoomScale, 1.5)}px`,
                          }}
                        >
                          <Umbrella 
                            className="text-white" 
                            strokeWidth={2}
                            style={{
                              width: `${8 * Math.min(zoomScale, 1.5)}px`,
                              height: `${8 * Math.min(zoomScale, 1.5)}px`,
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Info Card on Hover/Select */}
                    <AnimatePresence>
                      {(isSelected || zoomLevel >= 15) && (
                        <motion.div
                          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                          style={{
                            bottom: `${48 * Math.min(zoomScale, 1.5)}px`,
                          }}
                          initial={{ opacity: 0, y: 10, scale: 0.8 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.8 }}
                          transition={springConfig}
                        >
                          <div className="px-3 py-2 rounded-[12px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-2xl">
                            <div className="text-[13px] text-white mb-1" style={{ fontWeight: 600 }}>
                              {spot.name}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span 
                                className="text-white"
                                style={{ 
                                  fontWeight: 600,
                                  color: colors.primary,
                                }}
                              >
                                {spot.available}/{spot.total} spots
                              </span>
                              <span className="text-white/70">•</span>
                              <span className="text-white/90" style={{ fontWeight: 500 }}>
                                ${spot.price}/hr
                              </span>
                              {spot.securityLevel === 'premium' && (
                                <>
                                  <span className="text-white/70">•</span>
                                  <Shield className="w-3 h-3 text-purple-400" />
                                </>
                              )}
                            </div>
                          </div>
                          {/* Arrow */}
                          <div 
                            className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
                            style={{
                              bottom: '-6px',
                              borderLeft: '6px solid transparent',
                              borderRight: '6px solid transparent',
                              borderTop: '6px solid rgba(28, 28, 30, 0.95)',
                            }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Venues */}
          <AnimatePresence>
            {showVenues && !selectedFunction && mapVenues.map((venue) => {
              const { x, y } = latLngToScreen(venue.lat, venue.lng);
              
              return (
                <motion.div
                  key={`venue-${venue.id}`}
                  className="absolute"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 5,
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={springConfig}
                >
                  <div className="relative group cursor-pointer">
                    <div 
                      className="rounded-full bg-gradient-to-br from-orange-500 to-pink-500 border-2 border-white flex items-center justify-center shadow-xl"
                      style={{
                        width: `${32 * Math.min(zoomScale, 1.5)}px`,
                        height: `${32 * Math.min(zoomScale, 1.5)}px`,
                      }}
                    >
                      <Star 
                        className="text-white fill-white" 
                        strokeWidth={2}
                        style={{
                          width: `${16 * Math.min(zoomScale, 1.5)}px`,
                          height: `${16 * Math.min(zoomScale, 1.5)}px`,
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Map Intelligence Overlays (Trending, Live Venue, Spot Radar, etc.) */}
          <MapIntelligenceOverlays
            activeFunction={selectedFunction}
            isDarkMode={isDarkMode}
            zoomScale={zoomScale}
            latLngToScreen={latLngToScreen}
          />

          {/* Current Location - Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ zIndex: 40 }}>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div 
                className="rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 border-4 border-white flex items-center justify-center shadow-2xl"
                style={{
                  width: `${64 * Math.min(zoomScale, 1.5)}px`,
                  height: `${64 * Math.min(zoomScale, 1.5)}px`,
                }}
              >
                <Navigation 
                  className="text-white" 
                  strokeWidth={2.5}
                  style={{
                    width: `${32 * Math.min(zoomScale, 1.5)}px`,
                    height: `${32 * Math.min(zoomScale, 1.5)}px`,
                  }}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-50">
        {/* Zoom Controls */}
        <motion.button
          onClick={handleZoomIn}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        
        <motion.button
          onClick={handleZoomOut}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Minus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        
        <motion.button
          onClick={handleRecenter}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Target className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* Filter Button & Back to Home */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
        {/* Back to Home Button - Show when in route planning mode */}
        {(selectedFunction === 'route' || destination) && onBackToHome && (
          <motion.button
            onClick={onBackToHome}
            className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Home className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
        )}
        
        <motion.button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-2.5 rounded-full flex items-center gap-2 bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <Filter className="w-4 h-4 text-white" strokeWidth={2.5} />
          <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
            Filters
          </span>
          {(filters.evChargingOnly || filters.coveredOnly || filters.showPremiumOnly) && (
            <div className="w-2 h-2 rounded-full bg-purple-500" />
          )}
        </motion.button>
      </div>



      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <>
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFilters(false)}
            />

            {/* Filter Panel */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-50"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springConfig}
            >
              <div className="bg-[#1C1C1E]/95 backdrop-blur-2xl border-t-2 border-white/30 rounded-t-[28px] overflow-hidden shadow-2xl p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[20px] text-white" style={{ fontWeight: 700 }}>
                    Map Filters
                  </h3>
                  <motion.button
                    onClick={() => setShowFilters(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/30"
                    whileTap={{ scale: 0.9 }}
                  >
                    <X className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>

                {/* Quick Toggles */}
                <div className="space-y-3 mb-6">
                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-green-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        EV Charging Only
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.evChargingOnly}
                      onChange={(e) => setFilters({ ...filters, evChargingOnly: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Umbrella className="w-5 h-5 text-blue-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Covered Parking Only
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.coveredOnly}
                      onChange={(e) => setFilters({ ...filters, coveredOnly: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Star className="w-5 h-5 text-purple-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Premium Spots Only
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={filters.showPremiumOnly}
                      onChange={(e) => setFilters({ ...filters, showPremiumOnly: e.target.checked })}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>
                </div>

                {/* Price Range */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      Price Range
                    </span>
                    <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                      ${filters.priceRange[0]} - ${filters.priceRange[1]}/hr
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={filters.priceRange[1]}
                    onChange={(e) => setFilters({ ...filters, priceRange: [0, parseInt(e.target.value)] })}
                    className="w-full h-2 rounded-full bg-white/20"
                  />
                </div>

                {/* Map Overlays */}
                <div className="space-y-3 mb-6">
                  <div className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
                    Map Overlays
                  </div>
                  
                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-green-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Price Heat Map
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showPriceHeatmap}
                      onChange={(e) => setShowPriceHeatmap(e.target.checked)}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Camera className="w-5 h-5 text-blue-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Security Coverage
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showSecurityOverlay}
                      onChange={(e) => setShowSecurityOverlay(e.target.checked)}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-[14px] bg-white/5 border border-white/20 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Navigation className="w-5 h-5 text-purple-400" strokeWidth={2} />
                      <span className="text-[15px] text-white" style={{ fontWeight: 500 }}>
                        Distance Radius
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showDistanceRadius}
                      onChange={(e) => setShowDistanceRadius(e.target.checked)}
                      className="w-5 h-5 rounded bg-white/10 border-2 border-white/30"
                    />
                  </label>

                  {showDistanceRadius && (
                    <div className="pl-11">
                      <input
                        type="range"
                        min="0.1"
                        max="2"
                        step="0.1"
                        value={distanceRadius}
                        onChange={(e) => setDistanceRadius(parseFloat(e.target.value))}
                        className="w-full h-2 rounded-full bg-white/20"
                      />
                      <div className="text-[11px] text-white/70 mt-1" style={{ fontWeight: 500 }}>
                        {distanceRadius} miles
                      </div>
                    </div>
                  )}
                </div>

                {/* Apply Button */}
                <motion.button
                  onClick={() => {
                    setShowFilters(false);
                    toast.success('Filters applied', {
                      description: `Showing ${filteredParkingSpots.length} parking spots`,
                    });
                  }}
                  className="w-full py-3 rounded-[14px] bg-gradient-to-r from-purple-500 to-cyan-500 text-white"
                  style={{ fontWeight: 600 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  Apply Filters ({filteredParkingSpots.length} spots)
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Live Update Indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
        <motion.div
          className="px-3 py-1.5 rounded-full bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/30 shadow-xl flex items-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <motion.div
            className="w-2 h-2 rounded-full bg-green-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[11px] text-white/90" style={{ fontWeight: 500 }}>
            Live Updates Active
          </span>
        </motion.div>
      </div>

      {/* Route Planning Panel */}
      {selectedFunction === 'route' && (
        <motion.div 
          className="absolute bottom-4 left-4 right-4 z-50"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={springConfig}
        >
          <div className="p-4 rounded-[20px] bg-[#1C1C1E]/95 backdrop-blur-xl border-2 border-white/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-2 border-white/30 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-[17px] text-white flex-1" style={{ fontWeight: 600 }}>
                Route Planning
              </h3>
              <motion.button
                onClick={() => setRouteDestination('')}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/30"
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>
            
            {/* Destination Input */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-[14px] bg-white/10 border border-white/20">
                <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" strokeWidth={2.5} />
                <input
                  type="text"
                  value={routeDestination}
                  onChange={(e) => setRouteDestination(e.target.value)}
                  placeholder="Enter destination..."
                  className="flex-1 bg-transparent text-[15px] outline-none text-white placeholder:text-white/50"
                  style={{ fontWeight: 400 }}
                />
              </div>
              
              {routeDestination && (
                <motion.button
                  onClick={() => {
                    toast.success('Starting Navigation', {
                      description: `Calculating route to ${routeDestination}`,
                      duration: 2000,
                    });
                  }}
                  className="w-full py-3 rounded-[14px] bg-gradient-to-r from-green-500 to-emerald-500 border-2 border-white/30 shadow-lg"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Start Navigation
                  </span>
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Legend */}
      {selectedFunction !== 'route' && (
        <div className="absolute bottom-4 right-4 z-50">
          <div className="px-3 py-2 rounded-[12px] bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/30 shadow-xl">
            <div className="space-y-1.5">
              {[
                { color: '#10B981', label: 'Available' },
                { color: '#F59E0B', label: 'Limited' },
                { color: '#EF4444', label: 'Full' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[11px] text-white/90" style={{ fontWeight: 500 }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Parking Spot Details Panel */}
      <ParkingSpotDetails
        spot={selectedSpot ? parkingData.find(s => s.id === selectedSpot) || null : null}
        isOpen={showSpotDetails}
        onClose={() => {
          setShowSpotDetails(false);
          setSelectedSpot(null);
        }}
        onReserve={(spotId) => {
          setShowSpotDetails(false);
          // Navigate to reservation flow
          toast.success('Opening Reservation', {
            description: 'Starting reservation process...',
            duration: 2000,
          });
        }}
        onNavigate={(spotId) => {
          setShowSpotDetails(false);
          toast.success('Navigation Started', {
            description: 'Opening navigation app...',
            duration: 2000,
          });
        }}
        isDarkMode={isDarkMode}
      />

      {/* Traffic Intelligence Panel */}
      <TrafficIntelligencePanel
        isDarkMode={isDarkMode}
        isExpanded={showTrafficIntel || selectedFunction === 'traffic-intelligence'}
        onToggle={() => setShowTrafficIntel(!showTrafficIntel)}
      />
    </div>
  );
}
