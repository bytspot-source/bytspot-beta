// Mock data for Host Dashboard

export const mockDashboardStats = {
  totalRevenue: 24580,
  activeBookings: 8,
  totalListings: 4,
  averageRating: 4.8,
  monthlyGrowth: 18,
};

export const mockEarnings = {
  totalEarnings: 24580,
  thisMonthEarnings: 4820,
  lastMonthEarnings: 4080,
  pendingPayouts: 1240,
  chartData: [
    { date: 'Oct 1', earnings: 380 },
    { date: 'Oct 2', earnings: 420 },
    { date: 'Oct 3', earnings: 360 },
    { date: 'Oct 4', earnings: 520 },
    { date: 'Oct 5', earnings: 480 },
    { date: 'Oct 6', earnings: 560 },
    { date: 'Oct 7', earnings: 440 },
    { date: 'Oct 8', earnings: 580 },
    { date: 'Oct 9', earnings: 500 },
    { date: 'Oct 10', earnings: 580 },
  ],
  transactions: [
    {
      id: '1',
      listing: 'Downtown Garage - Spot A12',
      amount: 85,
      date: '2025-10-09T14:30:00',
      status: 'completed' as const,
    },
    {
      id: '2',
      listing: 'Bay Street Parking',
      amount: 65,
      date: '2025-10-09T10:15:00',
      status: 'completed' as const,
    },
    {
      id: '3',
      listing: 'Marina District Lot',
      amount: 95,
      date: '2025-10-08T18:45:00',
      status: 'completed' as const,
    },
    {
      id: '4',
      listing: 'Downtown Garage - Spot B5',
      amount: 75,
      date: '2025-10-08T12:20:00',
      status: 'processing' as const,
    },
    {
      id: '5',
      listing: 'Bay Street Parking',
      amount: 60,
      date: '2025-10-07T16:00:00',
      status: 'completed' as const,
    },
  ],
};

export const mockBookings = [
  {
    id: '1',
    guestName: 'Sarah Chen',
    listingTitle: 'Downtown Garage - Spot A12',
    amount: 45,
    duration: '3 hours',
    vehicle: 'Tesla Model 3',
    status: 'active' as const,
    startTime: '2025-10-10T14:00:00',
    endTime: '2025-10-10T17:00:00',
  },
  {
    id: '2',
    guestName: 'Michael Torres',
    listingTitle: 'Bay Street Parking',
    amount: 35,
    duration: '2 hours',
    vehicle: 'Honda Civic',
    status: 'active' as const,
    startTime: '2025-10-10T15:30:00',
    endTime: '2025-10-10T17:30:00',
  },
  {
    id: '3',
    guestName: 'Emma Wilson',
    listingTitle: 'Marina District Lot',
    amount: 95,
    duration: 'Full day',
    vehicle: 'BMW X5',
    status: 'upcoming' as const,
    startTime: '2025-10-11T08:00:00',
    endTime: '2025-10-11T20:00:00',
  },
  {
    id: '4',
    guestName: 'James Rodriguez',
    listingTitle: 'Downtown Garage - Spot B5',
    amount: 75,
    duration: '5 hours',
    vehicle: 'Mercedes C-Class',
    status: 'upcoming' as const,
    startTime: '2025-10-11T10:00:00',
    endTime: '2025-10-11T15:00:00',
  },
  {
    id: '5',
    guestName: 'Lisa Anderson',
    listingTitle: 'Bay Street Parking',
    amount: 60,
    duration: '4 hours',
    vehicle: 'Toyota RAV4',
    status: 'upcoming' as const,
    startTime: '2025-10-12T12:00:00',
    endTime: '2025-10-12T16:00:00',
  },
  {
    id: '6',
    guestName: 'David Kim',
    listingTitle: 'Downtown Garage - Spot A12',
    amount: 85,
    duration: '6 hours',
    vehicle: 'Audi A4',
    status: 'completed' as const,
    startTime: '2025-10-09T09:00:00',
    endTime: '2025-10-09T15:00:00',
  },
  {
    id: '7',
    guestName: 'Rachel Green',
    listingTitle: 'Marina District Lot',
    amount: 120,
    duration: 'Full day',
    vehicle: 'Porsche Cayenne',
    status: 'completed' as const,
    startTime: '2025-10-08T08:00:00',
    endTime: '2025-10-08T20:00:00',
  },
];

export const mockListings = [
  {
    id: '1',
    title: 'Downtown Garage - Spot A12',
    address: '123 Market St, San Francisco',
    type: 'garage' as const,
    pricePerHour: 15,
    pricePerDay: 85,
    rating: 4.9,
    reviewCount: 127,
    totalBookings: 342,
    activeBooking: true,
    status: 'active' as const,
    features: ['Covered', 'EV Charging', 'Security Camera', '24/7 Access'],
    photos: [
      'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800&h=600&fit=crop',
    ],
  },
  {
    id: '2',
    title: 'Bay Street Parking',
    address: '456 Bay St, San Francisco',
    type: 'lot' as const,
    pricePerHour: 12,
    pricePerDay: 65,
    rating: 4.7,
    reviewCount: 89,
    totalBookings: 256,
    activeBooking: true,
    status: 'active' as const,
    features: ['Well-lit', 'Security Patrol', 'Near Transit'],
    photos: [
      'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&h=600&fit=crop',
    ],
  },
  {
    id: '3',
    title: 'Marina District Lot',
    address: '789 Marina Blvd, San Francisco',
    type: 'lot' as const,
    pricePerHour: 18,
    pricePerDay: 95,
    rating: 4.8,
    reviewCount: 156,
    totalBookings: 418,
    activeBooking: false,
    status: 'active' as const,
    features: ['Waterfront View', 'Covered', 'Valet Available', 'EV Charging'],
    photos: [
      'https://images.unsplash.com/photo-1558882224-dda166733046?w=800&h=600&fit=crop',
    ],
  },
  {
    id: '4',
    title: 'Union Square Garage',
    address: '321 Powell St, San Francisco',
    type: 'garage' as const,
    pricePerHour: 20,
    pricePerDay: 110,
    rating: 4.6,
    reviewCount: 203,
    totalBookings: 512,
    activeBooking: false,
    status: 'inactive' as const,
    features: ['Prime Location', 'Covered', 'Security', 'Shopping Access'],
    photos: [
      'https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?w=800&h=600&fit=crop',
    ],
  },
];

export const mockReviews = [
  {
    id: '1',
    guestName: 'Sarah Chen',
    listingTitle: 'Downtown Garage - Spot A12',
    rating: 5,
    comment:
      'Perfect spot! Easy access, well-lit, and the EV charging was a huge plus. The location made it super convenient for my downtown meetings.',
    date: '2025-10-08T10:30:00',
    response: 'Thank you so much Sarah! We\'re glad you enjoyed the convenience and amenities. Looking forward to hosting you again!',
  },
  {
    id: '2',
    guestName: 'Michael Torres',
    listingTitle: 'Bay Street Parking',
    rating: 5,
    comment:
      'Great value for money. Close to where I needed to be and felt very safe. Would definitely book again!',
    date: '2025-10-07T15:20:00',
    response: undefined,
  },
  {
    id: '3',
    guestName: 'Emma Wilson',
    listingTitle: 'Marina District Lot',
    rating: 4,
    comment:
      'Nice spot with a beautiful view. Only issue was it took a bit longer to find the entrance, but overall great experience.',
    date: '2025-10-06T18:45:00',
    response: undefined,
  },
  {
    id: '4',
    guestName: 'James Rodriguez',
    listingTitle: 'Downtown Garage - Spot B5',
    rating: 5,
    comment:
      'Excellent! The spot was exactly as described and the entry instructions were clear. Highly recommend.',
    date: '2025-10-05T12:15:00',
    response: 'Thanks James! We appreciate your kind words and attention to detail. See you next time!',
  },
  {
    id: '5',
    guestName: 'David Kim',
    listingTitle: 'Bay Street Parking',
    rating: 5,
    comment:
      'Perfect for my weekend visit. Host was responsive and the location was ideal for exploring the city.',
    date: '2025-10-03T09:30:00',
    response: undefined,
  },
];

export const mockCalendarBookings = [
  // October 10 (Today)
  { date: '2025-10-10', listing: 'Downtown Garage - Spot A12', time: '14:00-17:00', guest: 'Sarah Chen' },
  { date: '2025-10-10', listing: 'Bay Street Parking', time: '15:30-17:30', guest: 'Michael Torres' },
  
  // October 11
  { date: '2025-10-11', listing: 'Marina District Lot', time: '08:00-20:00', guest: 'Emma Wilson' },
  { date: '2025-10-11', listing: 'Downtown Garage - Spot B5', time: '10:00-15:00', guest: 'James Rodriguez' },
  
  // October 12
  { date: '2025-10-12', listing: 'Bay Street Parking', time: '12:00-16:00', guest: 'Lisa Anderson' },
  { date: '2025-10-12', listing: 'Marina District Lot', time: '09:00-18:00', guest: 'Tom Holland' },
  
  // October 13
  { date: '2025-10-13', listing: 'Downtown Garage - Spot A12', time: '08:00-12:00', guest: 'Anna Lee' },
  
  // October 14
  { date: '2025-10-14', listing: 'Bay Street Parking', time: '10:00-16:00', guest: 'Chris Evans' },
  { date: '2025-10-14', listing: 'Downtown Garage - Spot B5', time: '14:00-19:00', guest: 'Scarlett J.' },
  
  // October 15
  { date: '2025-10-15', listing: 'Marina District Lot', time: '08:00-20:00', guest: 'Mark Ruffalo' },
];
