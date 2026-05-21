import { motion } from 'motion/react';
import { User, Settings, Bell, CreditCard, MapPin, Award, LogOut, ChevronRight, Sparkles, Car, Heart, Crown, Share2, Clock, CheckCircle2, Users, Shield, FileText, AlertTriangle, Ticket, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect, type ReactNode } from 'react';
import { trpc } from '../utils/trpc';
import { PersonalInfoEdit } from './PersonalInfoEdit';
import { VehicleManagement } from './VehicleManagement';
import { PaymentMethods } from './PaymentMethods';
import { NotificationSettings } from './NotificationSettings';
import { ParkingPreferences } from './ParkingPreferences';
import { LocationSettings } from './LocationSettings';
import { VibePreferences } from './VibePreferences';
import { SavedSpotsSection } from './SavedSpotsSection';
import { BytspotPoints } from './BytspotPoints';
import { getSavedSpotsStats } from '../utils/savedSpots';
import { PrivacyPolicy } from './PrivacyPolicy';
import { TermsOfService } from './TermsOfService';
import { Disclaimer } from './Disclaimer';
import { shareReferral } from '../utils/nativeShare';
import { impactLight } from '../utils/haptics';
import { getUserPointsLocal, getUserPointsAsync, getUserTier, getAchievementStats } from '../utils/gamification';
import { getCheckinHistory, getCheckinHistoryAsync, type CheckInRecord } from '../utils/checkinHistory';
import { getFollowedUsers, getFollowedUsersAsync, getSocialFeed, unfollowUser, type SocialFeedEvent, type FollowedUser } from '../utils/social';
import { getAccessPasses, getInsiderMembership, INSIDER_COMMERCE_EVENT, INSIDER_PERKS, replaceAccessPassesFromServer, syncInsiderMembershipFromPremium } from '../utils/insiderCommerce';
import { getParkingReservations, PARKING_RESERVATIONS_EVENT, type ParkingReservationRecord } from '../utils/parkingReservations';
import { APPLE_REVIEW_HIDE_INSIDER_PREMIUM } from '../utils/reviewBuild';
import { saveVirtualPatchContext, type VirtualPatchContext, type VirtualPatchSavedServiceRequest, VIRTUAL_PATCH_CONTEXT_KEY } from '../utils/virtualPatch';
import { deriveConsumerExperienceTier, getConsumerTierProgress, TIERED_EXPERIENCE_PROFILES } from '../features/tieredExperience.ts';
import { getCheckoutRedirectUrl } from '../utils/checkoutRedirect.ts';

const DEMO_VENUE_SERVICES = [
  { name: 'Verified Entry', detail: 'Skip the line and walk straight in.' },
  { name: 'VIP Access', detail: 'Premium seating, priority arrival, and lounge-ready support.' },
  { name: 'Smart Parking', detail: 'Find parking and book venue pickup.' },
  { name: 'Concierge Help', detail: 'Request private chef, massage, rides, and venue help.' },
];

interface ProfileSectionProps {
  isDarkMode: boolean;
  onOpenVirtualPatch?: (context: VirtualPatchContext | null) => void;
  onLogout?: () => void;
}

type ProfileMenuItem = {
  icon: ReactNode;
  label: string;
  badge: string | null;
  screen: ProfileScreen;
  danger?: boolean;
};

type ProfileMenuSection = {
  title: string;
  items: ProfileMenuItem[];
};

type ProfileScreen = 'main' | 'personal-info' | 'vehicles' | 'payment' | 'notifications' | 'parking-preferences' | 'vibe-preferences' | 'location-settings' | 'general-settings' | 'delete-account' | 'saved-spots' | 'points' | 'tickets' | 'reservations' | 'checkin-history' | 'friends' | 'privacy-policy' | 'terms-of-service' | 'disclaimer';
type SubscriptionStatus = { isPremium?: boolean; message?: string } | null;
type AccessPassList = Parameters<typeof replaceAccessPassesFromServer>[0];

function getToastErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function readVirtualPatchContext(): VirtualPatchContext | null {
  try {
    const raw = localStorage.getItem(VIRTUAL_PATCH_CONTEXT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VirtualPatchContext;
  } catch {
    return null;
  }
}

function clearVirtualPatchContext() {
  localStorage.removeItem(VIRTUAL_PATCH_CONTEXT_KEY);
}

function formatVirtualPatchDistance(distanceMeters?: number | null): string | null {
  if (typeof distanceMeters !== 'number') return null;
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km away`;
  return `${Math.round(distanceMeters)} m away`;
}

function formatVirtualPatchMode(mode?: string): string {
  switch (mode) {
    case 'tap-verified': return 'Tap verified';
    case 'qr-verified': return 'QR verified';
    case 'verified-zone': return 'Venue in range';
    case 'wallet-fallback': return 'Wallet standby';
    default: return 'Virtual Patch';
  }
}

function isDemoVenueVirtualPatch(context?: VirtualPatchContext | null): boolean {
  const venueName = context?.venueName ?? '';
  return /demo\s+venue|review\s+venue/i.test(venueName);
}

function getPublicVirtualPatchVenueName(context?: VirtualPatchContext | null): string {
  const venueName = context?.venueName?.trim();
  if (!venueName || isDemoVenueVirtualPatch(context)) return 'Venue Services';
  return venueName;
}

function getSavedVirtualServiceRequests(context?: VirtualPatchContext | null): VirtualPatchSavedServiceRequest[] {
  return Array.isArray(context?.serviceRequests) ? context.serviceRequests : [];
}

function shouldShowVirtualPatchAccessCard(context?: VirtualPatchContext | null): boolean {
  if (!context) return false;
  if (context.scan || context.mode === 'wallet-fallback' || context.mode === 'verified-zone') return true;
  return Boolean(context.patchId && context.mode !== 'service-request');
}

function formatSavedServiceStatus(request: VirtualPatchSavedServiceRequest): string {
  switch (request.status) {
    case 'booked': return 'Booking requested';
    case 'check-in': return 'Check-in started';
    case 'called': return 'Call requested';
    default: return 'Request sent';
  }
}

function formatSavedServiceMeta(request: VirtualPatchSavedServiceRequest): string {
  return [request.vendorCategory, request.distance, request.eta].filter(Boolean).join(' · ');
}

function formatCommerceTime(value: string | null): string {
  if (!value) return 'Not yet activated';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatReservationWindow(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function ProfileSection({ isDarkMode, onOpenVirtualPatch, onLogout }: ProfileSectionProps) {
  const [currentScreen, setCurrentScreen] = useState<ProfileScreen>('main');
  const [deleteReturnScreen, setDeleteReturnScreen] = useState<ProfileScreen>('general-settings');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showDeleteFinalConfirm, setShowDeleteFinalConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const savedSpotsStats = getSavedSpotsStats();

  // Read real user data from localStorage
  const userName = (() => {
    const name = localStorage.getItem('bytspot_user_name');
    if (name) return name;
    try {
      const user = JSON.parse(localStorage.getItem('bytspot_user') || '{}');
      return user?.name?.split(' ')[0] || 'Guest';
    } catch { return 'Guest'; }
  })();

  // Async state: points, checkins, achievements — start with sync localStorage values, upgrade via API
  const [userPoints, setUserPoints] = useState(getUserPointsLocal());
  const [checkinHistory, setCheckinHistory] = useState<CheckInRecord[]>(getCheckinHistory());
  const userTier = getUserTier(userPoints.total);
  const achievementStats = getAchievementStats();

  // Fetch referral count from backend via tRPC (end-to-end type-safe)
  const [referralCount, setReferralCount] = useState<number | null>(null);
  // Following count — start with localStorage, upgrade via API
  const [followingCount, setFollowingCount] = useState(getFollowedUsers().length);
  const [membership, setMembership] = useState(() => getInsiderMembership());
  const [walletPasses, setWalletPasses] = useState(() => getAccessPasses());
  const [parkingReservations, setParkingReservations] = useState<ParkingReservationRecord[]>(() => getParkingReservations());
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [virtualPatchContext, setVirtualPatchContext] = useState<VirtualPatchContext | null>(() => readVirtualPatchContext());
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const [paymentMethodCount, setPaymentMethodCount] = useState<number | null>(null);
  const hasRealInsiderCheckout = (() => {
    const token = localStorage.getItem('bytspot_auth_token');
    return !!token && token !== 'guest_session';
  })();
  const subscriptionStateLabel = membership.isActive
    ? membership.source === 'premium'
      ? 'ACTIVE'
      : 'ACTIVE'
    : 'AVAILABLE';
  const consumerBookingCount = walletPasses.length + parkingReservations.length;
  const consumerExperienceTier = deriveConsumerExperienceTier({
    bookingCount: consumerBookingCount,
    activityPoints: userPoints.total,
    checkinCount: checkinHistory.length,
    hasInsiderMembership: membership.isActive,
  });
  const consumerExperienceProfile = TIERED_EXPERIENCE_PROFILES[consumerExperienceTier];
  const consumerExperienceProgress = getConsumerTierProgress({
    bookingCount: consumerBookingCount,
    activityPoints: userPoints.total,
    checkinCount: checkinHistory.length,
    hasInsiderMembership: membership.isActive,
  });
  useEffect(() => {
    const syncCommerce = () => {
      setMembership(getInsiderMembership());
      setWalletPasses(getAccessPasses());
      setParkingReservations(getParkingReservations());
      setVirtualPatchContext(readVirtualPatchContext());
    };

    // Upgrade from API (fire all in parallel)
    getUserPointsAsync().then(setUserPoints).catch(() => {});
    getCheckinHistoryAsync().then(setCheckinHistory).catch(() => {});
    getFollowedUsersAsync().then((users) => setFollowingCount(users.length)).catch(() => {});
    trpc.auth.me.query().then((data: { referralCount?: number | null } | null | undefined) => {
      setReferralCount(data?.referralCount ?? 0);
    }).catch(() => {});
    trpc.subscription.status.query().then((data: SubscriptionStatus) => {
      if (data?.isPremium) {
        setMembership(syncInsiderMembershipFromPremium(true));
      } else {
        syncCommerce();
      }
    }).catch(() => {});

    if (hasRealInsiderCheckout) {
      trpc.user.accessPasses.list.query().then((passes: AccessPassList) => {
        replaceAccessPassesFromServer(passes || []);
      }).catch(() => {});
    }

    window.addEventListener(INSIDER_COMMERCE_EVENT, syncCommerce);
    window.addEventListener(PARKING_RESERVATIONS_EVENT, syncCommerce);

    const profileFocus = localStorage.getItem('bytspot_profile_focus');
    if (profileFocus === 'reservations' || profileFocus === 'tickets' || profileFocus === 'payment') {
      setCurrentScreen(profileFocus);
      localStorage.removeItem('bytspot_profile_focus');
    }

    return () => {
      window.removeEventListener(INSIDER_COMMERCE_EVENT, syncCommerce);
      window.removeEventListener(PARKING_RESERVATIONS_EVENT, syncCommerce);
    };
  }, [hasRealInsiderCheckout]);

  useEffect(() => {
    if (currentScreen !== 'main') return;
    let mounted = true;
    Promise.all([
      trpc.user.vehicles.list.query().catch(() => []),
      trpc.payments.listMethods.query().catch(() => []),
    ]).then(([vehicles, paymentMethods]) => {
      if (!mounted) return;
      setVehicleCount((vehicles ?? []).length);
      setPaymentMethodCount((paymentMethods ?? []).length);
    });
    return () => { mounted = false; };
  }, [currentScreen]);

  // B5: refresh the verified-patch card every time the tickets screen mounts so
  // a verification persisted while ProfileSection was already alive is picked up.
  useEffect(() => {
    if (currentScreen !== 'tickets') return;
    setVirtualPatchContext(readVirtualPatchContext());
  }, [currentScreen]);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleInsiderAction = async () => {
    if (insiderLoading) return;

    if (APPLE_REVIEW_HIDE_INSIDER_PREMIUM) {
      if (membership.isActive) {
        setCurrentScreen('tickets');
      }
      return;
    }

    if (membership.isActive) {
      setCurrentScreen('tickets');
      return;
    }

    impactLight();
    setInsiderLoading(true);
    let redirectingToCheckout = false;

    try {
      if (hasRealInsiderCheckout) {
        const result = await trpc.subscription.createCheckout.mutate({
          plan: 'insider-premium',
        });

        const checkoutUrl = getCheckoutRedirectUrl(result);
        if (checkoutUrl) {
          redirectingToCheckout = true;
          window.location.assign(checkoutUrl);
          return;
        }

        if (result?.message === 'Already premium') {
          setMembership(syncInsiderMembershipFromPremium(true));
          setCurrentScreen('tickets');
          toast.success('Insider already active', { description: 'Your access wallet is ready in Profile.' });
          return;
        }

        toast.error('Unable to start Insider checkout', { description: result?.message || 'Checkout did not return a Stripe URL.' });
        return;
      } else {
        toast('Sign in to start Insider checkout', { description: 'Insider activation requires a signed-in account and Stripe checkout.' });
        return;
      }
    } catch (error: unknown) {
      toast.error('Unable to start Insider checkout', { description: getToastErrorMessage(error, 'Please try again in a moment.') });
    } finally {
      if (!redirectingToCheckout) setInsiderLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE' || isDeletingAccount) return;
    const token = localStorage.getItem('bytspot_auth_token');
    if (!token || token === 'guest_session') {
      toast.error('Sign in required', { description: 'Please sign in before deleting an account.' });
      return;
    }
    setShowDeleteFinalConfirm(false);
    setIsDeletingAccount(true);
    try {
      await trpc.user.profile.deleteAccount.mutate({ confirmation: 'DELETE' });
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('bytspot_')) localStorage.removeItem(key);
      });
      toast.success('Account deleted', { description: 'Your Bytspot account has been permanently deleted.' });
      setTimeout(() => onLogout?.(), 700);
    } catch (err: unknown) {
      toast.error('Unable to delete account', { description: getToastErrorMessage(err, 'Please try again.') });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // My Access is the customer's lightweight wallet. Verified physical/QR
// patches prove venue access; saved virtual service requests are
  // shown beside them but intentionally labeled as requests, not verified entry.
  const savedVirtualServiceRequests = getSavedVirtualServiceRequests(virtualPatchContext);
  const showVirtualPatchCard = shouldShowVirtualPatchAccessCard(virtualPatchContext);
  const totalAccessItems = walletPasses.length + savedVirtualServiceRequests.length + (showVirtualPatchCard ? 1 : 0);
  const isAccessEmpty = walletPasses.length === 0 && savedVirtualServiceRequests.length === 0 && !showVirtualPatchCard;

  const menuSections: ProfileMenuSection[] = [
    {
      title: 'Account',
      items: [
        { icon: <User className="w-5 h-5" />, label: 'Personal Information', badge: null, screen: 'personal-info' as ProfileScreen },
        { icon: <Car className="w-5 h-5" />, label: 'My Vehicles', badge: vehicleCount && vehicleCount > 0 ? String(vehicleCount) : null, screen: 'vehicles' as ProfileScreen },
        { icon: <CreditCard className="w-5 h-5" />, label: 'Payment Methods', badge: paymentMethodCount && paymentMethodCount > 0 ? String(paymentMethodCount) : null, screen: 'payment' as ProfileScreen },
        { icon: <Ticket className="w-5 h-5" />, label: 'My Access', badge: totalAccessItems > 0 ? totalAccessItems.toString() : null, screen: 'tickets' as ProfileScreen },
        { icon: <Receipt className="w-5 h-5" />, label: 'My Reservations', badge: parkingReservations.length > 0 ? parkingReservations.length.toString() : null, screen: 'reservations' as ProfileScreen },
        { icon: <Heart className="w-5 h-5" />, label: 'Saved Spots', badge: savedSpotsStats.total > 0 ? savedSpotsStats.total.toString() : null, screen: 'saved-spots' as ProfileScreen },
        { icon: <Clock className="w-5 h-5" />, label: 'Places I\'ve Been', badge: checkinHistory.length > 0 ? checkinHistory.length.toString() : null, screen: 'checkin-history' as ProfileScreen },
        { icon: <Users className="w-5 h-5" />, label: 'Friends', badge: (() => { const f = getFollowedUsers().length; return f > 0 ? f.toString() : null; })(), screen: 'friends' as ProfileScreen },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: <Sparkles className="w-5 h-5" />, label: 'Vibe Preferences', badge: null, screen: 'vibe-preferences' as ProfileScreen },
        { icon: <Car className="w-5 h-5" />, label: 'Parking Preferences', badge: null, screen: 'parking-preferences' as ProfileScreen },
        { icon: <Bell className="w-5 h-5" />, label: 'Notifications', badge: null, screen: 'notifications' as ProfileScreen },
      ],
    },
    {
      title: 'App Settings',
      items: [
        { icon: <MapPin className="w-5 h-5" />, label: 'Location & Privacy', badge: null, screen: 'location-settings' as ProfileScreen },
        { icon: <Settings className="w-5 h-5" />, label: 'General', badge: null, screen: 'general-settings' as ProfileScreen },
	        { icon: <Trash2 className="w-5 h-5" />, label: 'Delete Account', badge: null, screen: 'delete-account' as ProfileScreen, danger: true },
      ],
    },
    {
      title: 'Legal',
      items: [
        { icon: <Shield className="w-5 h-5" />, label: 'Privacy Policy', badge: null, screen: 'privacy-policy' as ProfileScreen },
        { icon: <FileText className="w-5 h-5" />, label: 'Terms of Service', badge: null, screen: 'terms-of-service' as ProfileScreen },
        { icon: <AlertTriangle className="w-5 h-5" />, label: 'Disclaimer', badge: null, screen: 'disclaimer' as ProfileScreen },
      ],
    },
  ];

  // Show sub-screens
  if (currentScreen === 'personal-info') {
    return <PersonalInfoEdit isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'vehicles') {
    return <VehicleManagement isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'payment') {
    return <PaymentMethods isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} onPaymentMethodsChanged={setPaymentMethodCount} />;
  }

  if (currentScreen === 'notifications') {
    return <NotificationSettings isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'parking-preferences') {
    return <ParkingPreferences isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }
  
  if (currentScreen === 'vibe-preferences') {
    return <VibePreferences isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'location-settings') {
    return <LocationSettings isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} userRole="parker" />;
  }

  if (currentScreen === 'general-settings') {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <motion.button onClick={() => setCurrentScreen('main')} className="flex items-center gap-2 text-white" whileTap={{ scale: 0.95 }}>
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
          <h2 className="text-[20px] text-white ml-1" style={{ fontWeight: 700 }}>General</h2>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-4 mt-2">
          <div className="rounded-[24px] p-5 border-2 border-slate-700 bg-slate-950 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                <Settings className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[18px] text-white" style={{ fontWeight: 700 }}>App Preferences</p>
                <p className="text-[13px] text-slate-300" style={{ fontWeight: 600 }}>Manage core Bytspot settings.</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => toast.success('Appearance is optimized', { description: 'Bytspot uses its premium dark interface by default.' })}
                className="w-full flex items-center justify-between rounded-[18px] p-4 bg-slate-900 border border-slate-700 text-left"
              >
                <div>
                  <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Appearance</p>
                  <p className="text-[12px] text-slate-300 mt-0.5">Premium dark mode</p>
                </div>
                <span className="text-[12px] text-cyan-200" style={{ fontWeight: 700 }}>Active</span>
              </button>

              <button
                onClick={() => setCurrentScreen('notifications')}
                className="w-full flex items-center justify-between rounded-[18px] p-4 bg-slate-900 border border-slate-700 text-left"
              >
                <div>
                  <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Notifications</p>
                  <p className="text-[12px] text-slate-300 mt-0.5">Crowd, parking, and saved-spot alerts</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-200" strokeWidth={2} />
              </button>

              <button
                onClick={() => setCurrentScreen('location-settings')}
                className="w-full flex items-center justify-between rounded-[18px] p-4 bg-slate-900 border border-slate-700 text-left"
              >
                <div>
                  <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Location & Privacy</p>
                  <p className="text-[12px] text-slate-300 mt-0.5">Control location and data preferences</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-200" strokeWidth={2} />
              </button>

              <button
	                onClick={() => { setDeleteReturnScreen('general-settings'); setDeleteConfirmation(''); setShowDeleteFinalConfirm(false); setCurrentScreen('delete-account'); }}
	                className="w-full flex items-center justify-between rounded-[18px] p-4 bg-red-600 border-2 border-red-300 text-left shadow-lg shadow-red-950/30"
                data-testid="profile-delete-account-entry"
              >
                <div>
                  <p className="text-[15px] text-red-100" style={{ fontWeight: 700 }}>Delete Account</p>
                  <p className="text-[12px] text-red-50 mt-0.5">Permanently remove your account and data</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="rounded-[20px] p-4 border border-slate-700 bg-slate-950">
            <p className="text-[13px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>VERSION</p>
	            <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>Bytspot 1.1.1</p>
          </div>
        </div>
      </div>
    );
  }

  if (currentScreen === 'delete-account') {
    const canDelete = deleteConfirmation === 'DELETE' && !isDeletingAccount;
    const deleteShellClass = isDarkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-950';
    const deletePanelClass = isDarkMode
      ? 'border-red-400/55 bg-red-950 text-white shadow-[0_22px_60px_rgba(127,29,29,0.30)]'
      : 'border-red-300 bg-white text-slate-950 shadow-[0_20px_48px_rgba(127,29,29,0.14)]';
    const deleteNoticeClass = isDarkMode
      ? 'border-red-300 bg-black text-red-50'
      : 'border-red-200 bg-red-50 text-red-950';
    const deleteInputClass = isDarkMode
      ? 'border-slate-600 bg-slate-950 text-white placeholder:text-slate-500 focus:border-red-300 focus:ring-red-400/25'
      : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus:border-red-500 focus:ring-red-300/40';
    const deleteDialogClass = isDarkMode
      ? 'border-red-300/55 bg-slate-950 text-white'
      : 'border-red-300 bg-white text-slate-950';
    return (
      <div className={`h-[100dvh] max-h-[100dvh] flex flex-col ${deleteShellClass}`}>
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <motion.button onClick={() => { setShowDeleteFinalConfirm(false); setCurrentScreen(deleteReturnScreen); }} className={`flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-950'}`} whileTap={{ scale: 0.95 }}>
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
          <h2 className={isDarkMode ? 'ml-1 text-[20px] text-white' : 'ml-1 text-[20px] text-slate-950'} style={{ fontWeight: 850 }}>Delete Account</h2>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-4 mt-2">
          <div className={`rounded-[24px] p-5 border-2 ${deletePanelClass}`}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-600 border border-red-300 flex items-center justify-center shadow-lg shadow-red-950/30">
                <Trash2 className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <p className={isDarkMode ? 'text-[20px] text-white' : 'text-[20px] text-slate-950'} style={{ fontWeight: 900 }}>Permanently delete your account?</p>
                <p className={isDarkMode ? 'text-[13px] text-red-50 mt-1 leading-5' : 'text-[13px] text-slate-700 mt-1 leading-5'} style={{ fontWeight: 700 }}>
                  This removes your Bytspot profile, saved spots, preferences, check-ins, access passes, reservations, and sign-in session.
                </p>
              </div>
            </div>

            <div className={`rounded-[18px] border p-4 space-y-2 ${deleteNoticeClass}`}>
              <p className={isDarkMode ? 'text-[13px] text-red-50' : 'text-[13px] text-red-950'} style={{ fontWeight: 850 }}>To confirm, type DELETE below.</p>
              <p className={isDarkMode ? 'text-[12px] leading-5 text-slate-200' : 'text-[12px] leading-5 text-slate-700'} style={{ fontWeight: 650 }}>
                This action is immediate and permanent. You will be signed out after deletion succeeds.
              </p>
              <input
                value={deleteConfirmation}
	                onChange={(event) => { setDeleteConfirmation(event.target.value.toUpperCase()); setShowDeleteFinalConfirm(false); }}
                placeholder="DELETE"
                data-testid="delete-account-confirmation-input"
                className={`w-full rounded-[14px] border-2 px-4 py-3 text-[16px] outline-none ring-4 ring-transparent transition ${deleteInputClass}`}
              />
            </div>

            <button
              type="button"
              disabled={!canDelete}
	              onClick={() => setShowDeleteFinalConfirm(true)}
              data-testid="delete-account-confirm-button"
              className="mt-4 w-full rounded-[18px] border-2 border-red-400 bg-red-600 px-4 py-4 text-[16px] text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none"
              style={{ fontWeight: 900 }}
            >
              {isDeletingAccount ? 'Deleting account…' : 'Delete My Account'}
            </button>
          </div>
        </div>

	        {showDeleteFinalConfirm && (
		          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-0">
	            <motion.div
	              initial={{ opacity: 0, y: 24, scale: 0.98 }}
	              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`w-full max-w-[360px] rounded-[28px] border-2 p-5 shadow-2xl ${deleteDialogClass}`}
	            >
	              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-950/30">
	                  <AlertTriangle className="h-6 w-6" strokeWidth={2.5} />
	                </div>
	                <div>
                  <p className={isDarkMode ? 'text-[19px] text-white' : 'text-[19px] text-slate-950'} style={{ fontWeight: 900 }}>Final confirmation</p>
                  <p className={isDarkMode ? 'mt-1 text-[13px] leading-5 text-red-50' : 'mt-1 text-[13px] leading-5 text-slate-700'} style={{ fontWeight: 700 }}>
	                    This permanently deletes your Bytspot account and removes your profile data. This action cannot be undone.
	                  </p>
	                </div>
	              </div>
	              <div className="grid grid-cols-1 gap-3">
	                <button
	                  type="button"
	                  onClick={handleDeleteAccount}
	                  disabled={isDeletingAccount}
                  data-testid="delete-account-final-confirm-button"
                  className="w-full rounded-[16px] border-2 border-red-400 bg-red-600 px-4 py-3.5 text-[15px] text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                  style={{ fontWeight: 900 }}
	                >
	                  {isDeletingAccount ? 'Deleting…' : 'Permanently Delete Account'}
	                </button>
	                <button
	                  type="button"
	                  onClick={() => setShowDeleteFinalConfirm(false)}
	                  disabled={isDeletingAccount}
                  className={isDarkMode ? 'w-full rounded-[16px] border border-slate-600 bg-slate-900 px-4 py-3.5 text-[15px] text-white disabled:opacity-60' : 'w-full rounded-[16px] border border-slate-300 bg-slate-100 px-4 py-3.5 text-[15px] text-slate-950 disabled:opacity-60'}
	                  style={{ fontWeight: 750 }}
	                >
	                  Cancel
	                </button>
	              </div>
	            </motion.div>
	          </div>
	        )}
      </div>
    );
  }

  if (currentScreen === 'privacy-policy') {
    return (
      <div className="relative">
        <button onClick={() => setCurrentScreen('main')} className="fixed top-4 left-4 z-50 flex items-center gap-1 px-3 py-2 rounded-full border border-slate-600 bg-slate-950 text-slate-100 text-sm hover:bg-slate-900 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>
        <PrivacyPolicy />
      </div>
    );
  }

  if (currentScreen === 'terms-of-service') {
    return (
      <div className="relative">
        <button onClick={() => setCurrentScreen('main')} className="fixed top-4 left-4 z-50 flex items-center gap-1 px-3 py-2 rounded-full border border-slate-600 bg-slate-950 text-slate-100 text-sm hover:bg-slate-900 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>
        <TermsOfService />
      </div>
    );
  }

  if (currentScreen === 'disclaimer') {
    return (
      <div className="relative">
        <button onClick={() => setCurrentScreen('main')} className="fixed top-4 left-4 z-50 flex items-center gap-1 px-3 py-2 rounded-full border border-slate-600 bg-slate-950 text-slate-100 text-sm hover:bg-slate-900 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </button>
        <Disclaimer />
      </div>
    );
  }

  if (currentScreen === 'saved-spots') {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <motion.button
            onClick={() => setCurrentScreen('main')}
            className="flex items-center gap-2 text-white mb-2"
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SavedSpotsSection isDarkMode={isDarkMode} />
        </div>
      </div>
    );
  }

  if (currentScreen === 'points') {
    return <BytspotPoints isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} />;
  }

  if (currentScreen === 'tickets') {
    return (
      <div className="h-full flex flex-col" data-testid="profile-access-wallet">
        <div className="px-4 pt-4 pb-2">
          <motion.button
            onClick={() => setCurrentScreen('main')}
            className="flex items-center gap-2 text-white mb-2"
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-4">
          <div className="rounded-[24px] p-5 border-2 border-cyan-500 bg-slate-950 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] text-cyan-200/80 mb-1" style={{ fontWeight: 700 }}>MY ACCESS</p>
                <h3 className="text-[24px] text-white" style={{ fontWeight: 700 }}>{totalAccessItems} saved</h3>
                <p className="text-[13px] text-slate-200 mt-2" style={{ fontWeight: 650 }}>
                  {membership.isActive
                    ? 'Verified patches, access passes, and saved service requests appear here.'
                    : 'Scan a patch or request venue services to build your access list.'}
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-full border border-cyan-300 bg-black text-[11px] text-white" style={{ fontWeight: 800 }}>
                {APPLE_REVIEW_HIDE_INSIDER_PREMIUM ? 'ACCESS' : membership.label}
              </div>
            </div>
          </div>

          {showVirtualPatchCard && virtualPatchContext && (
            <motion.div
              data-testid="profile-virtual-patch-card"
              className="select-none rounded-[24px] border border-cyan-200/35 bg-[linear-gradient(145deg,rgba(8,47,73,0.88),rgba(15,23,42,0.98)_46%,rgba(76,29,149,0.82))] p-5 text-white shadow-[0_22px_60px_rgba(0,0,0,0.42),0_0_36px_rgba(34,211,238,0.18)] ring-1 ring-white/10 backdrop-blur-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.03 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 inline-flex rounded-full border border-cyan-200/35 bg-cyan-300/15 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-cyan-100" style={{ fontWeight: 900 }}>Virtual Patch</p>
                  <h4 className="text-[21px] leading-7 text-white" style={{ fontWeight: 950 }}>
                    {virtualPatchContext.scan ? 'Patch verified' : getPublicVirtualPatchVenueName(virtualPatchContext)}
                  </h4>
                  <p className="mt-2 text-[13.5px] leading-5 text-slate-200" style={{ fontWeight: 700 }}>
                    {virtualPatchContext.scan
                      ? `${virtualPatchContext.scan.type === 'nfc' ? 'Tap' : 'QR'} verification completed${virtualPatchContext.venueName ? ` for ${getPublicVirtualPatchVenueName(virtualPatchContext)}` : ''}.`
                      : virtualPatchContext.venueName
                        ? `Continue your frictionless entry flow for ${getPublicVirtualPatchVenueName(virtualPatchContext)}.`
                        : 'Your last Tap / Scan handoff is ready to continue here.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (savedVirtualServiceRequests.length > 0) {
                      const nextContext: VirtualPatchContext = {
                        source: virtualPatchContext.source ?? 'profile',
                        mode: 'service-request',
                        initiatedAt: virtualPatchContext.initiatedAt ?? new Date().toISOString(),
                        venueId: virtualPatchContext.venueId ?? null,
                        venueName: virtualPatchContext.venueName ?? null,
                        serviceRequests: savedVirtualServiceRequests,
                      };
                      saveVirtualPatchContext(nextContext);
                      setVirtualPatchContext(nextContext);
                    } else {
                      clearVirtualPatchContext();
                      setVirtualPatchContext(null);
                    }
                  }}
                  className="rounded-full border border-cyan-100/30 bg-cyan-300/12 px-3 py-1.5 text-[11px] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  style={{ fontWeight: 700 }}
                >
                  Clear
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <div className="rounded-full border border-cyan-100/25 bg-cyan-300/12 px-3 py-1.5 text-[12px] text-cyan-100" style={{ fontWeight: 800 }}>
                  {formatVirtualPatchMode(virtualPatchContext.mode)}
                </div>
                {virtualPatchContext.scan?.type && (
                  <div className="px-3 py-1.5 rounded-full bg-emerald-500/18 border border-emerald-400/25 text-[12px] text-emerald-200" style={{ fontWeight: 700 }}>
                    {virtualPatchContext.scan.type === 'nfc' ? 'Tap confirmed' : 'QR confirmed'}
                  </div>
                )}
                {formatVirtualPatchDistance(virtualPatchContext.distanceMeters) && (
                  <div className="rounded-full border border-slate-600 bg-black px-3 py-1.5 text-[12px] text-slate-100" style={{ fontWeight: 760 }}>
                    {formatVirtualPatchDistance(virtualPatchContext.distanceMeters)}
                  </div>
                )}
                {virtualPatchContext.capabilities?.nfc && (
                  <div className="rounded-full border border-slate-600 bg-black px-3 py-1.5 text-[12px] text-slate-100" style={{ fontWeight: 760 }}>
                    NFC ready
                  </div>
                )}
                {virtualPatchContext.capabilities?.qr && (
                  <div className="rounded-full border border-slate-600 bg-black px-3 py-1.5 text-[12px] text-slate-100" style={{ fontWeight: 760 }}>
                    QR ready
                  </div>
                )}
                {virtualPatchContext.patchId && (
                  <div className="rounded-full border border-purple-100/25 bg-purple-300/12 px-3 py-1.5 text-[12px] text-white" style={{ fontWeight: 800 }}>
                    Patch {virtualPatchContext.patchId.slice(-6)}
                  </div>
                )}
              </div>

              {isDemoVenueVirtualPatch(virtualPatchContext) && (
                <div data-testid="demo-venue-services-card" className="mt-4 select-none rounded-[22px] border border-cyan-100/25 bg-slate-950/95 p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.34)] ring-1 ring-cyan-100/10">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 950 }}>Venue Services</p>
                      <p className="mt-1 text-[13px] leading-5 text-slate-200" style={{ fontWeight: 750 }}>Choose a service to continue in the patch flow.</p>
                    </div>
                    <span className="rounded-full border border-emerald-200/35 bg-emerald-300/15 px-2.5 py-1 text-[11px] text-emerald-100" style={{ fontWeight: 850 }}>Live</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {DEMO_VENUE_SERVICES.map((service) => (
                      <motion.button
                        key={service.name}
                        onClick={() => { impactLight(); onOpenVirtualPatch?.(virtualPatchContext); }}
                        className="w-full rounded-[16px] border border-slate-700 bg-slate-900 px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        whileTap={{ scale: 0.98 }}
                        aria-label={`Open ${service.name}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[15px] leading-5 text-white" style={{ fontWeight: 900 }}>{service.name}</p>
                            <p className="mt-0.5 text-[12px] leading-5 text-slate-300" style={{ fontWeight: 650 }}>{service.detail}</p>
                          </div>
                          <ChevronRight className="h-5 w-5 flex-shrink-0 text-cyan-100" strokeWidth={2.8} />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {virtualPatchContext.scan?.verifiedAt && (
                <div className="mt-4 rounded-[16px] p-3 bg-black border border-slate-700 text-[12px] text-slate-200" style={{ fontWeight: 700 }}>
                  Verified {formatCommerceTime(virtualPatchContext.scan.verifiedAt)}
                  {virtualPatchContext.scan.binding ? ` · bound to ${virtualPatchContext.scan.binding.type}` : ''}
                </div>
              )}

              {!virtualPatchContext.scan && onOpenVirtualPatch && (
                <motion.button
                  onClick={() => onOpenVirtualPatch(virtualPatchContext)}
                  className="mt-4 w-full rounded-[18px] border border-cyan-300/35 bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 px-4 py-3 text-left shadow-[0_14px_34px_rgba(6,182,212,0.24)]"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                  aria-label="Open Virtual Patch scanner from My Access"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] text-white" style={{ fontWeight: 850 }}>Open Virtual Patch</p>
                      <p className="mt-0.5 text-[12px] text-slate-100" style={{ fontWeight: 700 }}>Start the Tap / Scan reader now.</p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-100" strokeWidth={2.8} />
                  </div>
                </motion.button>
              )}
            </motion.div>
          )}

          {savedVirtualServiceRequests.map((request, index) => (
            <motion.div
              key={request.id}
              data-testid="profile-service-request-card"
              className="rounded-[24px] border border-cyan-200/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.88)_54%,rgba(8,47,73,0.78))] p-5 text-white shadow-[0_18px_48px_rgba(0,0,0,0.34),0_0_28px_rgba(34,211,238,0.14)] ring-1 ring-white/10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.06 + index * 0.04 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                      <p className="mb-1 inline-flex rounded-full border border-cyan-200/30 bg-cyan-300/12 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-cyan-100" style={{ fontWeight: 900 }}>Requested local service</p>
                  <h4 className="text-[20px] leading-7 text-white" style={{ fontWeight: 950 }}>{request.serviceName}</h4>
                  <p className="mt-1 text-[13px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>{request.vendorName}</p>
                  {formatSavedServiceMeta(request) && (
                    <p className="mt-0.5 text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 800 }}>{formatSavedServiceMeta(request)}</p>
                  )}
                </div>
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px] bg-slate-900 text-[23px] ring-1 ring-slate-600">
                  {request.vendorPhoto ?? '✦'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                <div className="rounded-[16px] border border-cyan-100/18 bg-cyan-300/10 p-3">
                  <p className="mb-1 text-[11px] text-cyan-100" style={{ fontWeight: 850 }}>STATUS</p>
                  <p className="text-[13px] text-white" style={{ fontWeight: 850 }}>{formatSavedServiceStatus(request)}</p>
                </div>
                <div className="rounded-[16px] border border-purple-100/18 bg-purple-300/10 p-3">
                  <p className="mb-1 text-[11px] text-purple-100" style={{ fontWeight: 850 }}>ACCESS</p>
                  <p className="text-[13px] text-white" style={{ fontWeight: 850 }}>No verified access yet</p>
                </div>
              </div>

              <div className="mt-3 rounded-[16px] border border-slate-700 bg-black p-3 text-[12px] leading-5 text-slate-100" style={{ fontWeight: 750 }}>
                Requested {formatCommerceTime(request.requestedAt)}
                {request.booking?.partySize ? ` · ${request.booking.partySize} guest${request.booking.partySize === '1' ? '' : 's'}` : ''}
                {request.booking?.time && request.booking.time !== 'asap' ? ` · ${formatCommerceTime(request.booking.time)}` : ''}
              </div>
            </motion.div>
          ))}

          {isAccessEmpty ? (
            <div className="rounded-[24px] p-6 border-2 border-slate-700 bg-slate-950 text-center shadow-xl">
              <div className="w-14 h-14 mx-auto rounded-full bg-slate-900 flex items-center justify-center mb-4">
                <Ticket className="w-7 h-7 text-slate-100" strokeWidth={2.2} />
              </div>
              <p className="text-[18px] text-white mb-2" style={{ fontWeight: 700 }}>No access yet</p>
              <p className="text-[14px] text-slate-300" style={{ fontWeight: 600 }}>
                    Scan a Bytspot patch to unlock venue services. Requested local services will appear here separately from verified access.
              </p>
              {onOpenVirtualPatch && (
                <motion.button
                  onClick={() => onOpenVirtualPatch(null)}
                  className="mt-5 w-full rounded-[18px] border border-cyan-300/35 bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 px-4 py-3 text-left shadow-[0_14px_34px_rgba(6,182,212,0.24)]"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                  aria-label="Open Virtual Patch scanner from empty My Access"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[15px] text-white" style={{ fontWeight: 850 }}>Open Virtual Patch</p>
                      <p className="mt-0.5 text-[12px] text-slate-100" style={{ fontWeight: 700 }}>Start the Tap / Scan reader now.</p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-100" strokeWidth={2.8} />
                  </div>
                </motion.button>
              )}
            </div>
          ) : (
            walletPasses.map((pass, index) => (
              <motion.div
                key={pass.id}
                className="rounded-[24px] p-5 border-2 border-slate-700 bg-slate-950 shadow-xl overflow-hidden relative"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springConfig, delay: 0.05 + index * 0.05 }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[18px] text-white" style={{ fontWeight: 700 }}>{pass.title}</p>
                    <p className="text-[13px] text-slate-300 mt-1" style={{ fontWeight: 600 }}>
                      {pass.subtitle ? `${pass.subtitle} · ${pass.location}` : pass.location}
                    </p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" strokeWidth={2.4} />
                    <span className="text-[11px] text-emerald-200" style={{ fontWeight: 700 }}>Confirmed</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="rounded-[16px] p-3 bg-black border border-slate-700">
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>ACCESS</p>
                    <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>{pass.priceLabel}</p>
                  </div>
                  <div className="rounded-[16px] p-3 bg-black border border-slate-700">
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>ORDER</p>
                    <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>{pass.orderNumber}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-[16px] p-3 bg-black border border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>ADDED</p>
                    <p className="text-[13px] text-slate-100" style={{ fontWeight: 650 }}>{formatCommerceTime(pass.purchasedAt)}</p>
                  </div>
                  <div className="px-3 py-2 rounded-[14px] bg-slate-900 border border-slate-700">
                    <span className="text-[12px] text-white tracking-[0.25em]" style={{ fontWeight: 700 }}>QR READY</span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (currentScreen === 'reservations') {
    return (
      <div className="h-full flex flex-col" data-testid="profile-parking-reservations">
        <div className="px-4 pt-4 pb-2">
          <motion.button
            onClick={() => setCurrentScreen('main')}
            className="flex items-center gap-2 text-white mb-2"
            whileTap={{ scale: 0.95 }}
          >
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-4">
          <div className="rounded-[24px] p-5 border-2 border-cyan-500 bg-slate-950 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] text-cyan-200/80 mb-1" style={{ fontWeight: 700 }}>MY RESERVATIONS</p>
                <h3 className="text-[24px] text-white" style={{ fontWeight: 700 }}>{parkingReservations.length} active</h3>
                <p className="text-[13px] text-slate-200 mt-2" style={{ fontWeight: 650 }}>
                  Parking stays separate from venue and event access, so your arrivals stay easy to manage.
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-full border border-cyan-300 bg-black text-[11px] text-white" style={{ fontWeight: 800 }}>
                Parking passes
              </div>
            </div>
          </div>

          {parkingReservations.length === 0 ? (
            <div className="rounded-[24px] p-6 border-2 border-slate-700 bg-slate-950 text-center shadow-xl">
              <div className="w-14 h-14 mx-auto rounded-full bg-slate-900 flex items-center justify-center mb-4">
                <Car className="w-7 h-7 text-slate-100" strokeWidth={2.2} />
              </div>
              <p className="text-[18px] text-white mb-2" style={{ fontWeight: 700 }}>No parking reservations yet</p>
              <p className="text-[14px] text-slate-300" style={{ fontWeight: 600 }}>
                Parking checkouts and demo reservations will appear here as dedicated parking passes.
              </p>
            </div>
          ) : (
            parkingReservations.map((reservation, index) => (
              <motion.div
                key={reservation.id}
                data-testid={`reservation-card-${reservation.id}`}
                className="rounded-[24px] p-5 border-2 border-slate-700 bg-slate-950 shadow-xl overflow-hidden relative"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springConfig, delay: 0.05 + index * 0.05 }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-[18px] text-white" style={{ fontWeight: 700 }}>{reservation.spotName}</p>
                    <p className="text-[13px] text-slate-300 mt-1" style={{ fontWeight: 600 }}>{reservation.address}</p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" strokeWidth={2.4} />
                    <span className="text-[11px] text-emerald-200" style={{ fontWeight: 700 }}>Active</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-left">
                  <div className="rounded-[16px] p-3 bg-black border border-slate-700">
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>WINDOW</p>
                    <p className="text-[14px] text-white" style={{ fontWeight: 700 }}>{formatReservationWindow(reservation.startTime, reservation.endTime)}</p>
                  </div>
                  <div className="rounded-[16px] p-3 bg-black border border-slate-700">
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>PRICE</p>
                    <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>${reservation.totalCost.toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-[16px] p-3 bg-black border border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>PASS CODE</p>
                    <p className="text-[13px] text-slate-100 tracking-[0.2em]" style={{ fontWeight: 750 }}>{reservation.reservationCode}</p>
                  </div>
                  <div className="px-3 py-2 rounded-[14px] bg-slate-900 border border-slate-700 text-right">
                    <p className="text-[11px] text-slate-300 mb-1" style={{ fontWeight: 800 }}>SOURCE</p>
                    <span className="text-[12px] text-white" style={{ fontWeight: 700 }}>{reservation.source === 'stripe' ? 'Checkout' : 'Demo'}</span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (currentScreen === 'friends') {
    // Start with sync localStorage values — FriendsView below upgrades via API
    const followed = getFollowedUsers();
    const feed = getSocialFeed();
    const crowdColor = (lvl: number) =>
      lvl === 1 ? 'text-green-400' : lvl === 2 ? 'text-yellow-400' : lvl === 3 ? 'text-orange-400' : 'text-red-400';
    const crowdEmoji = (lvl: number) => lvl === 1 ? '🟢' : lvl === 2 ? '🟡' : lvl === 3 ? '🟠' : '🔴';
    const formatTime = (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    };
    // Filter feed to only show followed users + own check-ins
    const followedIds = new Set(followed.map((u: FollowedUser) => u.userId));
    const myId = (() => { try { return JSON.parse(localStorage.getItem('bytspot_user') || '{}')?.id || 'me'; } catch { return 'me'; } })();
    const visibleFeed = feed.filter((e: SocialFeedEvent) => followedIds.has(e.userId) || e.userId === myId);
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <motion.button onClick={() => setCurrentScreen('main')} className="flex items-center gap-2 text-white" whileTap={{ scale: 0.95 }}>
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
          <h2 className="text-[20px] text-white ml-1" style={{ fontWeight: 700 }}>Friends</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4 mt-2">
          {/* Following list */}
          {followed.length > 0 && (
            <div>
              <p className="text-[12px] text-slate-300 mb-2" style={{ fontWeight: 800 }}>FOLLOWING ({followed.length})</p>
              <div className="flex flex-wrap gap-2">
                {followed.map((u: FollowedUser) => (
                  <div key={u.userId} className="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-950 border border-slate-700">
                    <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>{u.userName}</span>
                    <motion.button onClick={() => { unfollowUser(u.userId); setCurrentScreen('main'); setTimeout(() => setCurrentScreen('friends'), 10); }}
                      className="text-slate-300 hover:text-red-300 text-[11px]" whileTap={{ scale: 0.88 }}>✕</motion.button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Activity feed */}
          <div>
            <p className="text-[12px] text-slate-300 mb-2" style={{ fontWeight: 800 }}>FRIEND ACTIVITY</p>
            {visibleFeed.length === 0 ? (
              <div className="text-center py-12 text-slate-300">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-[15px]" style={{ fontWeight: 600 }}>No activity yet</p>
                <p className="text-[13px] mt-1">Follow people on the Leaderboard to see where they're going</p>
              </div>
            ) : visibleFeed.map((event: SocialFeedEvent) => (
              <motion.div key={event.id} className="rounded-[16px] p-4 bg-slate-950 border border-slate-700 mb-3"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-[14px] text-slate-200" style={{ fontWeight: 650 }}>
                      <span className="text-white">{event.userId === myId ? 'You' : event.userName}</span>
                      {' '}checked in at{' '}
                      <span className="text-purple-300">{event.venueName}</span>
                    </p>
                    <p className={`text-[13px] mt-1 ${crowdColor(event.crowdLevel)}`} style={{ fontWeight: 500 }}>
                      {crowdEmoji(event.crowdLevel)} {event.crowdLabel}
                    </p>
                  </div>
                  <span className="text-[12px] text-slate-400 ml-3 shrink-0">{formatTime(event.timestamp)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (currentScreen === 'checkin-history') {
    const crowdColor = (lvl: number) =>
      lvl === 1 ? 'text-green-400' : lvl === 2 ? 'text-yellow-400' : lvl === 3 ? 'text-orange-400' : 'text-red-400';
    const crowdBg = (lvl: number) =>
      lvl === 1 ? 'bg-green-500/20 border-green-500/30' : lvl === 2 ? 'bg-yellow-500/20 border-yellow-500/30' : lvl === 3 ? 'bg-orange-500/20 border-orange-500/30' : 'bg-red-500/20 border-red-500/30';
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <motion.button onClick={() => setCurrentScreen('main')} className="flex items-center gap-2 text-white" whileTap={{ scale: 0.95 }}>
            <ChevronRight className="w-5 h-5 rotate-180" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>Back</span>
          </motion.button>
          <h2 className="text-[20px] text-white ml-1" style={{ fontWeight: 700 }}>Places I've Been</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 mt-2">
          {checkinHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                <Clock className="w-8 h-8 text-slate-200" strokeWidth={1.5} />
              </div>
              <p className="text-slate-200 text-[15px]" style={{ fontWeight: 650 }}>No check-ins yet</p>
              <p className="text-slate-400 text-[13px] text-center">Check in at venues to track where you've been</p>
            </div>
          ) : checkinHistory.map((record: CheckInRecord) => {
            const d = new Date(record.timestamp);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return (
              <motion.div key={record.id} className="rounded-[16px] p-4 bg-slate-950 border border-slate-700" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-purple-400" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-[15px] truncate" style={{ fontWeight: 600 }}>{record.venueName}</p>
                      <p className="text-slate-300 text-[12px] mt-0.5">{dateStr} · {timeStr}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] border ${crowdBg(record.crowdLevel)} ${crowdColor(record.crowdLevel)}`} style={{ fontWeight: 600 }}>
                      {record.crowdLabel}
                    </span>
                    <span className="text-purple-400 text-[12px]" style={{ fontWeight: 600 }}>+{record.pointsEarned} pts</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-y-auto overscroll-contain scroll-pb-[calc(8rem+env(safe-area-inset-bottom))] bg-black pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {/* Profile Header */}
      <motion.div
        className="px-4 pt-4 pb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="rounded-[24px] p-6 border-2 border-slate-700 bg-slate-950 shadow-xl">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <User className="w-10 h-10 text-white" strokeWidth={2} />
              </div>
              {/* Membership Badge */}
              <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br ${userTier.gradient} border-2 border-white flex items-center justify-center shadow-lg`}>
                <span className="text-[16px]">{userTier.icon}</span>
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-[22px] text-white" style={{ fontWeight: 700 }}>
                  {userName}
                </h2>
                {!APPLE_REVIEW_HIDE_INSIDER_PREMIUM && membership.isActive && (
                  <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-600 via-purple-600 to-fuchsia-600 border border-fuchsia-100 shadow-sm shadow-fuchsia-950/30">
                    <span className="text-[11px] text-white" style={{ fontWeight: 700 }}>Insider ✨</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-2.5 py-1 rounded-full text-[12px] bg-slate-950 border-2 border-cyan-300/60`} style={{ fontWeight: 700 }}>
                  <span className="text-white">{userTier.icon} {userTier.name} Member</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700">
            <div className="text-center">
              <p className="text-[24px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {followingCount}
              </p>
              <p className="text-[12px] text-slate-200" style={{ fontWeight: 600 }}>
                Following
              </p>
            </div>
            <div className="text-center">
              <p className="text-[24px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {userPoints.total >= 1000 ? `${(userPoints.total / 1000).toFixed(1)}K` : userPoints.total.toLocaleString()}
              </p>
              <p className="text-[12px] text-slate-200" style={{ fontWeight: 600 }}>
                Points
              </p>
            </div>
            <div className="text-center">
              <p className="text-[24px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {achievementStats.unlocked}
              </p>
              <p className="text-[12px] text-slate-200" style={{ fontWeight: 600 }}>
                Badges
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.06 }}
        data-testid="profile-tier-benefits-summary"
      >
        <div className={`rounded-[24px] border-2 border-slate-700 bg-slate-950 p-5 shadow-xl`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[18px] leading-6 text-white" style={{ fontWeight: 850 }}>Parker benefits</h3>
              <p className="mt-2 text-[13px] leading-5 text-slate-200" style={{ fontWeight: 700 }}>{consumerExperienceProfile.accessLevel}</p>
            </div>
            <div className="rounded-2xl border border-slate-500 bg-slate-950 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300" style={{ fontWeight: 800 }}>Bookings</p>
              <p className="text-[20px] leading-6 text-white" style={{ fontWeight: 850 }}>{consumerBookingCount}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-slate-500 bg-slate-950 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[12px] text-slate-200" style={{ fontWeight: 800 }}>{consumerExperienceProgress.label}</p>
              <span className="text-[11px] text-slate-300" style={{ fontWeight: 750 }}>{consumerExperienceProgress.progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-200" style={{ width: `${consumerExperienceProgress.progressPercent}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {consumerExperienceProfile.benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-[12px] text-slate-100" style={{ fontWeight: 700 }}>
                <CheckCircle2 className="h-4 w-4 text-emerald-200" strokeWidth={2.4} />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Points & Rewards Quick Access */}
      {!APPLE_REVIEW_HIDE_INSIDER_PREMIUM && (
        <motion.div
          className="px-4 mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.08 }}
        >
          <div className="rounded-[24px] border-2 border-cyan-500 bg-slate-950 p-5 shadow-xl relative overflow-hidden" data-testid="profile-subscription-card">
            <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] uppercase tracking-[0.16em] text-cyan-200" style={{ fontWeight: 900 }}>Insider</p>
                <p className="mt-1 text-[24px] leading-7 text-white" style={{ fontWeight: 850 }}>{membership.isActive ? 'Insider active' : '$9.99/month'}</p>
                <p className="mt-2 text-[13px] leading-5 text-slate-300" style={{ fontWeight: 600 }}>
                  {membership.isActive
                    ? `Activated ${formatCommerceTime(membership.activatedAt)}. Your access wallet is ready.`
                    : 'Faster paid-entry checkout and wallet-first access for Parker consumers.'}
                </p>
              </div>
              <div className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] ${membership.isActive ? 'bg-emerald-600 border-emerald-100 text-white' : 'bg-slate-950 border-cyan-300/70 text-white'}`} style={{ fontWeight: 800 }}>
                {subscriptionStateLabel}
              </div>
            </div>

            <div className="relative mt-4 grid gap-2">
              {INSIDER_PERKS.slice(0, 3).map((perk) => (
                <div key={perk} className="flex items-center gap-2 text-[12px] text-slate-200" style={{ fontWeight: 650 }}>
                  <Sparkles className="h-4 w-4 text-cyan-300" strokeWidth={2.3} />
                  <span>{perk}</span>
                </div>
              ))}
            </div>

            <div className="relative mt-4 flex flex-wrap gap-2">
              <div className="rounded-full border border-slate-500 bg-slate-950 px-3 py-1.5 text-[12px] text-white" style={{ fontWeight: 700 }}>
                {walletPasses.length} in My Access
              </div>
              <div className="rounded-full border border-slate-500 bg-slate-950 px-3 py-1.5 text-[12px] text-white" style={{ fontWeight: 700 }}>
                {userTier.icon} {userTier.name} rewards
              </div>
            </div>

            <motion.button
              onClick={handleInsiderAction}
              disabled={insiderLoading}
              className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 py-3 text-white shadow-lg transition disabled:cursor-wait disabled:opacity-75"
              whileTap={{ scale: 0.97 }}
              transition={springConfig}
            >
              <Crown className="w-4 h-4 text-white" strokeWidth={2.5} />
              <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                {membership.isActive ? 'Open My Access' : insiderLoading ? 'Opening Stripe…' : hasRealInsiderCheckout ? 'Continue to Stripe' : 'Sign in for Insider'}
              </span>
            </motion.button>
          </div>
        </motion.div>
      )}

      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.095 }}
      >
        <motion.button
          onClick={() => setCurrentScreen('reservations')}
          data-testid="profile-reservations-summary"
          className="w-full rounded-[24px] p-5 border-2 border-cyan-500 bg-slate-950 shadow-xl text-left relative overflow-hidden"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
              <Car className="w-6 h-6 text-white" strokeWidth={2.4} />
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-slate-300 mb-0.5" style={{ fontWeight: 800 }}>MY RESERVATIONS</p>
              <p className="text-[22px] text-white" style={{ fontWeight: 700 }}>{parkingReservations.length} parking pass{parkingReservations.length === 1 ? '' : 'es'}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-100" strokeWidth={2.4} />
          </div>

          {parkingReservations.length > 0 ? (
            <div className="relative rounded-[18px] p-4 bg-slate-950 border border-slate-500">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] text-white" style={{ fontWeight: 700 }}>{parkingReservations[0].spotName}</p>
                  <p className="text-[12px] text-slate-300 mt-1" style={{ fontWeight: 600 }}>{formatReservationWindow(parkingReservations[0].startTime, parkingReservations[0].endTime)} · {parkingReservations[0].reservationCode}</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-700 border border-emerald-200 text-[11px] text-white" style={{ fontWeight: 800 }}>
                  Active
                </div>
              </div>
            </div>
          ) : (
            <p className="relative text-[13px] text-slate-300" style={{ fontWeight: 600 }}>
              Parking checkouts stay separate from event and venue access, so your arrival details are easy to find.
            </p>
          )}
        </motion.button>
      </motion.div>

      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.09 }}
      >
        <motion.button
          onClick={() => setCurrentScreen('tickets')}
          className="w-full rounded-[24px] p-5 border-2 border-slate-700 bg-slate-950 shadow-xl text-left relative overflow-hidden"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="absolute top-0 right-0 w-28 h-28 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-fuchsia-500 flex items-center justify-center">
              <Ticket className="w-6 h-6 text-white" strokeWidth={2.4} />
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-slate-300 mb-0.5" style={{ fontWeight: 800 }}>MY ACCESS</p>
              <p className="text-[22px] text-white" style={{ fontWeight: 700 }}>{walletPasses.length} in wallet</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-100" strokeWidth={2.4} />
          </div>

          {walletPasses.length > 0 ? (
            <div className="relative rounded-[18px] p-4 bg-slate-950 border border-slate-500">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] text-white" style={{ fontWeight: 700 }}>{walletPasses[0].title}</p>
                  <p className="text-[12px] text-slate-300 mt-1" style={{ fontWeight: 600 }}>{walletPasses[0].priceLabel} · {walletPasses[0].orderNumber}</p>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-700 border border-emerald-200 text-[11px] text-white" style={{ fontWeight: 800 }}>
                  Confirmed
                </div>
              </div>
            </div>
          ) : (
            <p className="relative text-[13px] text-slate-300" style={{ fontWeight: 600 }}>
              Unlock paid venue and event access in Discover and it’ll appear here as clean, ready-to-use passes.
            </p>
          )}
        </motion.button>
      </motion.div>

      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <motion.button
          onClick={() => setCurrentScreen('points')}
          className="w-full rounded-[24px] p-6 border-2 border-purple-400 bg-slate-950 shadow-xl relative overflow-hidden tap-target"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div className="text-left">
                <p className="text-[13px] text-purple-200 mb-0.5" style={{ fontWeight: 600 }}>
                  YOUR REWARDS
                </p>
                <p className="text-[24px] text-white" style={{ fontWeight: 700 }}>
                  {userPoints.total.toLocaleString()} points
                </p>
              </div>
            </div>
            <div>
              <ChevronRight className="w-6 h-6 text-slate-100" strokeWidth={2.5} />
            </div>
          </div>

          <div className="relative mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-slate-100" strokeWidth={2.5} />
              <span className="text-[13px] text-slate-100" style={{ fontWeight: 650 }}>
                {userTier.name} ({userTier.discount}% off)
              </span>
            </div>
            <div className="w-px h-4 bg-slate-500" />
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-slate-100" strokeWidth={2.5} />
              <span className="text-[13px] text-slate-100" style={{ fontWeight: 650 }}>
                {achievementStats.unlocked}/{achievementStats.total} badges
              </span>
            </div>
          </div>
        </motion.button>
      </motion.div>

      {/* Invite a Friend — referral card */}
      <motion.div
        className="px-4 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.15 }}
      >
        {(() => {
          // Build personal referral link from stored user ID
          const userId = (() => {
            try { return JSON.parse(localStorage.getItem('bytspot_user') || '{}').id || 'guest'; }
            catch { return 'guest'; }
          })();
          const referralUrl = `https://bytspot.app?ref=${userId}`;

          const handleShare = async () => {
            impactLight();
            await shareReferral(referralUrl);
          };

          return (
            <div className="rounded-[24px] p-5 border-2 border-fuchsia-400 bg-slate-950 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-500 flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1">
                  <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Invite a Friend</p>
                  <p className="text-[12px] text-slate-300" style={{ fontWeight: 600 }}>Share your personal Bytspot link</p>
                </div>
                {/* Live referral count badge */}
                {referralCount !== null && (
                  <div className="flex flex-col items-center px-3 py-1.5 rounded-[12px] bg-fuchsia-500/20 border border-fuchsia-400/30">
                    <span className="text-[18px] text-white" style={{ fontWeight: 700 }}>{referralCount}</span>
                    <span className="text-[10px] text-fuchsia-200/80" style={{ fontWeight: 600 }}>
                      {referralCount === 1 ? 'invite' : 'invites'}
                    </span>
                  </div>
                )}
              </div>

              {/* Referral URL pill */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-[14px] bg-black border border-slate-700">
                <p className="flex-1 text-[12px] text-slate-200 truncate" style={{ fontFamily: 'monospace', fontWeight: 650 }}>
                  {referralUrl}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(referralUrl);
                    toast.success('Copied!');
                  }}
                  className="shrink-0 text-[11px] text-fuchsia-300 border border-fuchsia-500/40 rounded-full px-2.5 py-1 tap-target"
                  style={{ fontWeight: 600 }}
                >
                  Copy
                </button>
              </div>

              <motion.button
                onClick={handleShare}
                className="w-full py-3 rounded-[16px] bg-gradient-to-r from-fuchsia-600 to-cyan-600 flex items-center justify-center gap-2 shadow-lg tap-target"
                whileTap={{ scale: 0.97 }}
                transition={springConfig}
              >
                <Share2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>Share Invite Link</span>
              </motion.button>
            </div>
          );
        })()}
      </motion.div>

      {/* Menu Sections */}
      <div className="px-4 space-y-6">
        {menuSections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.1 + sectionIndex * 0.05 }}
          >
            <h3 className="text-[13px] mb-3 px-2 text-slate-200" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {section.title}
            </h3>
            <div className="rounded-[20px] overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-xl">
              {section.items.map((item, index) => (
                <motion.button
                  type="button"
                  key={item.label}
                  aria-label={item.label}
                  data-testid={`profile-menu-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onClick={() => {
                    if (item.screen) {
	                      if (item.screen === 'delete-account') {
	                        setDeleteReturnScreen('main');
	                        setDeleteConfirmation('');
	                        setShowDeleteFinalConfirm(false);
	                      }
                      setCurrentScreen(item.screen);
                    }
                  }}
	                  className={`w-full flex items-center gap-3 px-4 py-4 ${
                    index !== section.items.length - 1 
                      ? 'border-b border-slate-700'
                      : ''
		                  } ${item.danger ? 'bg-red-600 hover:bg-red-500' : 'hover:bg-slate-900'}`}
                  whileTap={{ scale: 0.98 }}
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  transition={springConfig}
                >
		                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.danger ? 'bg-red-700 text-white' : 'bg-slate-800 text-white'}`}>
                    {item.icon}
                  </div>
		                  <span className={`flex-1 text-left text-[15px] ${item.danger ? 'text-white' : 'text-white'}`} style={{ fontWeight: item.danger ? 850 : 650 }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <div className="px-2.5 py-1 rounded-full text-[12px] bg-purple-500/40 text-purple-200 border border-purple-400/30" style={{ fontWeight: 600 }}>
                      {item.badge}
                    </div>
                  )}
		                  <ChevronRight className={`w-5 h-5 ${item.danger ? 'text-white' : 'text-slate-200'}`} strokeWidth={2} />
                </motion.button>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Logout Button */}
        <motion.div
          className="pb-[calc(1rem+env(safe-area-inset-bottom))]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <motion.button
            className="w-full rounded-[20px] p-4 flex items-center justify-center gap-2 border-2 border-red-300 bg-red-600 text-white hover:bg-red-500 shadow-[0_16px_40px_rgba(220,38,38,0.35)]"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            onClick={() => {
              localStorage.removeItem('bytspot_auth_token');
              localStorage.removeItem('bytspot_user');
              localStorage.removeItem('bytspot_user_name');
              onLogout?.();
            }}
          >
            <LogOut className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[15px]" style={{ fontWeight: 600 }}>
              Log Out
            </span>
          </motion.button>
        </motion.div>

        {/* App Version */}
        <div className="text-center pb-4">
          <p className="text-[12px] text-slate-300" style={{ fontWeight: 600 }}>
            Bytspot v1.0.0
          </p>
        </div>
      </div>
    </div>
  );
}
