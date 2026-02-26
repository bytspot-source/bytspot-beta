// Mock data for Valet Driver App

export type JobStatus = 'pending' | 'accepted' | 'en_route_pickup' | 'picked_up' | 'en_route_delivery' | 'delivered' | 'completed' | 'cancelled';
export type VehicleSize = 'compact' | 'sedan' | 'suv' | 'luxury' | 'sports';

export interface AddonService {
  id: string;
  name: string;
  price: number;
  status: 'requested' | 'accepted' | 'declined' | 'completed';
}

export interface ValetJob {
  id: string;
  status: JobStatus;
  customerName: string;
  customerPhone: string;
  vehicleInfo: {
    make: string;
    model: string;
    year: number;
    color: string;
    plate: string;
    size: VehicleSize;
  };
  pickupLocation: {
    name: string;
    address: string;
    coordinates: { lat: number; lng: number };
    instructions?: string;
  };
  deliveryLocation: {
    name: string;
    address: string;
    coordinates: { lat: number; lng: number };
    instructions?: string;
  };
  requestTime: string;
  acceptedTime?: string;
  pickupTime?: string;
  deliveryTime?: string;
  completedTime?: string;
  earnings: number;
  tip?: number;
  distance: number; // in miles
  estimatedDuration: number; // in minutes
  priority: 'standard' | 'express' | 'vip';
  specialInstructions?: string;
  addonServices?: AddonService[]; // Optional add-on services
}

export const mockActiveJobs: ValetJob[] = [
  {
    id: 'job_001',
    status: 'pending',
    customerName: 'Sarah Chen',
    customerPhone: '+1 (555) 123-4567',
    vehicleInfo: {
      make: 'Tesla',
      model: 'Model S',
      year: 2024,
      color: 'Midnight Silver',
      plate: 'TSLA 123',
      size: 'luxury',
    },
    pickupLocation: {
      name: 'The Ritz-Carlton',
      address: '600 Stockton St, San Francisco, CA',
      coordinates: { lat: 37.7918, lng: -122.4074 },
      instructions: 'Main entrance, valet stand',
    },
    deliveryLocation: {
      name: 'Downtown Garage - Premium Level',
      address: '123 Market St, San Francisco, CA',
      coordinates: { lat: 37.7899, lng: -122.3988 },
      instructions: 'Level P1, Spot A12',
    },
    requestTime: '2025-10-10T14:30:00',
    earnings: 45,
    distance: 2.3,
    estimatedDuration: 15,
    priority: 'vip',
    specialInstructions: 'Handle with extreme care - customer is a VIP member',
    addonServices: [
      { id: 'car_wash', name: 'Premium Car Wash', price: 35, status: 'requested' },
      { id: 'fuel_fill', name: 'Fuel Fill-Up', price: 15, status: 'requested' },
    ],
  },
  {
    id: 'job_002',
    status: 'accepted',
    customerName: 'Michael Torres',
    customerPhone: '+1 (555) 234-5678',
    vehicleInfo: {
      make: 'BMW',
      model: 'M5',
      year: 2023,
      color: 'Black Sapphire',
      plate: 'BMW 789',
      size: 'luxury',
    },
    pickupLocation: {
      name: 'Ferry Building',
      address: '1 Ferry Building, San Francisco, CA',
      coordinates: { lat: 37.7955, lng: -122.3937 },
      instructions: 'South entrance parking area',
    },
    deliveryLocation: {
      name: 'Marina District Lot',
      address: '789 Marina Blvd, San Francisco, CA',
      coordinates: { lat: 37.8057, lng: -122.4376 },
      instructions: 'Covered section, any available spot',
    },
    requestTime: '2025-10-10T14:15:00',
    acceptedTime: '2025-10-10T14:16:00',
    earnings: 38,
    distance: 3.1,
    estimatedDuration: 20,
    priority: 'express',
    addonServices: [
      { id: 'delivery_pickup', name: 'Delivery Pickup', price: 25, status: 'accepted' },
    ],
  },
  {
    id: 'job_003',
    status: 'pending',
    customerName: 'Emma Wilson',
    customerPhone: '+1 (555) 345-6789',
    vehicleInfo: {
      make: 'Mercedes-Benz',
      model: 'S-Class',
      year: 2024,
      color: 'Obsidian Black',
      plate: 'MERC 456',
      size: 'luxury',
    },
    pickupLocation: {
      name: 'Union Square',
      address: '333 Post St, San Francisco, CA',
      coordinates: { lat: 37.7880, lng: -122.4074 },
    },
    deliveryLocation: {
      name: 'Financial District Garage',
      address: '555 California St, San Francisco, CA',
      coordinates: { lat: 37.7929, lng: -122.4019 },
    },
    requestTime: '2025-10-10T14:35:00',
    earnings: 35,
    distance: 1.8,
    estimatedDuration: 12,
    priority: 'standard',
    addonServices: [
      { id: 'oil_change', name: 'Quick Oil Change', price: 75, status: 'requested' },
    ],
  },
];

export const mockCompletedJobs: ValetJob[] = [
  {
    id: 'job_090',
    status: 'completed',
    customerName: 'James Rodriguez',
    customerPhone: '+1 (555) 456-7890',
    vehicleInfo: {
      make: 'Porsche',
      model: '911 Carrera',
      year: 2023,
      color: 'Guards Red',
      plate: 'POR 911',
      size: 'sports',
    },
    pickupLocation: {
      name: 'Salesforce Tower',
      address: '415 Mission St, San Francisco, CA',
      coordinates: { lat: 37.7897, lng: -122.3972 },
    },
    deliveryLocation: {
      name: 'Bay Street Parking',
      address: '456 Bay St, San Francisco, CA',
      coordinates: { lat: 37.8005, lng: -122.4102 },
    },
    requestTime: '2025-10-10T13:00:00',
    acceptedTime: '2025-10-10T13:01:00',
    pickupTime: '2025-10-10T13:15:00',
    deliveryTime: '2025-10-10T13:32:00',
    completedTime: '2025-10-10T13:35:00',
    earnings: 42,
    tip: 15,
    distance: 2.7,
    estimatedDuration: 18,
    priority: 'vip',
  },
  {
    id: 'job_091',
    status: 'completed',
    customerName: 'Lisa Anderson',
    customerPhone: '+1 (555) 567-8901',
    vehicleInfo: {
      make: 'Audi',
      model: 'A8',
      year: 2024,
      color: 'Glacier White',
      plate: 'AUD 888',
      size: 'luxury',
    },
    pickupLocation: {
      name: 'Moscone Center',
      address: '747 Howard St, San Francisco, CA',
      coordinates: { lat: 37.7840, lng: -122.4014 },
    },
    deliveryLocation: {
      name: 'Downtown Garage',
      address: '123 Market St, San Francisco, CA',
      coordinates: { lat: 37.7899, lng: -122.3988 },
    },
    requestTime: '2025-10-10T12:15:00',
    acceptedTime: '2025-10-10T12:16:00',
    pickupTime: '2025-10-10T12:28:00',
    deliveryTime: '2025-10-10T12:42:00',
    completedTime: '2025-10-10T12:45:00',
    earnings: 35,
    tip: 10,
    distance: 1.9,
    estimatedDuration: 15,
    priority: 'standard',
  },
  {
    id: 'job_092',
    status: 'completed',
    customerName: 'David Kim',
    customerPhone: '+1 (555) 678-9012',
    vehicleInfo: {
      make: 'Lexus',
      model: 'LS 500',
      year: 2023,
      color: 'Atomic Silver',
      plate: 'LEX 500',
      size: 'luxury',
    },
    pickupLocation: {
      name: 'Palace Hotel',
      address: '2 New Montgomery St, San Francisco, CA',
      coordinates: { lat: 37.7882, lng: -122.4014 },
    },
    deliveryLocation: {
      name: 'Embarcadero Center Garage',
      address: '4 Embarcadero Center, San Francisco, CA',
      coordinates: { lat: 37.7946, lng: -122.3988 },
    },
    requestTime: '2025-10-10T11:30:00',
    acceptedTime: '2025-10-10T11:31:00',
    pickupTime: '2025-10-10T11:45:00',
    deliveryTime: '2025-10-10T11:58:00',
    completedTime: '2025-10-10T12:00:00',
    earnings: 32,
    tip: 8,
    distance: 1.5,
    estimatedDuration: 12,
    priority: 'standard',
  },
];

export const mockDriverProfile = {
  id: 'driver_123',
  name: 'Alex Thompson',
  phone: '+1 (555) 999-8888',
  email: 'alex.thompson@bytspot.com',
  photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
  rating: 4.9,
  totalJobs: 1247,
  memberSince: '2024-01-15',
  vehicleInfo: {
    make: 'Toyota',
    model: 'Camry',
    year: 2023,
    color: 'Silver',
    plate: 'VLT 789',
  },
  licenseInfo: {
    number: 'D1234567',
    state: 'CA',
    expiryDate: '2028-10-10',
  },
  insurance: {
    provider: 'Bytspot Valet Insurance',
    policyNumber: 'BYT-VLT-123456',
    expiryDate: '2026-12-31',
  },
  status: 'active' as const,
  onlineStatus: 'available' as const,
};

export const mockEarningsData = {
  today: {
    amount: 247,
    jobs: 7,
    tips: 48,
    hours: 6.5,
  },
  thisWeek: {
    amount: 1456,
    jobs: 42,
    tips: 286,
    hours: 38.5,
  },
  thisMonth: {
    amount: 5842,
    jobs: 167,
    tips: 1124,
    hours: 152,
  },
  chartData: [
    { date: 'Mon', earnings: 198, jobs: 6 },
    { date: 'Tue', earnings: 234, jobs: 8 },
    { date: 'Wed', earnings: 287, jobs: 9 },
    { date: 'Thu', earnings: 312, jobs: 10 },
    { date: 'Fri', earnings: 378, jobs: 12 },
    { date: 'Sat', earnings: 401, jobs: 14 },
    { date: 'Sun', earnings: 356, jobs: 11 },
  ],
  recentPayouts: [
    {
      id: 'payout_001',
      amount: 1456,
      date: '2025-10-09T00:00:00',
      status: 'completed' as const,
      method: 'Bank Account •••• 4321',
    },
    {
      id: 'payout_002',
      amount: 1389,
      date: '2025-10-02T00:00:00',
      status: 'completed' as const,
      method: 'Bank Account •••• 4321',
    },
    {
      id: 'payout_003',
      amount: 1523,
      date: '2025-09-25T00:00:00',
      status: 'completed' as const,
      method: 'Bank Account •••• 4321',
    },
  ],
};

export const mockNotifications = [
  {
    id: 'notif_001',
    type: 'new_job' as const,
    title: 'New Valet Request',
    message: 'Tesla Model S at The Ritz-Carlton',
    time: '2025-10-10T14:30:00',
    read: false,
  },
  {
    id: 'notif_002',
    type: 'tip_received' as const,
    title: 'Tip Received',
    message: '$15 tip from James Rodriguez',
    time: '2025-10-10T13:35:00',
    read: false,
  },
  {
    id: 'notif_003',
    type: 'payout' as const,
    title: 'Weekly Payout Processed',
    message: '$1,456 deposited to your account',
    time: '2025-10-09T09:00:00',
    read: true,
  },
];
