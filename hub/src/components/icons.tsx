import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconInbox = (p: P) =>
  base(p, <><path d="M3 13h4l2 3h6l2-3h4" /><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></>);

export const IconKanban = (p: P) =>
  base(p, <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></>);

export const IconChart = (p: P) =>
  base(p, <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>);

export const IconPlay = (p: P) => base(p, <path d="M7 5.5v13l11-6.5L7 5.5Z" fill="currentColor" stroke="none" />);

export const IconStop = (p: P) => base(p, <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />);

export const IconSearch = (p: P) => base(p, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>);

export const IconBack = (p: P) => base(p, <><path d="M15 6l-6 6 6 6" /></>);

export const IconSend = (p: P) => base(p, <path d="M4 12 20 4l-4 16-4.5-6.5L4 12Z" />);

export const IconCheck = (p: P) => base(p, <path d="m5 12.5 4.5 4.5L19 7.5" />);

export const IconDoubleCheck = (p: P) =>
  base(p, <><path d="m2.5 12.7 4 4L14 9" /><path d="m11 15.5 1.6 1.7L21.5 9" /></>);

export const IconPin = (p: P) =>
  base(p, <><path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11Z" /><circle cx="12" cy="10" r="2.6" /></>);

export const IconDoc = (p: P) =>
  base(p, <><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 16.5h5" /></>);

export const IconBot = (p: P) =>
  base(p, <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4.5" /><circle cx="12" cy="3.8" r="1" fill="currentColor" stroke="none" /><circle cx="9.3" cy="13" r="1.1" fill="currentColor" stroke="none" /><circle cx="14.7" cy="13" r="1.1" fill="currentColor" stroke="none" /><path d="M9.5 16.3h5" /></>);

export const IconUser = (p: P) =>
  base(p, <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c1.2-3.4 3.9-5 7-5s5.8 1.6 7 5" /></>);

export const IconClock = (p: P) => base(p, <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);

export const IconX = (p: P) => base(p, <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>);

export const IconNote = (p: P) =>
  base(p, <><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 6.5 3 3" /></>);

export const IconPhone = (p: P) =>
  base(p, <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.5 1.5 0 0 1-1.6 1.5C10.4 20 4 13.6 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />);

export const IconChevronR = (p: P) => base(p, <path d="m9 6 6 6-6 6" />);

export const IconRefresh = (p: P) =>
  base(p, <><path d="M20 11a8 8 0 1 0-2.3 6.3" /><path d="M20 5v6h-6" /></>);

export const IconSparkle = (p: P) =>
  base(p, <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.4l-1.8-5.8L4.5 10.8 10.2 9 12 3.5Z" />);

export const IconTire = (p: P) =>
  base(p, <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.4" /><path d="M12 3.5v3" /><path d="M12 17.5v3" /><path d="M3.5 12h3" /><path d="M17.5 12h3" /><path d="m6 6 2.1 2.1" /><path d="m15.9 15.9 2.1 2.1" /><path d="m18 6-2.1 2.1" /><path d="m8.1 15.9-2.1 2.1" /></>);
