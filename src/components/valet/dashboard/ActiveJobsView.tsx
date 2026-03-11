import { motion } from 'motion/react';
import { 
  MapPin, 
  Navigation, 
  Clock, 
  DollarSign, 
  Car,
  CheckCircle,
  XCircle,
  AlertCircle,
  Sparkles,
  Droplet,
  Wrench,
  Package,
  Fuel,
  Check,
  X
} from 'lucide-react';
import { mockActiveJobs, mockDriverProfile, type ValetJob, type AddonService } from '../../../utils/valetMockData';
import { useState } from 'react';

interface ActiveJobsViewProps {
  isDarkMode: boolean;
}

const ADDON_ICONS: Record<string, any> = {
  car_wash: Droplet,
  oil_change: Wrench,
  fuel_fill: Fuel,
  delivery_pickup: Package,
};

export function ActiveJobsView({ isDarkMode }: ActiveJobsViewProps) {
  const [jobs, setJobs] = useState(mockActiveJobs);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const driverProfile = mockDriverProfile;
  const driverBattery = driverProfile.eBikeBatteryLevel;
  const driverBikeSize = driverProfile.gearRegistry.sizeClass;
  const driverCerts = driverProfile.certifications;
  const batteryGate = driverBattery < 20;

  /**
   * Returns an array of compatibility warning strings for a job.
   * Empty array = fully compatible.
   */
  const getCompatibilityWarnings = (job: ValetJob): string[] => {
    const warnings: string[] = [];
    const v = job.vehicleInfo;

    // 1. Skill gate — manual transmission
    if (v.transmissionType === 'manual' && !driverCerts.includes('manual_transmission')) {
      warnings.push('🔧 Manual Transmission Certification Required');
    }

    // 2. Skill gate — EV specialist
    if (v.requiresEVSpecialist && !driverCerts.includes('ev_specialist')) {
      warnings.push('⚡ EV Specialist Certification Required');
    }

    // 3. Space gate — trunk vs e-bike size
    if (v.trunkCategory === 'none') {
      warnings.push('🚫 No Trunk — E-bike transport not possible');
    } else if (v.trunkCategory === 'frunk_only' && driverBikeSize !== 'compact') {
      warnings.push('🏎️ Frunk Only — Compact E-Bike Required (yours: ' + driverBikeSize + ')');
    } else if (v.trunkCategory === 'compact' && driverBikeSize === 'large') {
      warnings.push('🎒 Compact Trunk — Standard or Compact E-Bike Required');
    }

    return warnings;
  };

  const handleAcceptJob = (jobId: string) => {
    setJobs(jobs.map(job => 
      job.id === jobId 
        ? { ...job, status: 'accepted' as const, acceptedTime: new Date().toISOString() }
        : job
    ));
  };

  const handleDeclineJob = (jobId: string) => {
    setJobs(jobs.filter(job => job.id !== jobId));
  };

  const handleAddonResponse = (jobId: string, addonId: string, accept: boolean) => {
    setJobs(jobs.map(job => {
      if (job.id !== jobId) return job;
      
      return {
        ...job,
        addonServices: job.addonServices?.map(addon =>
          addon.id === addonId
            ? { ...addon, status: accept ? 'accepted' as const : 'declined' as const }
            : addon
        ),
        // Update earnings if accepting an addon
        earnings: accept 
          ? job.earnings + (job.addonServices?.find(a => a.id === addonId)?.price || 0)
          : job.earnings
      };
    }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'vip':
        return 'from-purple-500/30 to-fuchsia-500/30 border-purple-400/50';
      case 'express':
        return 'from-cyan-500/30 to-blue-500/30 border-cyan-400/50';
      default:
        return 'from-white/10 to-white/5 border-white/30';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'vip':
        return <Sparkles className="w-4 h-4 text-purple-400" strokeWidth={2.5} />;
      case 'express':
        return <AlertCircle className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />;
      default:
        return null;
    }
  };

  const renderJobCard = (job: ValetJob, index: number) => {
    const isPending = job.status === 'pending';
    const isAccepted = job.status === 'accepted';
    const compatibilityWarnings = getCompatibilityWarnings(job);
    const isBlocked = compatibilityWarnings.length > 0 || batteryGate;

    return (
      <motion.div
        key={job.id}
        className={`rounded-[20px] p-5 border-2 shadow-xl mb-4 bg-gradient-to-br backdrop-blur-xl ${getPriorityColor(job.priority)}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: index * 0.1 }}
      >
        {/* Battery Gate Banner */}
        {batteryGate && (
          <div className="flex items-center gap-2 mb-3 p-3 rounded-[12px] bg-red-500/20 border border-red-400/40">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" strokeWidth={2.5} />
            <span className="text-[13px] text-red-300" style={{ fontWeight: 600 }}>
              🔋 E-bike battery below 20% — charge before accepting jobs
            </span>
          </div>
        )}

        {/* Compatibility Warnings */}
        {!batteryGate && compatibilityWarnings.length > 0 && (
          <div className="mb-3 p-3 rounded-[12px] bg-orange-500/15 border border-orange-400/40 space-y-1">
            {compatibilityWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                <span className="text-[12px] text-orange-300" style={{ fontWeight: 600 }}>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Vehicle Compatibility Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {job.vehicleInfo.transmissionType === 'manual' && (
            <div className="px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/40">
              <span className="text-[11px] text-purple-300" style={{ fontWeight: 600 }}>🔧 Manual</span>
            </div>
          )}
          {job.vehicleInfo.transmissionType === 'ev' && (
            <div className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40">
              <span className="text-[11px] text-cyan-300" style={{ fontWeight: 600 }}>⚡ EV</span>
            </div>
          )}
          {job.vehicleInfo.trunkCategory === 'frunk_only' && (
            <div className="px-2.5 py-1 rounded-full bg-orange-500/20 border border-orange-400/40">
              <span className="text-[11px] text-orange-300" style={{ fontWeight: 600 }}>🏎️ Frunk Only</span>
            </div>
          )}
          {job.vehicleInfo.trunkCategory === 'none' && (
            <div className="px-2.5 py-1 rounded-full bg-red-500/20 border border-red-400/40">
              <span className="text-[11px] text-red-300" style={{ fontWeight: 600 }}>🚫 No Trunk</span>
            </div>
          )}
        </div>

        {/* Priority Badge */}
        {job.priority !== 'standard' && (
          <div className="flex items-center gap-2 mb-3">
            {getPriorityIcon(job.priority)}
            <span className={`text-[13px] ${
              job.priority === 'vip' ? 'text-purple-300' : 'text-cyan-300'
            }`} style={{ fontWeight: 600 }}>
              {job.priority.toUpperCase()}
            </span>
          </div>
        )}

        {/* Customer & Vehicle Info */}
        <div className="mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[20px] text-white mb-1" style={{ fontWeight: 600 }}>
                {job.customerName}
              </h3>
              <div className="flex items-center gap-2 text-[15px] text-white/90">
                <Car className="w-4 h-4" strokeWidth={2.5} />
                <span style={{ fontWeight: 500 }}>
                  {job.vehicleInfo.year} {job.vehicleInfo.make} {job.vehicleInfo.model}
                </span>
              </div>
              <div className="text-[13px] text-white/70 mt-1" style={{ fontWeight: 400 }}>
                {job.vehicleInfo.color} • {job.vehicleInfo.plate}
              </div>
            </div>

            {/* Earnings Badge */}
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-400/30">
                <DollarSign className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                <span className="text-[15px] text-green-300" style={{ fontWeight: 700 }}>
                  ${job.earnings}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-white/60 mt-1">
                <Clock className="w-3 h-3" strokeWidth={2.5} />
                <span>{job.estimatedDuration} min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="space-y-3 mb-4">
          {/* Pickup */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border-2 border-cyan-400/50 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <div className="text-[13px] text-cyan-300 mb-0.5" style={{ fontWeight: 600 }}>
                PICKUP
              </div>
              <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                {job.pickupLocation.name}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                {job.pickupLocation.address}
              </div>
              {job.pickupLocation.instructions && (
                <div className="text-[12px] text-white/60 mt-1 italic">
                  {job.pickupLocation.instructions}
                </div>
              )}
            </div>
          </div>

          {/* Delivery */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 border-2 border-purple-400/50 flex items-center justify-center flex-shrink-0">
              <Navigation className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <div className="text-[13px] text-purple-300 mb-0.5" style={{ fontWeight: 600 }}>
                DELIVERY
              </div>
              <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                {job.deliveryLocation.name}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                {job.deliveryLocation.address}
              </div>
              {job.deliveryLocation.instructions && (
                <div className="text-[12px] text-white/60 mt-1 italic">
                  {job.deliveryLocation.instructions}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {job.specialInstructions && (
          <div className="mb-4 p-3 rounded-[12px] bg-yellow-500/10 border border-yellow-400/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
              <div className="text-[13px] text-yellow-300" style={{ fontWeight: 500 }}>
                {job.specialInstructions}
              </div>
            </div>
          </div>
        )}

        {/* Add-on Services */}
        {job.addonServices && job.addonServices.length > 0 && (
          <div className="mb-4 p-4 rounded-[12px] bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-400/30">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-purple-400" strokeWidth={2.5} />
              <span className="text-[14px] text-purple-300" style={{ fontWeight: 600 }}>
                Optional Add-on Services
              </span>
            </div>
            
            <div className="space-y-2">
              {job.addonServices.map((addon) => {
                const Icon = ADDON_ICONS[addon.id] || Package;
                const isRequested = addon.status === 'requested';
                const isAccepted = addon.status === 'accepted';
                const isDeclined = addon.status === 'declined';
                
                return (
                  <div
                    key={addon.id}
                    className={`p-3 rounded-[10px] ${
                      isAccepted 
                        ? 'bg-green-500/20 border border-green-400/40'
                        : isDeclined
                        ? 'bg-red-500/10 border border-red-400/30'
                        : 'bg-[#2C2C2E]/60 border border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          isAccepted 
                            ? 'bg-green-500/30'
                            : isDeclined
                            ? 'bg-red-500/20'
                            : 'bg-purple-500/30'
                        }`}>
                          <Icon className={`w-4 h-4 ${
                            isAccepted 
                              ? 'text-green-300'
                              : isDeclined
                              ? 'text-red-300'
                              : 'text-purple-300'
                          }`} strokeWidth={2.5} />
                        </div>
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          {addon.name}
                        </span>
                      </div>
                      <span className={`text-[14px] ${
                        isAccepted ? 'text-green-300' : 'text-purple-300'
                      }`} style={{ fontWeight: 700 }}>
                        +${addon.price}
                      </span>
                    </div>

                    {/* Response buttons for requested addons */}
                    {isRequested && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <motion.button
                          onClick={() => handleAddonResponse(job.id, addon.id, false)}
                          className="px-3 py-1.5 rounded-[8px] bg-red-500/20 border border-red-400/40 flex items-center justify-center gap-1"
                          whileTap={{ scale: 0.95 }}
                          transition={springConfig}
                        >
                          <X className="w-3.5 h-3.5 text-red-300" strokeWidth={2.5} />
                          <span className="text-[12px] text-red-200" style={{ fontWeight: 600 }}>
                            Decline
                          </span>
                        </motion.button>

                        <motion.button
                          onClick={() => handleAddonResponse(job.id, addon.id, true)}
                          className="px-3 py-1.5 rounded-[8px] bg-green-500/20 border border-green-400/40 flex items-center justify-center gap-1"
                          whileTap={{ scale: 0.95 }}
                          transition={springConfig}
                        >
                          <Check className="w-3.5 h-3.5 text-green-300" strokeWidth={2.5} />
                          <span className="text-[12px] text-green-200" style={{ fontWeight: 600 }}>
                            Accept
                          </span>
                        </motion.button>
                      </div>
                    )}

                    {/* Status indicators */}
                    {isAccepted && (
                      <div className="flex items-center gap-1 mt-2">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" strokeWidth={2.5} />
                        <span className="text-[11px] text-green-300" style={{ fontWeight: 600 }}>
                          Accepted - Will complete
                        </span>
                      </div>
                    )}

                    {isDeclined && (
                      <div className="flex items-center gap-1 mt-2">
                        <XCircle className="w-3.5 h-3.5 text-red-400" strokeWidth={2.5} />
                        <span className="text-[11px] text-red-300" style={{ fontWeight: 600 }}>
                          Declined
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total addon earnings */}
            {job.addonServices.some(a => a.status === 'accepted') && (
              <div className="mt-3 pt-3 border-t border-purple-400/30">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-purple-200" style={{ fontWeight: 500 }}>
                    Add-ons Bonus
                  </span>
                  <span className="text-[15px] text-green-400" style={{ fontWeight: 700 }}>
                    +${job.addonServices
                      .filter(a => a.status === 'accepted')
                      .reduce((sum, a) => sum + a.price, 0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {isPending && (
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              onClick={() => handleDeclineJob(job.id)}
              className="px-4 py-3 rounded-[14px] bg-red-500/20 border-2 border-red-400/50 flex items-center justify-center gap-2"
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
            >
              <XCircle className="w-5 h-5 text-red-400" strokeWidth={2.5} />
              <span className="text-[15px] text-red-300" style={{ fontWeight: 600 }}>
                Decline
              </span>
            </motion.button>

            <motion.button
              onClick={() => !isBlocked && handleAcceptJob(job.id)}
              disabled={isBlocked}
              className={`px-4 py-3 rounded-[14px] border-2 flex items-center justify-center gap-2 ${
                isBlocked
                  ? 'bg-white/5 border-white/20 opacity-50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500/30 to-emerald-500/30 border-green-400/50'
              }`}
              whileTap={isBlocked ? {} : { scale: 0.95 }}
              transition={springConfig}
            >
              <CheckCircle className={`w-5 h-5 ${isBlocked ? 'text-white/40' : 'text-green-300'}`} strokeWidth={2.5} />
              <span className={`text-[15px] ${isBlocked ? 'text-white/40' : 'text-green-200'}`} style={{ fontWeight: 600 }}>
                {isBlocked ? 'Not Eligible' : 'Accept'}
              </span>
            </motion.button>
          </div>
        )}

        {isAccepted && (
          <motion.button
            className="w-full px-4 py-3 rounded-[14px] bg-gradient-to-r from-purple-500/30 to-cyan-500/30 border-2 border-white/30 flex items-center justify-center gap-2"
            whileTap={{ scale: 0.95 }}
            transition={springConfig}
          >
            <Navigation className="w-5 h-5 text-white" strokeWidth={2.5} />
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              Start Navigation
            </span>
          </motion.button>
        )}

        {/* Job Info Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
          <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
            {job.distance} mi • {job.estimatedDuration} min
          </div>
          <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
            {new Date(job.requestTime).toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit' 
            })}
          </div>
        </div>
      </motion.div>
    );
  };

  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const acceptedJobs = jobs.filter(j => j.status === 'accepted');

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <motion.div
        className="grid grid-cols-2 gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl">
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            Pending
          </div>
          <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>
            {pendingJobs.length}
          </div>
        </div>

        <div className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl">
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            In Progress
          </div>
          <div className="text-[28px] text-white" style={{ fontWeight: 700 }}>
            {acceptedJobs.length}
          </div>
        </div>
      </motion.div>

      {/* Pending Jobs */}
      {pendingJobs.length > 0 && (
        <div>
          <h2 className="text-[20px] text-white mb-3 px-1" style={{ fontWeight: 600 }}>
            New Requests
          </h2>
          {pendingJobs.map((job, index) => renderJobCard(job, index))}
        </div>
      )}

      {/* Accepted Jobs */}
      {acceptedJobs.length > 0 && (
        <div>
          <h2 className="text-[20px] text-white mb-3 px-1" style={{ fontWeight: 600 }}>
            In Progress
          </h2>
          {acceptedJobs.map((job, index) => renderJobCard(job, index + pendingJobs.length))}
        </div>
      )}

      {/* Empty State */}
      {jobs.length === 0 && (
        <motion.div
          className="rounded-[20px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springConfig}
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border-2 border-white/30 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-white/70" strokeWidth={2.5} />
          </div>
          <h3 className="text-[20px] text-white mb-2" style={{ fontWeight: 600 }}>
            No Active Jobs
          </h3>
          <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
            You're all caught up! New valet requests will appear here.
          </p>
        </motion.div>
      )}
    </div>
  );
}
