/**
 * Curated icon catalog for the Ultranos ecosystem.
 *
 * All apps should import icons from '@ultranos/ui-kit' (or '@ultranos/ui-kit/icons')
 * instead of using inline SVGs or importing lucide-react directly.
 *
 * Icons are grouped by domain but exported flat for easy consumption.
 * Wrap navigation icons with <DirectionalIcon category="navigation"> for RTL mirroring.
 * Medical icons must NOT be mirrored — use <DirectionalIcon category="medical">.
 *
 * To add a new icon: import from lucide-react and re-export here.
 */

// ─── Navigation & Layout ────────────────────────────────────────────
export {
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
  Search,
  Home,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'

// ─── Users & Identity ───────────────────────────────────────────────
export {
  User,
  Users,
  UserPlus,
  UserSearch,
  UserCheck,
  UserX,
  UserCog,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
} from 'lucide-react'

// ─── Clinical & Medical ─────────────────────────────────────────────
// ⚠️  These icons must NEVER be mirrored in RTL.
// Wrap with <DirectionalIcon category="medical"> if using DirectionalIcon.
export {
  Stethoscope,
  Pill,
  Syringe,
  Thermometer,
  HeartPulse,
  Activity,
  Brain,
  Bone,
  Eye,
  Ear,
  Baby,
  Ambulance,
  Cross,
  Hospital,
} from 'lucide-react'

// ─── Lab & Diagnostics ──────────────────────────────────────────────
export {
  Microscope,
  FlaskConical,
  FlaskRound,
  TestTubeDiagonal,
  TestTubes,
  Droplet,
  Droplets,
  Beaker,
  Pipette,
  Dna,
  Scan,
  ScanLine,
} from 'lucide-react'

// ─── Pharmacy & Medication ──────────────────────────────────────────
export {
  Sun,
  Moon,
  Utensils,
  Clock,
  Timer,
  Package,
  PackageCheck,
  PackageX,
  PackagePlus,
  Warehouse,
  Truck,
  Receipt,
  ReceiptText,
  ShoppingCart,
  BadgePercent,
  Barcode,
  Banknote,
  Scale,
} from 'lucide-react'

// ─── Status & Alerts ────────────────────────────────────────────────
export {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  CircleCheck,
  CircleX,
  Ban,
  OctagonAlert,
  TriangleAlert,
  CircleAlert,
  Bell,
  BellRing,
  BellOff,
} from 'lucide-react'

// ─── Documents & Files ──────────────────────────────────────────────
export {
  File,
  FileText,
  FileWarning,
  FilePlus,
  FileCheck,
  FileX,
  ClipboardList,
  ClipboardCheck,
  ClipboardPen,
  Notebook,
  BookOpen,
} from 'lucide-react'

// ─── Actions & Controls ─────────────────────────────────────────────
export {
  Plus,
  Minus,
  Check,
  Trash2,
  Pencil,
  Copy,
  Download,
  Upload,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  Filter,
  SlidersHorizontal,
  SortAsc,
  SortDesc,
  MoreHorizontal,
  MoreVertical,
  GripVertical,
  Settings,
  Save,
  Calculator,
  ListOrdered,
  List,
  Bookmark,
} from 'lucide-react'

// ─── Calendar & Scheduling ──────────────────────────────────────────
export {
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  History,
} from 'lucide-react'

// ─── Communication & Sync ───────────────────────────────────────────
export {
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  CloudUpload,
  CloudDownload,
  CloudCheck,
  Globe,
  MessageSquare,
  MessageCircle,
  Languages,
  QrCode,
} from 'lucide-react'

// ─── Media & Audio ──────────────────────────────────────────────────
export {
  Play,
  Pause,
  StopCircle,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Camera,
  Video,
} from 'lucide-react'

// ─── Data & Charts ──────────────────────────────────────────────────
export {
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  TrendingDown,
  Table,
  Rows3,
  Columns3,
} from 'lucide-react'

// ─── Geometric Shapes (Queue Tokens) ────────────────────────────────
export {
  Star,
  Circle,
  Triangle,
  Square,
  Diamond,
  Heart,
  Hexagon,
  Pentagon,
  Octagon,
} from 'lucide-react'

// ─── Type re-export for consumers ───────────────────────────────────
export type { LucideProps, LucideIcon } from 'lucide-react'
