/**
 * Mock Data - Discover Cards
 * Centralized discover card data for parking, venues, valet services, etc.
 * 
 * DYNAMIC CARD HEIGHT SYSTEM:
 * Swipe cards are designed to be minimal and clean, showing only brief information.
 * Dynamic height adjusts based on:
 * - Image/video content (photos, advertising videos from hosts)
 * - Brief description (line-clamped to 2 lines)
 * - Up to 4 feature badges (with "+X more" indicator)
 * - Vibe score (for venues)
 * 
 * DETAILED INFORMATION:
 * All extended details (amenities, hours, promotions, reviews, etc.) are shown
 * ONLY when the user taps to open the full detail view (VenueDetails, ParkingSpotDetails).
 * This keeps the swipe experience fast and focused.
 * 
 * IMPLEMENTATION:
 * - Card container: minHeight 480px, maxHeight calc(100vh - 280px)
 * - Image section: 60% height (min 320px, max 400px) for photos/videos
 * - Details section: Fixed height with minimal info
 * - Tap card → Opens full details modal with all information
 * 
 * API INTEGRATION:
 * When connecting to backend:
 * - Return image/video URLs for dynamic media display
 * - Brief fields (description, features) shown in card
 * - Extended fields (amenities, hours, promotions) shown in detail modal only
 */

export type CardType = 'parking' | 'venue' | 'valet' | 'coffee' | 'dining' | 'shopping' | 'nightlife' | 'entertainment' | 'fitness';

export interface DiscoverCard {
  id: number;
  type: CardType;
  name: string;
  image: string;
  distance: string;
  price?: string;
  rating?: number;
  availability?: string;
  spots?: number;
  features?: string[];
  vibe?: number;
  description?: string;
  location?: string;
  serviceLevel?: string;
  response?: string;
  // Additional fields that hosts can provide via API
  amenities?: string[]; // Extra amenities beyond features
  hours?: string; // Operating hours
  phoneNumber?: string; // Contact number
  website?: string; // Website URL
  verified?: boolean; // Verified host badge
  popularTimes?: string; // When it's busiest
  reviews?: number; // Number of reviews
  priceRange?: string; // Detailed price range
  promotions?: string[]; // Active promotions/deals
  // Valet-specific fields
  certifications?: string[]; // Valet certifications
  bio?: string; // Valet bio
  totalServices?: number; // Total services completed
  baseRate?: number; // Base hourly rate
  responseTime?: string; // Response time
  serviceArea?: string; // Service coverage area
  // API integration fields
  _slug?: string; // Venue slug for API lookups
  _lat?: number; // Latitude
  _lng?: number; // Longitude
}

export const discoverCards: DiscoverCard[] = [
  // Parking
  {
    id: 1,
    type: 'parking',
    name: 'Downtown Plaza Garage',
    image: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800',
    distance: '0.3 mi',
    price: '$8/hr',
    rating: 4.8,
    availability: 'Available',
    spots: 23,
    features: ['Covered', 'Security', 'EV Charging', 'Accessible'],
    description: 'Premium parking facility in the heart of downtown with state-of-the-art security and convenient access to major attractions.',
    verified: true,
    amenities: ['Car Wash', 'Valet Option', 'Mobile App', 'Monthly Passes'],
    hours: 'Open 24/7',
    popularTimes: 'Busiest 9am-11am & 5pm-7pm',
    reviews: 1247,
    promotions: ['20% off evening parking after 6pm', 'Free first hour for new users'],
  },
  {
    id: 4,
    type: 'parking',
    name: 'Union Square Center',
    image: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800',
    distance: '0.7 mi',
    price: '$6/hr',
    rating: 4.6,
    availability: 'Available',
    spots: 42,
    features: ['Covered', 'Security', 'Accessible'],
    verified: true,
    hours: '6am - Midnight',
    reviews: 892,
    amenities: ['Bike Parking', 'Restrooms', 'Attendant on Duty'],
  },
  
  // Venues
  {
    id: 2,
    type: 'venue',
    name: 'The Rooftop Lounge',
    image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
    distance: '0.5 mi',
    price: '$$$',
    rating: 4.9,
    vibe: 8.5,
    description: 'Upscale rooftop bar with stunning city views, craft cocktails, and live music every weekend',
    verified: true,
    features: ['Live Music', 'Outdoor Seating', 'Full Bar', 'Small Plates'],
    amenities: ['Heated Patio', 'Signature Cocktails', 'Premium Spirits', 'City Views', 'DJ on Weekends'],
    hours: '5pm - 2am Thu-Sat, 5pm - Midnight Sun-Wed',
    popularTimes: 'Peak crowds 9pm-midnight Fri-Sat',
    reviews: 3456,
    promotions: ['Happy Hour 5-7pm: $5 select drinks', 'Ladies Night Thursday: 50% off cocktails'],
  },
  {
    id: 5,
    type: 'venue',
    name: 'Neon District',
    image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800',
    distance: '1.2 mi',
    price: '$$',
    rating: 4.7,
    vibe: 9.2,
    description: 'Energetic nightlife hub with live DJs',
  },
  
  // Valet
  {
    id: 3,
    type: 'valet',
    name: 'Elite Valet Service',
    image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800',
    distance: '0.2 mi',
    price: '$25/hour',
    rating: 4.7,
    location: 'Entertainment District',
    description: 'Premium white-glove valet service',
    serviceLevel: 'White Glove',
    response: '< 2 minutes',
    features: ['On-site', '24/7 Service', 'Car Care'],
    verified: true,
    reviews: 342,
  },
  
  // Coffee
  {
    id: 6,
    type: 'coffee',
    name: 'Blue Bottle Coffee',
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    distance: '0.2 mi',
    price: '$$',
    rating: 4.8,
    vibe: 8.2,
    description: 'Artisan coffee roaster with specialty drinks and pastries',
    features: ['Specialty Coffee', 'Pastries', 'WiFi', 'Outdoor Seating'],
    verified: true,
    amenities: ['Pour Over Bar', 'Oat Milk', 'Vegan Options', 'Laptop Friendly'],
    hours: '7am - 7pm daily',
    popularTimes: 'Busiest 8am-10am weekdays',
    reviews: 2341,
    promotions: ['Happy Hour: 3-5pm - $1 off all drinks'],
  },
  {
    id: 7,
    type: 'coffee',
    name: 'Sightglass Coffee',
    image: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800',
    distance: '0.4 mi',
    price: '$$',
    rating: 4.7,
    vibe: 8.5,
    description: 'Local roastery with pour-over coffee and light bites',
    features: ['Local Roaster', 'Pour Over', 'Light Bites', 'Industrial Chic'],
  },
  {
    id: 8,
    type: 'coffee',
    name: 'Ritual Coffee Roasters',
    image: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800',
    distance: '0.6 mi',
    price: '$$',
    rating: 4.6,
    vibe: 7.8,
    description: 'Mission District favorite with exceptional espresso',
    features: ['Espresso', 'Organic', 'Fair Trade', 'Community Vibe'],
  },
  
  // Dining
  {
    id: 9,
    type: 'dining',
    name: 'State Bird Provisions',
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    distance: '0.8 mi',
    price: '$$$',
    rating: 4.9,
    vibe: 9.0,
    description: 'Innovative dim sum-style American cuisine',
    features: ['Fine Dining', 'Small Plates', 'Reservations Required', 'Award Winning'],
  },
  {
    id: 10,
    type: 'dining',
    name: 'Nopa',
    image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
    distance: '1.1 mi',
    price: '$$$',
    rating: 4.7,
    vibe: 8.7,
    description: 'Bustling restaurant with wood-fired cuisine',
    features: ['Wood-Fired', 'Local Ingredients', 'Full Bar', 'Late Night'],
  },
  {
    id: 11,
    type: 'dining',
    name: 'Zuni Café',
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    distance: '0.5 mi',
    price: '$$$',
    rating: 4.6,
    vibe: 8.3,
    description: 'Iconic SF restaurant famous for roasted chicken',
    features: ['Roasted Chicken', 'Wine Bar', 'Historic', 'Market Street'],
  },
  
  // Shopping
  {
    id: 12,
    type: 'shopping',
    name: 'Westfield San Francisco Centre',
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
    distance: '0.3 mi',
    price: '$$$',
    rating: 4.5,
    vibe: 7.5,
    description: 'Multi-level shopping center with major retailers',
    features: ['Major Brands', 'Food Court', 'Department Stores', 'Parking'],
  },
  {
    id: 13,
    type: 'shopping',
    name: 'Union Square',
    image: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800',
    distance: '0.5 mi',
    price: '$$$$',
    rating: 4.7,
    vibe: 8.8,
    description: 'Premier shopping district with luxury brands',
    features: ['Luxury Shopping', 'Flagship Stores', 'Public Square', 'Events'],
  },
  
  // Nightlife
  {
    id: 14,
    type: 'nightlife',
    name: 'The View Lounge',
    image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800',
    distance: '0.4 mi',
    price: '$$$',
    rating: 4.8,
    vibe: 9.3,
    description: 'Sophisticated rooftop bar with panoramic city views',
    features: ['City Views', 'Craft Cocktails', 'Dress Code', 'Reservations'],
  },
  {
    id: 15,
    type: 'nightlife',
    name: 'Trick Dog',
    image: 'https://images.unsplash.com/photo-1436262513933-a0b06755c784?w=800',
    distance: '1.2 mi',
    price: '$$',
    rating: 4.9,
    vibe: 9.5,
    description: 'Creative cocktail bar with seasonal menus',
    features: ['Craft Cocktails', 'Seasonal Menu', 'Mission District', 'Award Winning'],
  },
  
  // Entertainment
  {
    id: 16,
    type: 'entertainment',
    name: 'AMC Metreon 16',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800',
    distance: '0.6 mi',
    price: '$$',
    rating: 4.4,
    vibe: 7.2,
    description: 'Modern movie theater with IMAX and Dolby Cinema',
    features: ['IMAX', 'Dolby Cinema', 'Reserved Seating', 'Concessions'],
  },
  {
    id: 17,
    type: 'entertainment',
    name: 'SFMOMA',
    image: 'https://images.unsplash.com/photo-1578301978018-3005759f48f7?w=800',
    distance: '0.9 mi',
    price: '$',
    rating: 4.7,
    vibe: 8.0,
    description: 'World-class modern and contemporary art museum',
    features: ['Museum', 'Contemporary Art', 'Exhibitions', 'Cafe'],
  },
  
  // Fitness
  {
    id: 18,
    type: 'fitness',
    name: 'Equinox SOMA',
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
    distance: '0.5 mi',
    price: '$$$',
    rating: 4.6,
    vibe: 8.4,
    description: 'Premium fitness club with spa and classes',
    features: ['Spa', 'Group Classes', 'Personal Training', 'Pool'],
  },
  {
    id: 19,
    type: 'fitness',
    name: 'CorePower Yoga',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
    distance: '0.3 mi',
    price: '$$',
    rating: 4.7,
    vibe: 8.1,
    description: 'Energizing yoga studio with multiple class styles',
    features: ['Hot Yoga', 'Vinyasa', 'Sculpt', 'Beginner Friendly'],
  },
];
