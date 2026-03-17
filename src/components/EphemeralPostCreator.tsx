import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Camera, Video, Image as ImageIcon, Sparkles, 
  MapPin, Send, Type, Smile, Zap, Heart, Flame,
  Music, Users, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import { ImageWithFallback } from './figma/ImageWithFallback';

type MediaType = 'photo' | 'video' | 'none';
type PostMode = 'camera' | 'preview' | 'posting';

interface EphemeralPostCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  venueName?: string;
  venueId?: number;
  isDarkMode: boolean;
  onPostCreated?: (post: any) => void;
}

const STICKERS = [
  { icon: Heart, label: 'Love it!', color: '#EF4444' },
  { icon: Flame, label: 'Fire!', color: '#F59E0B' },
  { icon: Sparkles, label: 'Amazing', color: '#A855F7' },
  { icon: Music, label: 'Great music', color: '#06B6D4' },
  { icon: Users, label: 'Fun crowd', color: '#10B981' },
  { icon: Zap, label: 'High energy', color: '#F97316' },
];

export function EphemeralPostCreator({ 
  isOpen, 
  onClose, 
  venueName, 
  venueId,
  isDarkMode,
  onPostCreated 
}: EphemeralPostCreatorProps) {
  const [mode, setMode] = useState<PostMode>('camera');
  const [mediaType, setMediaType] = useState<MediaType>('none');
  const [capturedMedia, setCapturedMedia] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedStickers, setSelectedStickers] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  // Initialize camera
  useEffect(() => {
    if (isOpen && mode === 'camera') {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, cameraFacing]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isRecording]);

  const startCamera = async () => {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Camera Not Supported', {
        description: 'Your browser does not support camera access',
        duration: 4000,
      });
      setTimeout(() => onClose(), 1000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing, width: 1080, height: 1920 },
        audio: true,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error: any) {
      // Silently handle camera errors - don't log to console to avoid noise
      let errorMessage = 'Please allow camera access to post';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please enable camera in your browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application';
      }
      
      toast.error('Camera Access Required', {
        description: errorMessage,
        duration: 4000,
      });
      
      // Close the creator if camera fails
      setTimeout(() => {
        onClose();
      }, 4000);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const flipCamera = () => {
    triggerHaptic();
    stopCamera();
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    triggerHaptic();
    
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const photoUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedMedia(photoUrl);
      setMediaType('photo');
      setMode('preview');
      stopCamera();
    }
  };

  const startRecording = () => {
    triggerHaptic();
    
    if (!streamRef.current) return;

    chunksRef.current = [];
    
    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp8,opus',
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setCapturedMedia(videoUrl);
        setMediaType('video');
        setMode('preview');
        stopCamera();
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Recording Failed', {
        description: 'Unable to record video',
        duration: 2000,
      });
    }
  };

  const stopRecording = () => {
    triggerHaptic();
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleSticker = (index: number) => {
    triggerHaptic();
    setSelectedStickers(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handlePost = () => {
    triggerHaptic();
    setMode('posting');

    // Simulate posting story
    setTimeout(() => {
      const newPost = {
        id: Date.now(),
        type: mediaType,
        url: capturedMedia,
        thumbnail: capturedMedia,
        caption,
        timestamp: 'Just now',
        uploadedBy: 'user',
        venueId,
        venueName,
        stickers: selectedStickers.map(i => STICKERS[i].label),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      if (onPostCreated) {
        onPostCreated(newPost);
      }

      toast.success('Story Shared!', {
        description: venueName ? `Tagged at ${venueName} • Live for 24hrs` : 'Your story is live for 24 hours',
        duration: 3000,
      });

      handleClose();
    }, 1500);
  };

  const handleClose = () => {
    stopCamera();
    setMode('camera');
    setMediaType('none');
    setCapturedMedia(null);
    setCaption('');
    setSelectedStickers([]);
    setIsRecording(false);
    setRecordingTime(0);
    onClose();
  };

  const retake = () => {
    triggerHaptic();
    setCapturedMedia(null);
    setMediaType('none');
    setCaption('');
    setSelectedStickers([]);
    setMode('camera');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Camera Mode */}
          {mode === 'camera' && (
            <>
              {/* Camera Preview */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Top Bar */}
              <div className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center justify-between">
                  <motion.button
                    onClick={handleClose}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/30 flex items-center justify-center"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>

                  <motion.button
                    onClick={flipCamera}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/30 flex items-center justify-center"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <RefreshCw className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>

                {venueName && (
                  <motion.div
                    className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-cyan-500/30 to-blue-500/30 backdrop-blur-xl border-2 border-cyan-400 w-fit"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springConfig, delay: 0.2 }}
                  >
                    <MapPin className="w-5 h-5 text-cyan-300" strokeWidth={2.5} />
                    <span className="text-[14px] text-white" style={{ fontWeight: 700 }}>
                      📍 {venueName}
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Recording Timer */}
              {isRecording && (
                <motion.div
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-10"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={springConfig}
                >
                  <div className="px-4 py-2 rounded-full bg-red-500/90 backdrop-blur-xl border border-red-400 flex items-center gap-2">
                    <motion.div
                      className="w-3 h-3 rounded-full bg-white"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                    <span className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                      {recordingTime}s / 30s
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Bottom Controls */}
              <div className="absolute bottom-0 left-0 right-0 z-10 p-8 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center justify-center gap-8">
                  {/* Photo Button */}
                  {!isRecording && (
                    <motion.button
                      onClick={capturePhoto}
                      className="w-20 h-20 rounded-full bg-white border-4 border-white/30"
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                    />
                  )}

                  {/* Video Button */}
                  <motion.button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${
                      isRecording 
                        ? 'bg-red-500 border-red-400' 
                        : 'bg-transparent border-white/30'
                    }`}
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    {isRecording ? (
                      <div className="w-6 h-6 bg-white rounded-sm" />
                    ) : (
                      <div className="w-12 h-12 bg-red-500 rounded-full" />
                    )}
                  </motion.button>
                </div>

                <div className="text-center mt-4">
                  <p className="text-[13px] text-white/80" style={{ fontWeight: 500 }}>
                    {isRecording ? 'Tap to stop recording' : 'Tap circle for photo, red for video'}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Preview Mode */}
          {mode === 'preview' && capturedMedia && (
            <>
              {/* Preview Content */}
              <div className="absolute inset-0">
                {mediaType === 'photo' ? (
                  <ImageWithFallback
                    src={capturedMedia}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={capturedMedia}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Top Bar */}
              <div className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <motion.button
                    onClick={retake}
                    className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/30 flex items-center gap-2"
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <RefreshCw className="w-4 h-4 text-white" strokeWidth={2.5} />
                    <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                      Retake
                    </span>
                  </motion.button>

                  <motion.button
                    onClick={handleClose}
                    className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/30 flex items-center justify-center"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>

              {/* Stickers */}
              <div className="absolute top-24 left-0 right-0 z-10 px-6">
                <div className="flex flex-wrap gap-2 justify-center">
                  {STICKERS.map((sticker, index) => {
                    const Icon = sticker.icon;
                    const isSelected = selectedStickers.includes(index);
                    
                    return (
                      <motion.button
                        key={index}
                        onClick={() => toggleSticker(index)}
                        className={`px-3 py-2 rounded-full backdrop-blur-xl border-2 flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-white/30 border-white'
                            : 'bg-black/40 border-white/30'
                        }`}
                        whileTap={{ scale: 0.95 }}
                        transition={springConfig}
                        style={{
                          backgroundColor: isSelected ? `${sticker.color}40` : undefined,
                          borderColor: isSelected ? sticker.color : undefined,
                        }}
                      >
                        <Icon 
                          className="w-4 h-4" 
                          style={{ color: isSelected ? sticker.color : 'white' }}
                          strokeWidth={2.5}
                        />
                        <span 
                          className="text-[12px]"
                          style={{ 
                            fontWeight: 600,
                            color: isSelected ? sticker.color : 'white',
                          }}
                        >
                          {sticker.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Caption Input */}
              <div className="absolute bottom-32 left-0 right-0 z-10 px-6">
                <div className="relative">
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    maxLength={100}
                    className="w-full px-4 py-3 rounded-[16px] bg-black/60 backdrop-blur-xl border-2 border-white/30 text-white placeholder:text-white/60 text-[15px] outline-none"
                    style={{ fontWeight: 500 }}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Type className="w-4 h-4 text-white/60" strokeWidth={2.5} />
                  </div>
                </div>
                <div className="text-right mt-2">
                  <span className="text-[11px] text-white/60" style={{ fontWeight: 500 }}>
                    {caption.length}/100
                  </span>
                </div>
              </div>

              {/* Share Story Button */}
              <div className="absolute bottom-0 left-0 right-0 z-10 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <motion.button
                  onClick={handlePost}
                  className="w-full py-4 rounded-[16px] bg-gradient-to-r from-purple-500 to-pink-500 border-2 border-white/40 flex items-center justify-center gap-2"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <Send className="w-5 h-5 text-white" strokeWidth={2.5} />
                  <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                    Share Story
                  </span>
                </motion.button>

                <div className="text-center mt-3 space-y-2">
                  {venueName && (
                    <div className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-cyan-500/20 border border-cyan-400/40 w-fit mx-auto">
                      <MapPin className="w-4 h-4 text-cyan-400" strokeWidth={2.5} />
                      <p className="text-[14px] text-cyan-100" style={{ fontWeight: 700 }}>
                        📍 {venueName}
                      </p>
                    </div>
                  )}
                  <p className="text-[12px] text-white/70" style={{ fontWeight: 500 }}>
                    {venueName ? 'Help this venue get discovered • ' : ''}24hr story
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Posting Mode */}
          {mode === 'posting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-center">
                <motion.div
                  className="w-20 h-20 mx-auto mb-4"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <div className="w-20 h-20 rounded-full border-4 border-purple-500/30 border-t-purple-500" />
                </motion.div>
                <h3 className="text-[20px] text-white mb-2" style={{ fontWeight: 700 }}>
                  Sharing Story...
                </h3>
                <p className="text-[14px] text-white/70" style={{ fontWeight: 500 }}>
                  {venueName ? `Tagging ${venueName}` : 'Posting your story'}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
