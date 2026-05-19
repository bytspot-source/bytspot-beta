import { motion } from 'motion/react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useProviderDashboardData, type DashboardBookingSummary } from '../../../utils/providerDashboardData';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardCalendarProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

const formatIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function bookingDateKey(startsAt: string): string | null {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  return formatIso(date);
}

function formatBookingTime(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatBookingPrice(b: DashboardBookingSummary): string {
  if (!b.priceCents) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: b.currency || 'USD', maximumFractionDigits: 0 }).format(b.priceCents / 100);
  } catch {
    return `$${(b.priceCents / 100).toFixed(0)}`;
  }
}

const STATUS_BADGE: Record<DashboardBookingSummary['status'], { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'border-amber-300/30 bg-amber-400/15 text-amber-100' },
  confirmed: { label: 'Confirmed', classes: 'border-cyan-300/30 bg-cyan-400/15 text-cyan-100' },
  in_progress: { label: 'In progress', classes: 'border-purple-300/30 bg-purple-400/15 text-purple-100' },
  completed: { label: 'Completed', classes: 'border-emerald-300/30 bg-emerald-400/15 text-emerald-100' },
  cancelled: { label: 'Cancelled', classes: 'border-slate-500 bg-slate-700 text-slate-100' },
};

export function DashboardCalendar({ isDarkMode, access }: DashboardCalendarProps) {
  void isDarkMode;
  const data = useProviderDashboardData();
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => formatIso(today), [today]);
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  const activeServiceCount = useMemo(
    () => data.services.filter((s) => s.status === 'active').length,
    [data.services],
  );

  const subtitle = access.role === 'staff'
    ? 'Today\'s shift schedule and arrival handoffs.'
    : access.role === 'manager'
      ? 'Manage arrivals, schedule changes, and operational handoffs across the team.'
      : 'View bookings, schedule changes, and capacity across every active service.';

  const guidanceHeadline = access.role === 'staff'
    ? 'Operate today\'s schedule'
    : access.role === 'manager'
      ? 'Coordinate the operating week'
      : 'Plan the operating month';

  const guidanceBody = access.role === 'staff'
    ? 'Tap a date to preview that day\'s arrivals once bookings sync. Until the live booking feed is enabled, use this view to confirm which services are available for staff to deliver.'
    : access.role === 'manager'
      ? 'Tap a date to review confirmed arrivals, capacity, and patch handoffs. Until the live booking feed is enabled, treat this view as the planning surface for upcoming weeks.'
      : 'Tap a date to review confirmed arrivals, capacity, and revenue. Until the live booking feed is enabled, treat this view as the planning surface — service availability already reflects what guests can book.';

  const guidanceChecklist = access.role === 'staff'
    ? [
        'Confirm the day\'s active services match the patches you have on hand.',
        'Coordinate with the on-shift owner before changing a booking status.',
        'Flag any guest pre-arrival messages to your manager before the start of the shift.',
      ]
    : access.role === 'manager'
      ? [
          'Verify each active service has at least one published patch label.',
          'Pre-stage staff handoff notes for any high-volume day before guests arrive.',
          'Escalate Stripe Connect or compliance gaps to the owner before the booking window opens.',
        ]
      : [
          'Keep at least one active service published so the calendar surfaces real availability.',
          'Reconcile payouts at the end of each operating week.',
          'Use the legend to align the team on today, the selected date, and days with bookings.',
        ];

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Get calendar days - memoized
  const days = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const daysArray: (number | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      daysArray.push(null);
    }

    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      daysArray.push(i);
    }

    return daysArray;
  }, [currentDate]);

  const monthName = useMemo(() => 
    currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [currentDate]
  );

  // Group bookings by ISO date so day cells can flag arrivals and the
  // selected-date card can pull rows in O(1).
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, DashboardBookingSummary[]>();
    for (const booking of data.bookings) {
      const key = bookingDateKey(booking.startsAt);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(booking);
      else map.set(key, [booking]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [data.bookings]);

  const dayHasBookings = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return (bookingsByDate.get(dateStr)?.length ?? 0) > 0;
  };

  const selectedDayBookings = useMemo(
    () => bookingsByDate.get(selectedDate) ?? [],
    [bookingsByDate, selectedDate],
  );

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const formatSelectedDate = () => {
    const date = new Date(selectedDate);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        data-testid="provider-calendar-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Calendar
        </h1>
        <p className="text-[17px] text-slate-100" style={{ fontWeight: 500 }}>
          {subtitle}
        </p>
      </motion.div>

      {/* Operational guidance */}
      <motion.div
        data-testid="provider-calendar-guidance"
        className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-5 shadow-xl shadow-black/45"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.05 }}
      >
        <h2 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>
          {guidanceHeadline}
        </h2>
        <p className="mb-3 text-[13px] leading-5 text-slate-100" style={{ fontWeight: 500 }} data-testid="provider-calendar-guidance-body">
          {guidanceBody}
        </p>
        <ul className="space-y-1.5" data-testid="provider-calendar-guidance-checklist">
          {guidanceChecklist.map((item, idx) => (
            <li key={idx} className="relative pl-3 text-[12px] leading-5 text-slate-100" style={{ fontWeight: 500 }}>
              <span className="absolute left-0 top-2 h-1 w-1 rounded-full bg-cyan-400/70" />
              {item}
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Calendar Card */}
      <motion.div
        className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6">
          <motion.button
            data-testid="provider-calendar-month-prev"
            aria-label="Previous month"
            onClick={goToPreviousMonth}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-500 bg-slate-700"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>

          <h2 data-testid="provider-calendar-month-label" className="text-[22px] text-white" style={{ fontWeight: 600 }}>
            {monthName}
          </h2>

          <motion.button
            data-testid="provider-calendar-month-next"
            aria-label="Next month"
            onClick={goToNextMonth}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-500 bg-slate-700"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ChevronRight className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* Day Labels */}
        <div className="grid grid-cols-7 gap-2 mb-3">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[11px] text-slate-200"
              style={{ fontWeight: 600 }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateStr === selectedDate;
            const hasBooking = dayHasBookings(day);
            const isToday = dateStr === todayIso;

            return (
              <motion.button
                key={day}
                data-testid={`provider-calendar-day-${dateStr}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedDate(dateStr)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative border-2 transition-colors ${
                  isSelected
                    ? 'bg-gradient-to-br from-purple-700 to-cyan-700 border-cyan-300'
                    : isToday
                    ? 'border-cyan-300 bg-cyan-900'
                    : 'border-slate-500 bg-slate-700 hover:border-cyan-300'
                }`}
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                <span className={`text-[15px] ${
                  isSelected ? 'text-white' : isToday ? 'text-cyan-100' : 'text-slate-50'
                }`} style={{ fontWeight: isSelected || isToday ? 600 : 400 }}>
                  {day}
                </span>
                
                {hasBooking && (
                  <div className="flex gap-0.5 mt-1" data-testid={`provider-calendar-marker-${dateStr}`}>
                    <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-purple-400'}`} />
                    <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-purple-400'}`} />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Selected Date Bookings */}
      <motion.div
        data-testid="provider-calendar-selected-card"
        className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 data-testid="provider-calendar-selected-date" className="text-[20px] text-white mb-1" style={{ fontWeight: 600 }}>
              {formatSelectedDate()}
            </h2>
            <p data-testid="provider-calendar-selected-summary" className="text-[13px] text-slate-100" style={{ fontWeight: 500 }}>
              {selectedDayBookings.length} {selectedDayBookings.length === 1 ? 'booking' : 'bookings'}
              {data.authenticated && !data.loading ? ` · ${activeServiceCount} active ${activeServiceCount === 1 ? 'service' : 'services'} available` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border-2 border-cyan-300 bg-cyan-900 px-3 py-1.5">
            <CalendarIcon className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
            <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
              {selectedDayBookings.length}
            </span>
          </div>
        </div>

        {data.loading ? (
          <div className="text-center py-10" data-testid="provider-calendar-empty-loading">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-500 bg-slate-700">
              <CalendarIcon className="h-7 w-7 text-slate-100" strokeWidth={2.5} />
            </div>
            <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Loading schedule…</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-100" style={{ fontWeight: 500 }}>
              Pulling your services and operating windows so this view reflects what guests can actually book.
            </p>
          </div>
        ) : !data.authenticated ? (
          <div className="text-center py-10" data-testid="provider-calendar-empty-unauth">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-500 bg-slate-700">
              <CalendarIcon className="h-7 w-7 text-slate-100" strokeWidth={2.5} />
            </div>
            <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Sign in to view the live schedule</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-100" style={{ fontWeight: 500 }}>
              Calendar entries follow your published services and confirmed bookings. Sign in to see real availability for this date.
            </p>
          </div>
        ) : activeServiceCount === 0 ? (
          <div className="text-center py-10" data-testid="provider-calendar-empty-no-services">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-500 bg-slate-700">
              <CalendarIcon className="h-7 w-7 text-slate-100" strokeWidth={2.5} />
            </div>
            <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>No active services yet</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-100" style={{ fontWeight: 500 }}>
              Publish at least one service from the Listings tab so the calendar can surface real availability and bookings on this date.
            </p>
          </div>
        ) : selectedDayBookings.length > 0 ? (
          <ul className="space-y-3" data-testid="provider-calendar-bookings-list">
            {selectedDayBookings.map((booking) => {
              const badge = STATUS_BADGE[booking.status];
              const price = formatBookingPrice(booking);
              return (
                <li
                  key={booking.id}
                  data-testid={`provider-calendar-booking-${booking.id}`}
                  className="rounded-2xl border-2 border-slate-500 bg-slate-700 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        data-testid={`provider-calendar-booking-time-${booking.id}`}
                        className="text-[12px] uppercase tracking-[0.12em] text-slate-200"
                        style={{ fontWeight: 700 }}
                      >
                        {formatBookingTime(booking.startsAt)}
                      </p>
                      <p
                        data-testid={`provider-calendar-booking-title-${booking.id}`}
                        className="text-[15px] text-white truncate"
                        style={{ fontWeight: 600 }}
                      >
                        {booking.serviceTitle}
                      </p>
                      <p className="truncate text-[12px] text-slate-100" style={{ fontWeight: 500 }}>
                        {booking.guestName ?? 'Guest pending confirmation'}
                        {booking.patchLabel ? ` · ${booking.patchLabel}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        data-testid={`provider-calendar-booking-status-${booking.id}`}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${badge.classes}`}
                        style={{ fontWeight: 800 }}
                      >
                        {badge.label}
                      </span>
                      {price && access.canSeeFinancials && (
                        <span className="text-[13px] text-slate-50" style={{ fontWeight: 700 }}>
                          {price}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center py-10" data-testid="provider-calendar-empty-no-bookings">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-500 bg-slate-700">
              <CalendarIcon className="h-7 w-7 text-slate-100" strokeWidth={2.5} />
            </div>
            <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>No bookings scheduled</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-slate-100" style={{ fontWeight: 500 }}>
              {data.bookings.length > 0
                ? `Confirmed bookings on this date will appear here. Pick a date with markers to see the ${data.bookings.length} ${data.bookings.length === 1 ? 'booking' : 'bookings'} already on your schedule.`
                : `Confirmed bookings on this date will appear here with arrival times and listing details once guests confirm. Your ${activeServiceCount} active ${activeServiceCount === 1 ? 'service is' : 'services are'} available for guests to book.`}
            </p>
          </div>
        )}
      </motion.div>

      {/* Legend */}
      <motion.div
        className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Legend
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border-2 border-cyan-400/50 bg-cyan-500/10" />
            <span className="text-[15px] text-slate-50" style={{ fontWeight: 500 }}>
              Today
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg border-2 border-cyan-300 bg-gradient-to-br from-purple-700 to-cyan-700" />
            <span className="text-[15px] text-slate-50" style={{ fontWeight: 500 }}>
              Selected Date
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-slate-500 bg-slate-700">
              <div className="flex gap-0.5">
                <div className="w-1 h-1 rounded-full bg-purple-400" />
                <div className="w-1 h-1 rounded-full bg-purple-400" />
              </div>
            </div>
            <span className="text-[15px] text-slate-50" style={{ fontWeight: 500 }}>
              Has Bookings
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
