import { createContext, useContext, type ReactNode } from 'react';
import '../styles/plan.css';

export const DeepSpaceGroundContext = createContext(false);

/** The nearest owner paints the sky; descendants inherit it, like nativeDeepSpaceGroundDrawn. */
export function DeepSpaceGround({ alreadyDrawn = false }: { alreadyDrawn?: boolean }) {
  const inherited = useContext(DeepSpaceGroundContext);
  if (alreadyDrawn || inherited) return null;
  return <div className="deep-space-ground" data-testid="deep-space-ground" aria-hidden="true" />;
}

export function DeepSpaceSurface({ children, alreadyDrawn = false }: { children: ReactNode; alreadyDrawn?: boolean }) {
  return <div className="deep-space-surface">
    <DeepSpaceGround alreadyDrawn={alreadyDrawn} />
    <DeepSpaceGroundContext.Provider value={true}>{children}</DeepSpaceGroundContext.Provider>
  </div>;
}
