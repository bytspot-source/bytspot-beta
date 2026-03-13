import { motion } from 'motion/react';
import { ArrowLeft, Car, IdCard, Shield, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { mockDriverProfile } from '../../../utils/valetMockData';

interface DriverVehicleEditProps {
  isDarkMode: boolean;
  onBack: () => void;
}

interface VehicleForm {
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
}

interface LicenseForm {
  number: string;
  state: string;
  expiryDate: string;
}

interface InsuranceForm {
  provider: string;
  policyNumber: string;
  expiryDate: string;
}

const inputClass =
  'w-full rounded-[12px] px-4 py-3 bg-[#2C2C2E]/80 border-2 border-white/20 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/60 transition-colors';
const labelClass = 'text-[12px] text-white/50 mb-1 block';

export function DriverVehicleEdit({ isDarkMode, onBack }: DriverVehicleEditProps) {
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

  const [vehicle, setVehicle] = useState<VehicleForm>({
    make: mockDriverProfile.vehicleInfo.make,
    model: mockDriverProfile.vehicleInfo.model,
    year: String(mockDriverProfile.vehicleInfo.year),
    color: mockDriverProfile.vehicleInfo.color,
    plate: mockDriverProfile.vehicleInfo.plate,
  });

  const [license, setLicense] = useState<LicenseForm>({
    number: mockDriverProfile.licenseInfo.number,
    state: mockDriverProfile.licenseInfo.state,
    expiryDate: mockDriverProfile.licenseInfo.expiryDate,
  });

  const [insurance, setInsurance] = useState<InsuranceForm>({
    provider: mockDriverProfile.insurance.provider,
    policyNumber: mockDriverProfile.insurance.policyNumber,
    expiryDate: mockDriverProfile.insurance.expiryDate,
  });

  const handleSave = () => {
    if (!vehicle.make || !vehicle.model || !vehicle.plate) {
      toast.error('Missing fields', { description: 'Make, model, and plate are required' });
      return;
    }
    if (!license.number || !license.state) {
      toast.error('Missing fields', { description: 'License number and state are required' });
      return;
    }
    toast.success('Vehicle info saved', { description: `${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.plate}` });
    onBack();
  };

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <motion.button onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }} transition={springConfig}>
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <div>
          <h1 className="text-title-2 text-white">Vehicle &amp; Documents</h1>
          <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>Update your vehicle and credentials</p>
        </div>
      </motion.div>

      <div className="px-4 space-y-5">
        {/* Vehicle Section */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
          <div className="flex items-center gap-2 mb-4">
            <Car className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Your Vehicle</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Make *</label>
              <input className={inputClass} value={vehicle.make} onChange={e => setVehicle({ ...vehicle, make: e.target.value })} placeholder="Toyota" />
            </div>
            <div>
              <label className={labelClass}>Model *</label>
              <input className={inputClass} value={vehicle.model} onChange={e => setVehicle({ ...vehicle, model: e.target.value })} placeholder="Camry" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>Year</label>
              <input className={inputClass} value={vehicle.year} onChange={e => setVehicle({ ...vehicle, year: e.target.value })} placeholder="2023" type="number" />
            </div>
            <div>
              <label className={labelClass}>Color</label>
              <input className={inputClass} value={vehicle.color} onChange={e => setVehicle({ ...vehicle, color: e.target.value })} placeholder="Silver" />
            </div>
          </div>
          <div>
            <label className={labelClass}>License Plate *</label>
            <input className={`${inputClass} uppercase`} value={vehicle.plate} onChange={e => setVehicle({ ...vehicle, plate: e.target.value.toUpperCase() })} placeholder="VLT 789" />
          </div>
        </motion.div>

        {/* Driver's License Section */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-4">
            <IdCard className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Driver's License</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={labelClass}>License # *</label>
              <input className={inputClass} value={license.number} onChange={e => setLicense({ ...license, number: e.target.value })} placeholder="D1234567" />
            </div>
            <div>
              <label className={labelClass}>State *</label>
              <input className={inputClass} value={license.state} onChange={e => setLicense({ ...license, state: e.target.value.toUpperCase() })} placeholder="CA" maxLength={2} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Expiry Date</label>
            <input className={inputClass} value={license.expiryDate} onChange={e => setLicense({ ...license, expiryDate: e.target.value })} type="date" />
          </div>
        </motion.div>

        {/* Insurance Section */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.15 }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-green-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Insurance</h3>
          </div>
          <div className="mb-3">
            <label className={labelClass}>Provider</label>
            <input className={inputClass} value={insurance.provider} onChange={e => setInsurance({ ...insurance, provider: e.target.value })} placeholder="Bytspot Valet Insurance" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Policy Number</label>
              <input className={inputClass} value={insurance.policyNumber} onChange={e => setInsurance({ ...insurance, policyNumber: e.target.value })} placeholder="BYT-VLT-123456" />
            </div>
            <div>
              <label className={labelClass}>Expiry Date</label>
              <input className={inputClass} value={insurance.expiryDate} onChange={e => setInsurance({ ...insurance, expiryDate: e.target.value })} type="date" />
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          className="w-full py-4 rounded-[16px] flex items-center justify-center gap-3 bg-cyan-500 hover:bg-cyan-400 transition-colors shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.2 }}
          whileTap={{ scale: 0.97 }}>
          <Save className="w-5 h-5 text-black" strokeWidth={2.5} />
          <span className="text-[16px] text-black" style={{ fontWeight: 700 }}>Save Vehicle & Documents</span>
        </motion.button>
      </div>
    </div>
  );
}

