import { ImageResponse } from 'next/og';
import { KebabArt } from '@/lib/icon-art';

// iOS "Ana Ekrana Ekle" + Android (manifest 512) yüksek çözünürlüklü ikon
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<KebabArt size={512} />, { ...size });
}
