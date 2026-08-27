import {
  Utensils,
  Car,
  ShoppingBag,
  Receipt,
  Clapperboard,
  HeartPulse,
  ShoppingCart,
  MoreHorizontal,
  Wallet,
  Home,
  Plane,
  Gift,
  GraduationCap,
  Dumbbell,
  PawPrint,
  Smartphone,
  Coffee,
  Fuel,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  'shopping-bag': ShoppingBag,
  receipt: Receipt,
  clapperboard: Clapperboard,
  'heart-pulse': HeartPulse,
  'shopping-cart': ShoppingCart,
  'more-horizontal': MoreHorizontal,
  wallet: Wallet,
  home: Home,
  plane: Plane,
  gift: Gift,
  'graduation-cap': GraduationCap,
  dumbbell: Dumbbell,
  'paw-print': PawPrint,
  smartphone: Smartphone,
  coffee: Coffee,
  fuel: Fuel,
  'arrow-left-right': ArrowLeftRight,
};

export const ICON_NAMES = Object.keys(ICONS);

export function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? MoreHorizontal;
}
