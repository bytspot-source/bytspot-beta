import { BrandLogo, BrandLogotype } from './BrandLogo';

/**
 * BrandShowcase - Visual demonstration of brand consistency
 * Shows logo and wordmark using identical gradient colors
 * Use this component for brand documentation, style guides, or onboarding
 */
export function BrandShowcase() {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <BrandLogo size={200} animated={true} />
          
          <h1 className="text-[72px] tracking-tight text-brand-gradient" style={{ fontWeight: 700, letterSpacing: '-0.03em' }}>
            Bytspot
          </h1>
          
          <p className="text-[20px] text-white/80" style={{ fontWeight: 500 }}>
            Your perfect spot awaits
          </p>
        </div>

        {/* Brand Gradient Demonstration */}
        <div className="space-y-6">
          <h2 className="text-[28px] text-white mb-4" style={{ fontWeight: 700 }}>
            Brand Gradient System
          </h2>
          
          {/* Gradient Bar */}
          <div className="h-24 rounded-[24px] bg-brand-gradient shadow-2xl" />
          
          {/* Color Swatches */}
          <div className="grid grid-cols-3 gap-4">
            {/* Cyan */}
            <div className="space-y-3">
              <div className="h-32 rounded-[16px] bg-[#00BFFF] shadow-xl" />
              <div className="text-center">
                <p className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Brand Blue
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  #00BFFF
                </p>
                <p className="text-[11px] text-white/50" style={{ fontWeight: 400 }}>
                  Technology • Precision
                </p>
              </div>
            </div>
            
            {/* Magenta */}
            <div className="space-y-3">
              <div className="h-32 rounded-[16px] bg-[#FF00FF] shadow-xl" />
              <div className="text-center">
                <p className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Brand Magenta
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  #FF00FF
                </p>
                <p className="text-[11px] text-white/50" style={{ fontWeight: 400 }}>
                  Energy • Innovation
                </p>
              </div>
            </div>
            
            {/* Orange */}
            <div className="space-y-3">
              <div className="h-32 rounded-[16px] bg-[#FF4500] shadow-xl" />
              <div className="text-center">
                <p className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Brand Orange
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  #FF4500
                </p>
                <p className="text-[11px] text-white/50" style={{ fontWeight: 400 }}>
                  Action • Warmth
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Logo Variations */}
        <div className="space-y-6">
          <h2 className="text-[28px] text-white mb-4" style={{ fontWeight: 700 }}>
            Logo Variations
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Icon Only */}
            <div className="rounded-[24px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl">
              <div className="flex flex-col items-center space-y-4">
                <BrandLogo size={120} />
                <div className="text-center">
                  <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Icon Only
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    For app icons, avatars
                  </p>
                </div>
              </div>
            </div>
            
            {/* Full Logotype */}
            <div className="rounded-[24px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl">
              <div className="flex flex-col items-center justify-center space-y-4 h-full">
                <BrandLogotype size="large" />
                <div className="text-center">
                  <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    Full Logotype
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    For headers, marketing
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Examples */}
        <div className="space-y-6">
          <h2 className="text-[28px] text-white mb-4" style={{ fontWeight: 700 }}>
            Size Examples
          </h2>
          
          <div className="rounded-[24px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl space-y-8">
            {/* Large */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <BrandLogo size={80} />
                <div>
                  <p className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                    Large (80px)
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    Hero sections, landing pages
                  </p>
                </div>
              </div>
            </div>
            
            {/* Medium */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <BrandLogo size={50} />
                <div>
                  <p className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                    Medium (50px)
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    Page headers, navigation
                  </p>
                </div>
              </div>
            </div>
            
            {/* Small */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <BrandLogo size={32} />
                <div>
                  <p className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                    Small (32px)
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    Compact headers, inline use
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gradient Code */}
        <div className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl">
          <p className="text-[13px] text-white/60 mb-2" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            CSS Gradient Code
          </p>
          <code className="text-[14px] text-cyan-400 font-mono">
            linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%)
          </code>
        </div>
      </div>
    </div>
  );
}
