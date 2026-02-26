import { motion } from 'motion/react';
import { MapPin, Star, Eye, Plus, Edit, ToggleLeft, ToggleRight } from 'lucide-react';
import { mockListings } from '../../../utils/hostMockData';
import { useState } from 'react';

interface DashboardListingsProps {
  isDarkMode: boolean;
}

export function DashboardListings({ isDarkMode }: DashboardListingsProps) {
  const [listings, setListings] = useState(mockListings);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const toggleListingStatus = (id: string) => {
    setListings(prev =>
      prev.map(listing =>
        listing.id === id
          ? { ...listing, status: listing.status === 'active' ? 'inactive' : 'active' as any }
          : listing
      )
    );
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      driveway: 'Driveway',
      garage: 'Garage',
      lot: 'Parking Lot',
      street: 'Street Parking',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div>
          <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
            My Listings
          </h1>
          <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
            Manage your parking spots
          </p>
        </div>

        <motion.button
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
            Add Listing
          </span>
        </motion.button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="text-[28px] text-white mb-1" style={{ fontWeight: 700 }}>
            {listings.filter(l => l.status === 'active').length}
          </div>
          <div className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
            Active Listings
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="text-[28px] text-white mb-1" style={{ fontWeight: 700 }}>
            {listings.reduce((sum, l) => sum + l.totalBookings, 0)}
          </div>
          <div className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
            Total Bookings
          </div>
        </motion.div>

        <motion.div
          className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <div className="text-[28px] text-white mb-1" style={{ fontWeight: 700 }}>
            {(listings.reduce((sum, l) => sum + l.rating, 0) / listings.length).toFixed(1)}
          </div>
          <div className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
            Average Rating
          </div>
        </motion.div>
      </div>

      {/* Listings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {listings.map((listing, index) => (
          <motion.div
            key={listing.id}
            className="rounded-[20px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.4 + index * 0.1 }}
            whileHover={{ scale: 1.02, y: -4 }}
          >
            {/* Image */}
            <div className="relative h-48 bg-gradient-to-br from-purple-500/20 to-cyan-500/20">
              <img
                src={listing.photos[0]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
              
              {/* Status Badge */}
              <div className="absolute top-3 right-3">
                <div className={`px-3 py-1.5 rounded-full backdrop-blur-xl border-2 ${
                  listing.status === 'active'
                    ? 'bg-green-500/30 border-green-400/50'
                    : 'bg-gray-500/30 border-gray-400/50'
                }`}>
                  <span className={`text-[12px] ${
                    listing.status === 'active' ? 'text-green-300' : 'text-gray-300'
                  }`} style={{ fontWeight: 600 }}>
                    {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
                  </span>
                </div>
              </div>

              {/* Active Booking Badge */}
              {listing.activeBooking && (
                <div className="absolute top-3 left-3">
                  <div className="px-3 py-1.5 rounded-full bg-cyan-500/30 border-2 border-cyan-400/50 backdrop-blur-xl flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[12px] text-cyan-300" style={{ fontWeight: 600 }}>
                      Occupied
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[20px] text-white mb-1" style={{ fontWeight: 600 }}>
                    {listing.title}
                  </h3>
                  <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {listing.address}
                  </p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/20 border border-purple-400/30">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" strokeWidth={2.5} />
                  <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>
                    {listing.rating}
                  </span>
                </div>
              </div>

              {/* Type & Stats */}
              <div className="flex items-center gap-3 mb-4 text-[13px] text-white/70">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{getTypeLabel(listing.type)}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{listing.totalBookings} bookings</span>
                </div>
              </div>

              {/* Pricing */}
              <div className="flex items-center gap-4 mb-4">
                <div>
                  <div className="text-[20px] text-green-400 mb-1" style={{ fontWeight: 700 }}>
                    ${listing.pricePerHour}/hr
                  </div>
                  <div className="text-[13px] text-white/50" style={{ fontWeight: 400 }}>
                    ${listing.pricePerDay}/day
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="flex flex-wrap gap-2 mb-4">
                {listing.features.slice(0, 3).map((feature) => (
                  <div
                    key={feature}
                    className="px-2 py-1 rounded-full bg-[#2C2C2E]/60 border border-white/20"
                  >
                    <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                      {feature}
                    </span>
                  </div>
                ))}
                {listing.features.length > 3 && (
                  <div className="px-2 py-1 rounded-full bg-[#2C2C2E]/60 border border-white/20">
                    <span className="text-[11px] text-white/70" style={{ fontWeight: 500 }}>
                      +{listing.features.length - 3} more
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <motion.button
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border-2 border-white/20"
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <Edit className="w-4 h-4 text-white" strokeWidth={2.5} />
                  <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                    Edit
                  </span>
                </motion.button>

                <motion.button
                  onClick={() => toggleListingStatus(listing.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 ${
                    listing.status === 'active'
                      ? 'bg-green-500/20 border-green-400/30'
                      : 'bg-gray-500/20 border-gray-400/30'
                  }`}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  {listing.status === 'active' ? (
                    <ToggleRight className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-gray-400" strokeWidth={2.5} />
                  )}
                  <span className={`text-[13px] ${
                    listing.status === 'active' ? 'text-green-400' : 'text-gray-400'
                  }`} style={{ fontWeight: 600 }}>
                    {listing.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
