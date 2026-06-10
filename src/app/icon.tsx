import { ImageResponse } from 'next/og';
import { KebabArt } from '@/lib/icon-art';

// Tarayıcı sekmesi / favicon
export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<KebabArt size={48} />, { ...size });
}
