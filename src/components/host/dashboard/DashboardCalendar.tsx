import { motion } from 'motion/react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, MapPin, Clock, User } from 'lucide-react';
import { mockCalendarBookings } from '../../../utils/hostMockData';
import { useState, useMemo } from 'react';

interface DashboardCalendarProps {
  isDarkMode: boolean;
}

export function DashboardCalendar({ isDarkMode }: DashboardCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 9, 10)); // October 10, 2025
  const [selectedDate, setSelectedDate] = useState<string>('2025-10-10');

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

  // Check if date has bookings (memoized for performance)
  const hasBookings = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return mockCalendarBookings.some(b => b.date === dateStr);
  };

  // Get selected day bookings - memoized
  const selectedDayBookings = useMemo(() => 
    mockCalendarBookings.filter(b => b.date === selectedDate),
    [selectedDate]
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
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Calendar
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          View and manage your bookings
        </p>
      </motion.div>

      {/* Calendar Card */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6">
          <motion.button
            onClick={goToPreviousMonth}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#2C2C2E]/60 border-2 border-white/20"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>

          <h2 className="text-[22px] text-white" style={{ fontWeight: 600 }}>
            {monthName}
          </h2>

          <motion.button
            onClick={goToNextMonth}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#2C2C2E]/60 border-2 border-white/20"
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
              className="text-center text-[11px] text-white/50 py-2"
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
            const hasBooking = hasBookings(day);
            const isToday = dateStr === '2025-10-10'; // Current date in our mock

            return (
              <motion.button
                key={day}
                onClick={() => setSelectedDate(dateStr)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative border-2 transition-colors ${
                  isSelected
                    ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-white/30'
                    : isToday
                    ? 'border-cyan-400/50 bg-cyan-500/10'
                    : 'border-white/10 bg-[#2C2C2E]/40 hover:border-white/20'
                }`}
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                <span className={`text-[15px] ${
                  isSelected ? 'text-white' : isToday ? 'text-cyan-300' : 'text-white/90'
                }`} style={{ fontWeight: isSelected || isToday ? 600 : 400 }}>
                  {day}
                </span>
                
                {hasBooking && (
                  <div className="flex gap-0.5 mt-1">
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
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[20px] text-white mb-1" style={{ fontWeight: 600 }}>
              {formatSelectedDate()}
            </h2>
            <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
              {selectedDayBookings.length} {selectedDayBookings.length === 1 ? 'booking' : 'bookings'}
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border-2 border-white/20">
            <CalendarIcon className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
            <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
              {selectedDayBookings.length}
            </span>
          </div>
        </div>

        {selectedDayBookings.length > 0 ? (
          <div className="space-y-3">
            {selectedDayBookings.map((booking, index) => (
              <motion.div
                key={index}
                className="rounded-xl p-4 bg-[#2C2C2E]/60 border-2 border-white/10"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springConfig, delay: 0.3 + index * 0.05 }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </div>

                  <div className="flex-1">
                    <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                      {booking.guest}
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-white/70">
                      <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>{booking.time}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[13px] text-white/90">
                  <MapPin className="w-3.5 h-3.5 text-purple-400" strokeWidth={2.5} />
                  <span style={{ fontWeight: 500 }}>{booking.listing}</span>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <CalendarIcon className="w-12 h-12 text-white/30 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[15px] text-white/50" style={{ fontWeight: 400 }}>
              No bookings for this date
            </p>
          </div>
        )}
      </motion.div>

      {/* Legend */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-xl"
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
            <span className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
              Today
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border-2 border-white/30 bg-gradient-to-br from-purple-500/40 to-cyan-500/40" />
            <span className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
              Selected Date
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border-2 border-white/10 bg-[#2C2C2E]/40 flex items-center justify-center">
              <div className="flex gap-0.5">
                <div className="w-1 h-1 rounded-full bg-purple-400" />
                <div className="w-1 h-1 rounded-full bg-purple-400" />
              </div>
            </div>
            <span className="text-[15px] text-white/90" style={{ fontWeight: 400 }}>
              Has Bookings
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
