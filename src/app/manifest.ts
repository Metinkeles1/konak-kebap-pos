import type { MetadataRoute } from 'next';

// PWA manifest — telefonda "Ana Ekrana Ekle" için isim, renk ve ikonlar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Konak Kebap · Adisyon',
    short_name: 'Konak Kebap',
    description: 'Masa ve adisyon takip sistemi',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1a1a1a',
    theme_color: '#1a1a1a',
    lang: 'tr',
    icons: [
      { src: '/icon', sizes: '48x48', type: 'image/png' },
      { src: '/apple-icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
