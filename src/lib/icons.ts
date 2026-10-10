import {
  Music, MonitorPlay, Database, Megaphone, Search, Users, Scale, Clapperboard, Code2, Sparkles,
  Globe2, ShieldCheck, BarChart3, HeartHandshake, Lightbulb, TrendingUp, Target, Eye, Smartphone,
  Mic, Video, Film, Radio, Headphones, Play, Rocket, Award, Star, Heart, Zap, Layers, Cloud, Cpu,
  Briefcase, Handshake, DollarSign, Wallet, Camera, Tv, Share2, Palette, PenTool, Newspaper, Mail,
  Phone, MapPin, Clock, CheckCircle2, Trophy, Crown, Gem, Flame, Wand2, LineChart, PieChart,
  Building2, Globe,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Music, MonitorPlay, Database, Megaphone, Search, Users, Scale, Clapperboard, Code2, Sparkles,
  Globe2, ShieldCheck, BarChart3, HeartHandshake, Lightbulb, TrendingUp, Target, Eye, Smartphone,
  Mic, Video, Film, Radio, Headphones, Play, Rocket, Award, Star, Heart, Zap, Layers, Cloud, Cpu,
  Briefcase, Handshake, DollarSign, Wallet, Camera, Tv, Share2, Palette, PenTool, Newspaper, Mail,
  Phone, MapPin, Clock, CheckCircle2, Trophy, Crown, Gem, Flame, Wand2, LineChart, PieChart,
  Building2, Globe,
};

export const ICON_NAMES = Object.keys(ICONS);

export function getIcon(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || Sparkles;
}
