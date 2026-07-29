interface IconProps {
  size?: number;
}

function Icon({ children, size = 20 }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>;
}

export function CartIcon({ size }: IconProps) {
  return <Icon size={size}><path d="M3.5 5h2l1.7 9.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.5L20.5 8H6.1" /><circle cx="9.5" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></Icon>;
}

export function TrashIcon() {
  return <Icon><path d="M4.5 7h15M9 4h6l1 3H8l1-3Zm-2 3 .8 13h8.4L17 7M10 10.5v6M14 10.5v6" /></Icon>;
}

export function RefreshIcon() {
  return <Icon><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.2 9A7 7 0 0 0 6.1 6.7L4 9m2 6a7 7 0 0 0 12.1 2.3L20 15" /></Icon>;
}

export function UserIcon() {
  return <Icon><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Icon>;
}

export function CheckIcon() {
  return <Icon><path d="m5 12.5 4 4L19 6.5" /></Icon>;
}

export function ChevronIcon() {
  return <Icon><path d="m8 10 4 4 4-4" /></Icon>;
}
