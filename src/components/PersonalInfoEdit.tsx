import { motion } from 'motion/react';
import { ArrowLeft, Camera, User, Mail, Phone, MapPin, Calendar, Save, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { trpc } from '../utils/trpc';

interface PersonalInfoEditProps {
  isDarkMode: boolean;
  onBack: () => void;
}

export function PersonalInfoEdit({ isDarkMode, onBack }: PersonalInfoEditProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    birthday: '',
  });

  // Load profile from API on mount
  useEffect(() => {
    (async () => {
      try {
        const profile = await trpc.user.profile.get.query();
        const nameParts = (profile.name ?? '').split(' ');
        setFormData({
          firstName: nameParts[0] ?? '',
          lastName: nameParts.slice(1).join(' ') ?? '',
          email: profile.email ?? '',
          phone: profile.phone ?? '',
          address: profile.address ?? '',
          birthday: profile.birthday ?? '',
        });
        if (profile.profileImage) setProfileImage(profile.profileImage);
      } catch {
        // Fallback — user might not have profile data yet
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Invalid file format', {
        description: 'Please upload a JPG or PNG image',
      });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File too large', {
        description: 'Maximum file size is 5MB',
      });
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setProfileImage(dataUrl);
      setIsUploading(false);
      toast.success('Photo ready — save to persist');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(' ');
      await trpc.user.profile.update.mutate({
        name: fullName || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        birthday: formData.birthday || undefined,
        profileImage: profileImage || undefined,
      });
      toast.success('Profile updated', { description: 'Your changes have been saved' });
      setTimeout(() => onBack(), 800);
    } catch (err: any) {
      toast.error('Save failed', { description: err?.message ?? 'Please try again' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <motion.button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <h1 className="text-title-2 text-white">
          Personal Information
        </h1>
      </motion.div>

      <div className="px-4 space-y-6">
        {/* Profile Photo */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
            Profile Photo
          </h3>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              {profileImage ? (
                <img 
                  src={profileImage} 
                  alt="Profile" 
                  className="w-24 h-24 rounded-full object-cover border-2 border-white/30"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border-2 border-white/30">
                  <User className="w-12 h-12 text-white" strokeWidth={2} />
                </div>
              )}
              
              {isUploading && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              <motion.button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-[16px] px-4 py-3 flex items-center justify-center gap-2 border-2 border-purple-500/50 bg-gradient-to-br from-purple-500/30 to-pink-500/30 text-white"
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
                disabled={isUploading}
              >
                <Camera className="w-5 h-5" strokeWidth={2.5} />
                <span className="text-[15px]" style={{ fontWeight: 600 }}>
                  {isUploading ? 'Uploading...' : 'Change Photo'}
                </span>
              </motion.button>
              
              <p className="text-[12px] text-white/60 mt-2 text-center" style={{ fontWeight: 400 }}>
                JPG or PNG, max 5MB
              </p>
            </div>
          </div>
        </motion.div>

        {/* Basic Information */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
            Basic Information
          </h3>
          
          <div className="space-y-4">
            {/* First Name */}
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                First Name
              </label>
              <div className="flex items-center gap-3 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5">
                <User className="w-5 h-5 text-white/60" strokeWidth={2} />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="flex-1 bg-transparent text-[15px] outline-none text-white"
                  style={{ fontWeight: 400 }}
                />
              </div>
            </div>

            {/* Last Name */}
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Last Name
              </label>
              <div className="flex items-center gap-3 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5">
                <User className="w-5 h-5 text-white/60" strokeWidth={2} />
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="flex-1 bg-transparent text-[15px] outline-none text-white"
                  style={{ fontWeight: 400 }}
                />
              </div>
            </div>

            {/* Birthday */}
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Birthday
              </label>
              <div className="flex items-center gap-3 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5">
                <Calendar className="w-5 h-5 text-white/60" strokeWidth={2} />
                <input
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  className="flex-1 bg-transparent text-[15px] outline-none text-white"
                  style={{ fontWeight: 400 }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Contact Information */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
            Contact Information
          </h3>
          
          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Email Address
              </label>
              <div className="flex items-center gap-3 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5">
                <Mail className="w-5 h-5 text-white/60" strokeWidth={2} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="flex-1 bg-transparent text-[15px] outline-none text-white"
                  style={{ fontWeight: 400 }}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Phone Number
              </label>
              <div className="flex items-center gap-3 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5">
                <Phone className="w-5 h-5 text-white/60" strokeWidth={2} />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="flex-1 bg-transparent text-[15px] outline-none text-white"
                  style={{ fontWeight: 400 }}
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                Address
              </label>
              <div className="flex items-center gap-3 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5">
                <MapPin className="w-5 h-5 text-white/60" strokeWidth={2} />
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="flex-1 bg-transparent text-[15px] outline-none text-white"
                  style={{ fontWeight: 400 }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl disabled:opacity-60"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" strokeWidth={2.5} />}
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </span>
        </motion.button>
      </div>
    </div>
  );
}
