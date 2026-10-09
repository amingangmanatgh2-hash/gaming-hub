import React from 'react';

interface P { size?: number; className?: string; style?: React.CSSProperties; onClick?: (e: React.MouseEvent) => void; title?: string }
const S = ({ size = 18, className = '', style, onClick, title, children, viewBox = '0 0 24 24' }: P & { children: React.ReactNode; viewBox?: string }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className={className} style={style} onClick={onClick} aria-hidden="true" role={onClick ? 'button' : undefined}>
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

export const IconChat = (p: P) => <S {...p}><path d="M21 11.5a8.38 8.38 0 0 0-.9-3.8 8.5 8.5 0 0 0-7.6-4.7 8.38 8.38 0 0 0-3.8.9L3 3l1 5.7a8.38 8.38 0 0 0-.9 3.8 8.5 8.5 0 0 0 4.7 7.6 8.38 8.38 0 0 0 3.8.9h.9a8.48 8.48 0 0 0 8-8v-.5z"/><path d="M8 10h8M8 13.5h5"/></S>;
export const IconVideo = (p: P) => <S {...p}><rect x="2" y="6" width="13" height="12" rx="2.5"/><path d="M15 10.5l6-3.5v10l-6-3.5"/></S>;
export const IconDash = (p: P) => <S {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></S>;
export const IconPricing = (p: P) => <S {...p}><path d="M12 2v20M17 5.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/></S>;
export const IconSettings = (p: P) => <S {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></S>;
export const IconLogout = (p: P) => <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></S>;
export const IconShield = (p: P) => <S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 11.5l2 2 4-4.5"/></S>;
export const IconGlobe = (p: P) => <S {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></S>;
export const IconSparkle = (p: P) => <S {...p}><path d="M12 3l1.9 5.7L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.3z"/><path d="M19 16.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></S>;
export const IconCard = (p: P) => <S {...p}><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/></S>;
export const IconUsers = (p: P) => <S {...p}><circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20.5c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5"/><circle cx="17.5" cy="8.5" r="2.5"/><path d="M16.5 15.3c2.8.3 4.6 2 5.2 4.7"/></S>;
export const IconChart = (p: P) => <S {...p}><path d="M3 3v18h18"/><path d="M7 15v-4M12 17V8M17 13V5"/></S>;
export const IconFlag = (p: P) => <S {...p}><path d="M4 22V3h13l-2.5 4.5L17 12H5"/><circle cx="12" cy="12" r="0.5"/></S>;
export const IconWrench = (p: P) => <S {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></S>;
export const IconHistory = (p: P) => <S {...p}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></S>;
export const IconBook = (p: P) => <S {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></S>;
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14"/></S>;
export const IconSend = (p: P) => <S {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M20 6L9 17l-5-5"/></S>;
export const IconX = (p: P) => <S {...p}><path d="M18 6L6 18M6 6l12 12"/></S>;
export const IconMenu = (p: P) => <S {...p}><path d="M4 6h16M4 12h16M4 18h16"/></S>;
export const IconDownload = (p: P) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></S>;
export const IconUpload = (p: P) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></S>;
export const IconEye = (p: P) => <S {...p}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></S>;
export const IconLock = (p: P) => <S {...p}><rect x="3" y="11" width="18" height="11" rx="2.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></S>;
export const IconMail = (p: P) => <S {...p}><rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M22 7l-10 6L2 7"/></S>;
export const IconGoogle = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"/>
    <path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27v-3.1H1.29a12 12 0 0 0 0 10.74z"/>
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"/>
  </svg>
);
export const IconBolt = (p: P) => <S {...p}><path d="M13 2L3 14h7l-1 8 11-12h-7z"/></S>;
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>;
export const IconWarn = (p: P) => <S {...p}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></S>;
export const IconRefresh = (p: P) => <S {...p}><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></S>;
export const IconTrash = (p: P) => <S {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/></S>;
export const IconCopy = (p: P) => <S {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></S>;
