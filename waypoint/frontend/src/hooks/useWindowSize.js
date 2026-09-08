import { useState, useEffect } from 'react';

export function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    function handle() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return {
    ...size,
    isMobile: size.width < 768,
    isTablet: size.width >= 768 && size.width < 1024,
    isDesktop: size.width >= 1024,
  };
}
