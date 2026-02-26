import { motion, AnimatePresence } from 'motion/react';
import { Camera, Check, AlertCircle, MapPin, Clock, X, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface PhotoRequirement {
  id: string;
  label: string;
  description: string;
  captured: boolean;
  timestamp?: string;
  location?: { lat: number; lng: number };
}

interface VehiclePhotoVerificationProps {
  isDarkMode: boolean;
  vehicleInfo: {
    make: string;
    model: string;
    color: string;
    plate: string;
  };
  phase: 'pickup' | 'delivery';
  onComplete: (photos: PhotoRequirement[]) => void;
  onSkip?: () => void;
}

export function VehiclePhotoVerification({
  isDarkMode,
  vehicleInfo,
  phase,
  onComplete,
  onSkip
}: VehiclePhotoVerificationProps) {
  const [photos, setPhotos] = useState<PhotoRequirement[]>([
    { id: 'front', label: 'Front View', description: 'Full front of vehicle including license plate', captured: false },
    { id: 'rear', label: 'Rear View', description: 'Full rear of vehicle including plate', captured: false },
    { id: 'driver_side', label: 'Driver Side', description: 'Full driver side view', captured: false },
    { id: 'passenger_side', label: 'Passenger Side', description: 'Full passenger side view', captured: false },
    { id: 'dashboard', label: 'Dashboard', description: 'Showing mileage and fuel level', captured: false },
  ]);

  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleCapturePhoto = (photoId: string) => {
    // Simulate photo capture with timestamp and geolocation
    const timestamp = new Date().toISOString();
    const location = { lat: 37.7749 + Math.random() * 0.01, lng: -122.4194 + Math.random() * 0.01 };

    setPhotos(photos.map(photo => 
      photo.id === photoId 
        ? { ...photo, captured: true, timestamp, location }
        : photo
    ));

    // Move to next photo
    if (currentPhotoIndex < photos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const allPhotosCaptured = photos.every(p => p.captured);
  const currentPhoto = photos[currentPhotoIndex];

  return (
    <motion.div
      className="fixed inset-0 z-[90] bg-[#000000]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-[393px] mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-b-2 border-white/30 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                {phase === 'pickup' ? 'Pre-Service' : 'Post-Service'} Photo Verification
              </h2>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                {vehicleInfo.color} {vehicleInfo.make} {vehicleInfo.model}
              </p>
            </div>
            {onSkip && (
              <motion.button
                onClick={onSkip}
                className="w-9 h-9 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center"
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-5 h-5 text-white" strokeWidth={2.5} />
              </motion.button>
            )}
          </div>

          {/* Importance Notice */}
          <div className="p-3 rounded-[12px] bg-cyan-500/20 border border-cyan-400/40">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
              <div>
                <p className="text-[13px] text-cyan-200 mb-1" style={{ fontWeight: 600 }}>
                  Required for Liability Protection
                </p>
                <p className="text-[12px] text-cyan-100/80" style={{ fontWeight: 400 }}>
                  Time-stamped, geo-located photos protect you from false damage claims. This is your proof of vehicle condition.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex-shrink-0 px-4 py-3 bg-[#1C1C1E]/60 border-b border-white/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
              Photo {photos.filter(p => p.captured).length} of {photos.length}
            </span>
            <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
              {Math.round((photos.filter(p => p.captured).length / photos.length) * 100)}% Complete
            </span>
          </div>
          <div className="flex gap-1">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`h-1.5 flex-1 rounded-full ${
                  photo.captured
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Camera View / Photo List */}
        <div className="flex-1 overflow-y-auto p-4">
          {!allPhotosCaptured ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPhoto.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* Current Photo Requirement */}
                <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-purple-400/40">
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
                    <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      {currentPhoto.label}
                    </h3>
                  </div>
                  <p className="text-[14px] text-white/70" style={{ fontWeight: 400 }}>
                    {currentPhoto.description}
                  </p>
                </div>

                {/* Mock Camera View */}
                <div className="aspect-[3/4] rounded-[16px] bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-white/30 overflow-hidden relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-white/30 mx-auto mb-3" strokeWidth={1.5} />
                      <p className="text-[15px] text-white/50" style={{ fontWeight: 500 }}>
                        Camera View
                      </p>
                      <p className="text-[13px] text-white/30 mt-1" style={{ fontWeight: 400 }}>
                        Align vehicle {currentPhoto.label.toLowerCase()} in frame
                      </p>
                    </div>
                  </div>

                  {/* Alignment Guide */}
                  <div className="absolute inset-0 border-4 border-dashed border-white/20 m-8" />
                </div>

                {/* Capture Button */}
                <motion.button
                  onClick={() => handleCapturePhoto(currentPhoto.id)}
                  className="w-full py-4 rounded-[16px] bg-gradient-to-br from-cyan-500 to-blue-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
                  style={{ fontWeight: 600 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Camera className="w-5 h-5" strokeWidth={2.5} />
                    Capture {currentPhoto.label}
                  </span>
                </motion.button>

                {/* Tips */}
                <div className="p-3 rounded-[12px] bg-yellow-500/10 border border-yellow-400/30">
                  <p className="text-[12px] text-yellow-300" style={{ fontWeight: 500 }}>
                    💡 Tips: Ensure good lighting, capture entire vehicle panel, and include any existing damage in frame.
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            /* All Photos Captured - Review */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="p-4 rounded-[16px] bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-400/40 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" strokeWidth={2.5} />
                <h3 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>
                  All Photos Captured
                </h3>
                <p className="text-[14px] text-white/70" style={{ fontWeight: 400 }}>
                  Photos are time-stamped and geo-located for your protection
                </p>
              </div>

              {/* Photo Summary */}
              <div className="space-y-2">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="p-3 rounded-[12px] bg-[#1C1C1E]/80 border border-white/20"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 border-2 border-green-400/50 flex items-center justify-center">
                          <Check className="w-5 h-5 text-green-400" strokeWidth={2.5} />
                        </div>
                        <div>
                          <p className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                            {photo.label}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-white/60">
                            <Clock className="w-3 h-3" strokeWidth={2.5} />
                            <span style={{ fontWeight: 400 }}>
                              {photo.timestamp ? new Date(photo.timestamp).toLocaleTimeString() : 'N/A'}
                            </span>
                            <MapPin className="w-3 h-3 ml-1" strokeWidth={2.5} />
                            <span style={{ fontWeight: 400 }}>Verified</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Continue Button */}
              <motion.button
                onClick={() => onComplete(photos)}
                className="w-full py-4 rounded-[16px] bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target"
                style={{ fontWeight: 600 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                Continue to Service
              </motion.button>
            </motion.div>
          )}
        </div>

        {/* Photo List Quick View */}
        {!allPhotosCaptured && (
          <div className="flex-shrink-0 border-t-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl p-3">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {photos.map((photo, index) => (
                <motion.button
                  key={photo.id}
                  onClick={() => setCurrentPhotoIndex(index)}
                  className={`flex-shrink-0 px-3 py-2 rounded-[10px] border-2 ${
                    currentPhotoIndex === index
                      ? 'border-purple-400 bg-purple-500/20'
                      : photo.captured
                      ? 'border-green-400/50 bg-green-500/10'
                      : 'border-white/30 bg-white/5'
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="flex items-center gap-2">
                    {photo.captured && (
                      <Check className="w-3.5 h-3.5 text-green-400" strokeWidth={2.5} />
                    )}
                    <span className={`text-[12px] ${
                      currentPhotoIndex === index ? 'text-purple-200' : 'text-white/70'
                    }`} style={{ fontWeight: 600 }}>
                      {photo.label}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
