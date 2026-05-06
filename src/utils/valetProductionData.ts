export type JobStatus =
  | 'pending'
  | 'accepted'
  | 'en_route_pickup'
  | 'in_inspection'
  | 'picked_up'
  | 'en_route_delivery'
  | 'in_transit'
  | 'parked'
  | 'delivered'
  | 'clean_close'
  | 'completed'
  | 'cancelled';

export type VehicleSize = 'compact' | 'sedan' | 'suv' | 'luxury' | 'sports';
export type TransmissionType = 'automatic' | 'manual' | 'ev';
export type TrunkCategory = 'full' | 'compact' | 'frunk_only' | 'none';
export type DriverCertification = 'manual_transmission' | 'ev_specialist' | 'luxury_handling' | 'etiquette_gold';

export interface EBikeSpec {
  brand: string;
  model: string;
  foldedLengthCm: number;
  foldedWidthCm: number;
  foldedHeightCm: number;
  weightKg: number;
  sizeClass: 'compact' | 'standard' | 'large';
}

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
    transmissionType: TransmissionType;
    trunkCategory: TrunkCategory;
    requiresEVSpecialist: boolean;
  };
  pickupLocation: { name: string; address: string; coordinates: { lat: number; lng: number }; instructions?: string };
  deliveryLocation: { name: string; address: string; coordinates: { lat: number; lng: number }; instructions?: string };
  requestTime: string;
  acceptedTime?: string;
  pickupTime?: string;
  deliveryTime?: string;
  completedTime?: string;
  earnings: number;
  tip?: number;
  distance: number;
  estimatedDuration: number;
  priority: 'standard' | 'express' | 'vip';
  specialInstructions?: string;
  addonServices?: AddonService[];
}

export const activeValetJobs: ValetJob[] = [];
export const completedValetJobs: ValetJob[] = [];

export const driverProfile = {
  id: '',
  name: 'Valet Driver',
  phone: '',
  email: '',
  photo: '',
  rating: 0,
  totalJobs: 0,
  memberSince: '',
  vehicleInfo: { make: '', model: '', year: new Date().getFullYear(), color: '', plate: '' },
  licenseInfo: { number: '', state: '', expiryDate: '' },
  insurance: { provider: '', policyNumber: '', expiryDate: '' },
  certifications: [] as DriverCertification[],
  gearRegistry: { brand: '', model: '', foldedLengthCm: 0, foldedWidthCm: 0, foldedHeightCm: 0, weightKg: 0, sizeClass: 'standard' } as EBikeSpec,
  eBikeBatteryLevel: 0,
  status: 'pending' as const,
  onlineStatus: 'offline' as const,
};

export const valetEarningsData = {
  today: { amount: 0, jobs: 0, tips: 0, hours: 0 },
  thisWeek: { amount: 0, jobs: 0, tips: 0, hours: 0 },
  thisMonth: { amount: 0, jobs: 0, tips: 0, hours: 0 },
  chartData: [
    { date: 'Mon', earnings: 0, jobs: 0 },
    { date: 'Tue', earnings: 0, jobs: 0 },
    { date: 'Wed', earnings: 0, jobs: 0 },
    { date: 'Thu', earnings: 0, jobs: 0 },
    { date: 'Fri', earnings: 0, jobs: 0 },
    { date: 'Sat', earnings: 0, jobs: 0 },
    { date: 'Sun', earnings: 0, jobs: 0 },
  ],
  recentPayouts: [] as Array<{ id: string; amount: number; date: string; status: 'completed'; method: string }>,
};

export const valetNotifications: Array<{ id: string; read: boolean }> = [];

export const emptyValetJobs = activeValetJobs;
export const completedValetJobHistory = completedValetJobs;
export const currentDriverProfile = driverProfile;
export const valetDriverEarnings = valetEarningsData;
export const driverNotifications = valetNotifications;