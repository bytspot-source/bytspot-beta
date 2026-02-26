import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Car, Edit, Trash2, Camera, Save, X } from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner@2.0.3';

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
}

export function VehicleManagement({ isDarkMode, onBack }: VehicleManagementProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([
    {
      id: '1',
      type: 'sedan',
      make: 'Tesla',
      model: 'Model 3',
      year: 2023,
      color: 'Midnight Silver',
      licensePlate: '7ABC123',
    },
  ]);

  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    type: 'sedan' as Vehicle['type'],
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    licensePlate: '',
    photo: undefined as string | undefined,
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
    });
    setShowAddEdit(true);
  };

  const handleSave = () => {
    if (!formData.make || !formData.model || !formData.licensePlate) {
      toast.error('Please fill all required fields');
      return;
    }

    if (editingVehicle) {
      setVehicles(vehicles.map(v => 
        v.id === editingVehicle.id 
          ? { ...v, ...formData }
          : v
      ));
      toast.success('Vehicle updated');
    } else {
      const newVehicle: Vehicle = {
        id: Date.now().toString(),
        ...formData,
      };
      setVehicles([...vehicles, newVehicle]);
      toast.success('Vehicle added');
    }

    setShowAddEdit(false);
  };

  const handleDelete = (id: string) => {
    setVehicles(vehicles.filter(v => v.id !== id));
    toast.success('Vehicle removed');
  };

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
                  <p className="text-[15px] text-white/80 mb-2" style={{ fontWeight: 400 }}>
                    {vehicle.color}
                  </p>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 border border-white/30">
                    <span className="text-[13px] text-white" style={{ fontWeight: 600, letterSpacing: '0.05em' }}>
                      {vehicle.licensePlate}
                    </span>
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
