/**
 * Everything the public website says about the shop, in one place.
 *
 * The shop app keeps its own copy of the shop name and address because it can be
 * edited at the counter from Settings. This file is deliberately separate and
 * hard coded: a customer looking at the website must always see the address the
 * shop is actually known by, not whatever a member of staff last typed into the
 * billing screen. It also keeps the website free of the API entirely, so the
 * public page loads with no backend running.
 */
import {
  Battery,
  BatteryCharging,
  Camera,
  ChevronDown,
  ChevronUp,
  CircuitBoard,
  CircleHelp,
  Cpu,
  Droplets,
  Ellipsis,
  Handshake,
  Layers,
  MapPin,
  Mic,
  Power,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ThumbsUp,
  Timer,
  Volume2,
  type LucideIcon,
} from 'lucide-react';

export const SHOP_NAME = 'Jai Mataji Mobile Repairing';

/** Short form for tight spots such as the header and the footer. */
export const SHOP_SHORT_NAME = 'Jai Mataji';

/** Drawn in the mark that sits next to the shop name. */
export const SHOP_MARK = 'JMR';

export const HERO_HEADING = 'Expert Mobile Repairing You Can Trust';

export const HERO_SUBHEADING = 'Fast and reliable mobile repair services in Talod.';

export const CITY = 'Talod, Gujarat';

/** Two lines, exactly as the address is written on the shop board. */
export const ADDRESS_LINES = ['M. Tower Chowk, Opposite Market Yard,', 'Modasa Road, Talod, Gujarat'] as const;

export const ADDRESS_ONE_LINE = ADDRESS_LINES.join(' ');

export interface ShopContact {
  name: string;
  /** Shown to the customer, and used for the tel: link. */
  number: string;
}

export const CONTACTS: readonly ShopContact[] = [
  { name: 'Ashok Bhai', number: '9974298866' },
  { name: 'Mitesh', number: '9327394978' },
];

/**
 * The shop is not pinned to coordinates, so the map button searches for the
 * address instead of dropping a marker somewhere it might not be. Google puts
 * the real shop at the top of that search.
 */
export const MAP_QUERY = `${SHOP_NAME}, ${ADDRESS_ONE_LINE}`;

export function directionsUrl(): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAP_QUERY)}`;
}

export function telHref(number: string): string {
  return `tel:${number}`;
}

export interface NavLink {
  label: string;
  /** Id of the section on the page. There is one page, so every link is an anchor. */
  target: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Home', target: 'home' },
  { label: 'Services', target: 'services' },
  { label: 'About', target: 'about' },
  { label: 'Contact', target: 'contact' },
];

export interface Service {
  /** Shown word for word on the card. */
  name: string;
  icon: LucideIcon;
}

/**
 * The twenty problems the shop fixes, in the order they are listed on the shop
 * board. No categories and nothing invented: a customer scanning this is looking
 * for their own problem, so the fastest thing the page can do is show the list.
 */
export const SERVICES: readonly Service[] = [
  { name: 'Display Change', icon: Smartphone },
  { name: 'Folder Change', icon: Layers },
  { name: 'Body Frame Change', icon: Smartphone },
  { name: 'Back Body Change', icon: Smartphone },
  { name: 'Charging Socket (CC) Change', icon: BatteryCharging },
  { name: 'Mic Problem', icon: Mic },
  { name: 'Speaker / Ringer Problem', icon: Volume2 },
  { name: 'Power On/Off Switch Problem', icon: Power },
  { name: 'Volume Up Button Problem', icon: ChevronUp },
  { name: 'Volume Down Button Problem', icon: ChevronDown },
  { name: 'Battery Problem', icon: Battery },
  { name: 'Software Problem', icon: Sparkles },
  { name: 'Software Lock Problem', icon: CircleHelp },
  { name: 'FRP Problem', icon: ShieldCheck },
  { name: 'Network Problem', icon: Search },
  { name: 'Camera Problem', icon: Camera },
  { name: 'CPU Problem', icon: Cpu },
  { name: 'Motherboard Problem', icon: CircuitBoard },
  { name: 'Water Damage', icon: Droplets },
  { name: 'Other Problem', icon: Ellipsis },
];

export interface Benefit {
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Plain, checkable promises. Nothing here claims a guarantee the shop cannot
 * actually keep at the counter.
 */
export const BENEFITS: readonly Benefit[] = [
  {
    title: 'Experienced Repair Service',
    description: 'Every handset is opened and checked by someone who repairs phones for a living.',
    icon: ShieldCheck,
  },
  {
    title: 'Quality Repair Work',
    description: 'Careful fitting and testing before your phone is handed back to you.',
    icon: Sparkles,
  },
  {
    title: 'Transparent Service',
    description: 'You are told what is wrong and what it will cost before the repair goes ahead.',
    icon: Handshake,
  },
  {
    title: 'Fast Response',
    description: 'Bring the phone in and get a straight answer instead of being put on a waiting list.',
    icon: Timer,
  },
  {
    title: 'Customer Friendly',
    description: 'Plain language, no jargon, and no pressure to replace a phone that only needs a repair.',
    icon: ThumbsUp,
  },
  {
    title: 'Convenient Location',
    description: 'Easy to reach on Modasa Road, right opposite the Market Yard.',
    icon: MapPin,
  },
];

export const ABOUT_PARAGRAPHS: readonly string[] = [
  'Jai Mataji Mobile Repairing provides mobile repair services in Talod, Gujarat. Customers can visit the shop for hardware and software related mobile repair requirements.',
  'Whether it is a broken display, a charging fault, a network issue or a phone that will not switch on, bring it to the shop on Modasa Road and it will be checked at the counter.',
];
