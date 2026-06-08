'use client';

import { useEffect, useState } from 'react';

// Periyodik "şimdi" — masa süre kronometreleri için (varsayılan 20 sn'de bir tick)
export function useNow(intervalMs = 20000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
