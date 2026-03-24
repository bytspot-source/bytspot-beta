import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Car, Edit, Trash2, Camera, Save, X, Search, Package, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import type { TransmissionType, TrunkCategory } from '../utils/valetMockData';
import { trpc } from '../utils/trpc';

interface VehicleManagementProps {
  isDarkMode: boolean;
  onBack: () => void;
}

interface Vehicle {
  id: string;
  type: 'sedan' | 'suv' | 'truck' | 'ev' | 'motorcycle';
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  photo?: string;
  vin?: string;
  transmissionType: TransmissionType;
  trunkCategory: TrunkCategory;
}

export function VehicleManagement({ isDarkMode, onBack }: VehicleManagementProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load vehicles from API on mount
  useEffect(() => {
    (async () => {
      try {
        const list = await trpc.user.vehicles.list.query();
        setVehicles((list ?? []) as Vehicle[]);
      } catch {
        // Fallback — API might not have vehicles column yet
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLookingUpVin, setIsLookingUpVin] = useState(false);
  const [formData, setFormData] = useState({
    type: 'sedan' as Vehicle['type'],
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    licensePlate: '',
    photo: undefined as string | undefined,
    vin: '',
    transmissionType: 'automatic' as TransmissionType,
    trunkCategory: 'full' as TrunkCategory,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const vehicleTypes = [
    { value: 'sedan', label: 'Sedan', color: 'from-blue-500/40 to-cyan-500/40' },
    { value: 'suv', label: 'SUV', color: 'from-green-500/40 to-emerald-500/40' },
    { value: 'truck', label: 'Truck', color: 'from-orange-500/40 to-red-500/40' },
    { value: 'ev', label: 'EV', color: 'from-purple-500/40 to-pink-500/40' },
    { value: 'motorcycle', label: 'Motorcycle', color: 'from-yellow-500/40 to-orange-500/40' },
  ];

  const getVehicleColor = (type: Vehicle['type']) => {
    return vehicleTypes.find(t => t.value === type)?.color || 'from-gray-500/40 to-gray-700/40';
  };

  const transmissionOptions: { value: TransmissionType; label: string; icon: string }[] = [
    { value: 'automatic', label: 'Automatic', icon: '🔄' },
    { value: 'manual', label: 'Manual', icon: '🔧' },
    { value: 'ev', label: 'EV / No Clutch', icon: '⚡' },
  ];

  const trunkOptions: { value: TrunkCategory; label: string; note: string; icon: string }[] = [
    { value: 'full', label: 'Full Trunk', note: '≥ 12 cu ft — fits standard e-bike', icon: '📦' },
    { value: 'compact', label: 'Compact Trunk', note: '7–11 cu ft — fits folded compact bike', icon: '🎒' },
    { value: 'frunk_only', label: 'Frunk Only', note: 'Mid-engine sports (Porsche 911, etc.)', icon: '🏎️' },
    { value: 'none', label: 'No Trunk', note: 'Roadster / convertible / motorcycle', icon: '🏍️' },
  ];

  const getTrunkBadge = (trunkCategory: TrunkCategory) => {
    switch (trunkCategory) {
      case 'full': return { label: 'Full Trunk', color: 'bg-green-500/20 border-green-400/50 text-green-300' };
      case 'compact': return { label: 'Compact Trunk', color: 'bg-yellow-500/20 border-yellow-400/50 text-yellow-300' };
      case 'frunk_only': return { label: 'Frunk Only', color: 'bg-orange-500/20 border-orange-400/50 text-orange-300' };
      case 'none': return { label: 'No Trunk', color: 'bg-red-500/20 border-red-400/50 text-red-300' };
    }
  };

  const getTransmissionBadge = (transmissionType: TransmissionType) => {
    switch (transmissionType) {
      case 'manual': return { label: '🔧 Manual', color: 'bg-purple-500/20 border-purple-400/50 text-purple-300' };
      case 'ev': return { label: '⚡ EV', color: 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' };
      default: return { label: '🔄 Auto', color: 'bg-white/10 border-white/30 text-white/70' };
    }
  };

  /** Stub: calls NHTSA vPIC API to decode VIN and auto-fill make/model/year */
  const handleVinLookup = async () => {
    if (!formData.vin || formData.vin.length !== 17) {
      toast.error('Invalid VIN', { description: 'VIN must be exactly 17 characters' });
      return;
    }
    setIsLookingUpVin(true);
    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${formData.vin}?format=json`
      );
      const data = await res.json();
      const result = data?.Results?.[0];
      if (result && result.Make) {
        const year = parseInt(result.ModelYear) || formData.year;
        const trType = result.TransmissionStyle?.toLowerCase().includes('manual') ? 'manual'
          : result.FuelTypePrimary?.toLowerCase().includes('electric') ? 'ev'
          : 'automatic';
        setFormData(prev => ({
          ...prev,
          make: result.Make || prev.make,
          model: result.Model || prev.model,
          year,
          transmissionType: trType as TransmissionType,
        }));
        toast.success('VIN decoded', { description: `${year} ${result.Make} ${result.Model}` });
      } else {
        toast.error('VIN not found', { description: 'Check the VIN and try again' });
      }
    } catch {
      toast.error('Lookup failed', { description: 'NHTSA API unavailable — fill in manually' });
    } finally {
      setIsLookingUpVin(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Invalid file format', { description: 'Please upload a JPG or PNG image' });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File too large', { description: 'Maximum file size is 5MB' });
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      setTimeout(() => {
        setFormData({ ...formData, photo: event.target?.result as string });
        setIsUploading(false);
        toast.success('Photo uploaded');
      }, 1000);
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = () => {
    setEditingVehicle(null);
    setFormData({
      type: 'sedan',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      color: '',
      licensePlate: '',
      photo: undefined,
      vin: '',
      transmissionType: 'automatic',
      trunkCategory: 'full',
    });
    setShowAddEdit(true);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      type: vehicle.type,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      licensePlate: vehicle.licensePlate,
      photo: vehicle.photo,
      vin: vehicle.vin || '',
      transmissionType: vehicle.transmissionType,
      trunkCategory: vehicle.trunkCategory,
    });
    setShowAddEdit(true);
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.make || !formData.model || !formData.licensePlate) {
      toast.error('Please fill all required fields');
      return;
    }

    setIsSaving(true);
    try {
      if (editingVehicle) {
        await trpc.user.vehicles.update.mutate({ id: editingVehicle.id, ...formData });
        setVehicles(vehicles.map(v =>
          v.id === editingVehicle.id ? { ...v, ...formData } : v
        ));
        toast.success('Vehicle updated');
      } else {
        const newVehicle = await trpc.user.vehicles.add.mutate(formData);
        setVehicles([...vehicles, newVehicle as Vehicle]);
        toast.success('Vehicle added');
      }
      setShowAddEdit(false);
    } catch (err: any) {
      toast.error('Save failed', { description: err?.message ?? 'Please try again' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await trpc.user.vehicles.remove.mutate({ id });
      setVehicles(vehicles.filter(v => v.id !== id));
      toast.success('Vehicle removed');
    } catch (err: any) {
      toast.error('Remove failed', { description: err?.message ?? 'Please try again' });
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (showAddEdit) {
    return (
      <div className="h-full overflow-y-auto pb-24">
        <motion.div
          className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <motion.button
            onClick={() => setShowAddEdit(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <h1 className="text-title-2 text-white">
            {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
          </h1>
        </motion.div>

        <div className="px-4 space-y-6">
          {/* Vehicle Photo */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.1 }}
          >
            <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
              Vehicle Photo (Optional)
            </h3>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                {formData.photo ? (
                  <img 
                    src={formData.photo} 
                    alt="Vehicle" 
                    className="w-24 h-24 rounded-[16px] object-cover border-2 border-white/30"
                  />
                ) : (
                  <div className={`w-24 h-24 rounded-[16px] bg-gradient-to-br ${getVehicleColor(formData.type)} border-2 border-white/30 flex items-center justify-center`}>
                    <Car className="w-12 h-12 text-white" strokeWidth={2} />
                  </div>
                )}
                
                {isUploading && (
                  <div className="absolute inset-0 rounded-[16px] bg-black/60 flex items-center justify-center">
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
                  className="w-full rounded-[16px] px-4 py-3 flex items-center justify-center gap-2 border-2 border-purple-500/50 bg-gradient-to-br from-purple-500/30 to-pink-500/30 text-white mb-2"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                  disabled={isUploading}
                >
                  <Camera className="w-5 h-5" strokeWidth={2.5} />
                  <span className="text-[15px]" style={{ fontWeight: 600 }}>
                    {isUploading ? 'Uploading...' : 'Upload Photo'}
                  </span>
                </motion.button>
                
                {formData.photo && (
                  <motion.button
                    onClick={() => setFormData({ ...formData, photo: undefined })}
                    className="w-full rounded-[16px] px-4 py-2 flex items-center justify-center gap-2 border-2 border-red-500/50 bg-red-500/20 text-white"
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                  >
                    <X className="w-4 h-4" strokeWidth={2.5} />
                    <span className="text-[13px]" style={{ fontWeight: 600 }}>
                      Remove
                    </span>
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Vehicle Type */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.15 }}
          >
            <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
              Vehicle Type *
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {vehicleTypes.map((type) => (
                <motion.button
                  key={type.value}
                  onClick={() => setFormData({ ...formData, type: type.value as Vehicle['type'] })}
                  className={`rounded-[16px] p-4 border-2 ${
                    formData.type === type.value
                      ? `bg-gradient-to-br ${type.color} border-white/50`
                      : 'bg-white/5 border-white/30'
                  }`}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <Car className="w-6 h-6 text-white mx-auto mb-2" strokeWidth={2.5} />
                  <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                    {type.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Vehicle Details */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.2 }}
          >
            <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
              Vehicle Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                  Make *
                </label>
                <input
                  type="text"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  placeholder="e.g., Tesla, Toyota, Ford"
                  className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white placeholder:text-white/40"
                  style={{ fontWeight: 400 }}
                />
              </div>

              <div>
                <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                  Model *
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g., Model 3, Camry, F-150"
                  className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white placeholder:text-white/40"
                  style={{ fontWeight: 400 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                    Year
                  </label>
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white"
                    style={{ fontWeight: 400 }}
                  />
                </div>

                <div>
                  <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                    Color
                  </label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="Black, White..."
                    className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white placeholder:text-white/40"
                    style={{ fontWeight: 400 }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                  License Plate *
                </label>
                <input
                  type="text"
                  value={formData.licensePlate}
                  onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value.toUpperCase() })}
                  placeholder="ABC1234"
                  className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[17px] outline-none text-white placeholder:text-white/40 uppercase"
                  style={{ fontWeight: 600, letterSpacing: '0.1em' }}
                />
              </div>

              {/* VIN Lookup */}
              <div>
                <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                  VIN (Optional — auto-fills details)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.vin}
                    onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                    placeholder="17-character VIN"
                    maxLength={17}
                    className="flex-1 rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[13px] outline-none text-white placeholder:text-white/40 uppercase"
                    style={{ fontWeight: 500, letterSpacing: '0.05em' }}
                  />
                  <motion.button
                    onClick={handleVinLookup}
                    disabled={isLookingUpVin}
                    className="px-4 py-3 rounded-[16px] border-2 border-cyan-400/50 bg-cyan-500/20 flex items-center gap-2"
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    {isLookingUpVin
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Search className="w-4 h-4 text-cyan-300" strokeWidth={2.5} />}
                  </motion.button>
                </div>
                <p className="text-[11px] text-white/40 mt-1" style={{ fontWeight: 400 }}>
                  Powered by NHTSA vPIC — decodes make, model, year &amp; transmission
                </p>
              </div>
            </div>
          </motion.div>

          {/* Transmission Type */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.25 }}
          >
            <h3 className="text-[17px] mb-1 text-white" style={{ fontWeight: 600 }}>
              Transmission Type *
            </h3>
            <p className="text-[12px] text-white/50 mb-4" style={{ fontWeight: 400 }}>
              Required for manual-certified driver matching
            </p>
            <div className="grid grid-cols-3 gap-3">
              {transmissionOptions.map((opt) => (
                <motion.button
                  key={opt.value}
                  onClick={() => setFormData({ ...formData, transmissionType: opt.value })}
                  className={`rounded-[16px] p-4 border-2 text-center ${
                    formData.transmissionType === opt.value
                      ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-white/50'
                      : 'bg-white/5 border-white/30'
                  }`}
                  whileTap={{ scale: 0.97 }}
                  transition={springConfig}
                >
                  <div className="text-[24px] mb-1">{opt.icon}</div>
                  <span className="text-[12px] text-white" style={{ fontWeight: 600 }}>{opt.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Trunk Space */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.3 }}
          >
            <h3 className="text-[17px] mb-1 text-white" style={{ fontWeight: 600 }}>
              Trunk Space *
            </h3>
            <p className="text-[12px] text-white/50 mb-4" style={{ fontWeight: 400 }}>
              Used to match drivers with compatible e-bikes
            </p>
            <div className="space-y-2">
              {trunkOptions.map((opt) => (
                <motion.button
                  key={opt.value}
                  onClick={() => setFormData({ ...formData, trunkCategory: opt.value })}
                  className={`w-full rounded-[16px] p-4 border-2 flex items-center gap-4 text-left ${
                    formData.trunkCategory === opt.value
                      ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/30 border-purple-400/60'
                      : 'bg-white/5 border-white/30'
                  }`}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <span className="text-[28px]">{opt.icon}</span>
                  <div>
                    <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>{opt.label}</div>
                    <div className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>{opt.note}</div>
                  </div>
                  {formData.trunkCategory === opt.value && (
                    <div className="ml-auto w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Save Button */}
          <motion.button
            onClick={handleSave}
            className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Save className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>
              {editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
            </span>
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-24">
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <h1 className="text-title-2 text-white">
            My Vehicles
          </h1>
        </div>

        <motion.button
          onClick={handleAdd}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      </motion.div>

      <div className="px-4 space-y-4">
        <AnimatePresence mode="popLayout">
          {vehicles.map((vehicle, index) => (
            <motion.div
              key={vehicle.id}
              layout
              className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ ...springConfig, delay: index * 0.05 }}
            >
              <div className="flex items-center gap-4">
                {vehicle.photo ? (
                  <img 
                    src={vehicle.photo} 
                    alt={`${vehicle.make} ${vehicle.model}`}
                    className="w-20 h-20 rounded-[12px] object-cover border-2 border-white/30"
                  />
                ) : (
                  <div className={`w-20 h-20 rounded-[12px] bg-gradient-to-br ${getVehicleColor(vehicle.type)} border-2 border-white/30 flex items-center justify-center flex-shrink-0`}>
                    <Car className="w-10 h-10 text-white" strokeWidth={2} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-[17px] mb-1 text-white truncate" style={{ fontWeight: 600 }}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </h3>
                  <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                    {vehicle.color}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/30">
                      <span className="text-[12px] text-white" style={{ fontWeight: 600, letterSpacing: '0.05em' }}>
                        {vehicle.licensePlate}
                      </span>
                    </div>
                    <div className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] ${getTransmissionBadge(vehicle.transmissionType).color}`} style={{ fontWeight: 600 }}>
                      {getTransmissionBadge(vehicle.transmissionType).label}
                    </div>
                    <div className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] ${getTrunkBadge(vehicle.trunkCategory).color}`} style={{ fontWeight: 600 }}>
                      {getTrunkBadge(vehicle.trunkCategory).label}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <motion.button
                    onClick={() => handleEdit(vehicle)}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500/20 border-2 border-blue-400/50 tap-target"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <Edit className="w-4 h-4 text-blue-400" strokeWidth={2.5} />
                  </motion.button>

                  <motion.button
                    onClick={() => handleDelete(vehicle.id)}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20 border-2 border-red-400/50 tap-target"
                    whileTap={{ scale: 0.9 }}
                    transition={springConfig}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {vehicles.length === 0 && (
          <motion.div
            className="rounded-[20px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springConfig}
          >
            <Car className="w-16 h-16 text-white/40 mx-auto mb-4" strokeWidth={1.5} />
            <h3 className="text-[17px] mb-2 text-white" style={{ fontWeight: 600 }}>
              No Vehicles Added
            </h3>
            <p className="text-[15px] text-white/80" style={{ fontWeight: 400 }}>
              Add your vehicle to enable smart parking features
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
