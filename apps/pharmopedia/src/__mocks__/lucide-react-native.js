/**
 * Minimal mock for lucide-react-native in vitest (node environment).
 * Returns a no-op React element for every icon so component tests
 * can render without native SVG dependencies.
 */

const React = require('react')

function createIconMock(name) {
  function Icon({ size: _size, color: _color, fill: _fill, ...rest }) {
    return React.createElement('View', { testID: `icon-${name}`, ...rest })
  }
  Icon.displayName = name
  return Icon
}

// Explicitly export known icons used in the codebase
const Heart = createIconMock('Heart')
const Search = createIconMock('Search')
const Bookmark = createIconMock('Bookmark')
const BookmarkCheck = createIconMock('BookmarkCheck')
const ChevronRight = createIconMock('ChevronRight')
const ChevronLeft = createIconMock('ChevronLeft')
const ArrowLeft = createIconMock('ArrowLeft')
const ArrowRight = createIconMock('ArrowRight')
const X = createIconMock('X')
const Check = createIconMock('Check')
const Info = createIconMock('Info')
const AlertTriangle = createIconMock('AlertTriangle')
const Share = createIconMock('Share')
const Share2 = createIconMock('Share2')
const Copy = createIconMock('Copy')
const ExternalLink = createIconMock('ExternalLink')
const Wifi = createIconMock('Wifi')
const WifiOff = createIconMock('WifiOff')
const Moon = createIconMock('Moon')
const Sun = createIconMock('Sun')
const User = createIconMock('User')
const Settings = createIconMock('Settings')
const Globe = createIconMock('Globe')
const Pill = createIconMock('Pill')
const FlaskConical = createIconMock('FlaskConical')
const Stethoscope = createIconMock('Stethoscope')
const Microscope = createIconMock('Microscope')
const RefreshCw = createIconMock('RefreshCw')
const Bell = createIconMock('Bell')
const Plus = createIconMock('Plus')
const Minus = createIconMock('Minus')
const Loader2 = createIconMock('Loader2')
const Shield = createIconMock('Shield')
const Brain = createIconMock('Brain')
const Bone = createIconMock('Bone')
const Eye = createIconMock('Eye')
const Baby = createIconMock('Baby')
const Droplets = createIconMock('Droplets')
const Flame = createIconMock('Flame')
const Activity = createIconMock('Activity')
const MapPin = createIconMock('MapPin')
const SearchX = createIconMock('SearchX')
const FolderOpen = createIconMock('FolderOpen')
const BookmarkPlus = createIconMock('BookmarkPlus')
const MapPinOff = createIconMock('MapPinOff')
const CheckCircle = createIconMock('CheckCircle')
const Home = createIconMock('Home')
const Folder = createIconMock('Folder')
const Building2 = createIconMock('Building2')
const UserPlus = createIconMock('UserPlus')
const ChevronDown = createIconMock('ChevronDown')
const Camera = createIconMock('Camera')
const ImagePlus = createIconMock('ImagePlus')

module.exports = {
  Heart,
  Search,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowRight,
  X,
  Check,
  Info,
  AlertTriangle,
  Share,
  Share2,
  Copy,
  ExternalLink,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  User,
  Settings,
  Globe,
  Pill,
  FlaskConical,
  Stethoscope,
  Microscope,
  RefreshCw,
  Bell,
  Plus,
  Minus,
  Loader2,
  Shield,
  Brain,
  Bone,
  Eye,
  Baby,
  Droplets,
  Flame,
  Activity,
  MapPin,
  SearchX,
  FolderOpen,
  BookmarkPlus,
  MapPinOff,
  CheckCircle,
  Home,
  Folder,
  Building2,
  UserPlus,
  ChevronDown,
  Camera,
  ImagePlus,
}
