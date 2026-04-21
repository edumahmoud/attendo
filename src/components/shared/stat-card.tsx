'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

// -------------------------------------------------------
// Types
// -------------------------------------------------------
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: 'emerald' | 'amber' | 'rose' | 'teal' | 'purple';
}

// -------------------------------------------------------
// Color map – emerald / amber / rose / teal
// -------------------------------------------------------
const colorMap = {
  emerald: {
    bg: 'bg-emerald-50',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600',
    valueText: 'text-emerald-700',
    border: 'border-emerald-200',
    hoverBorder: 'hover:border-emerald-300',
    shadow: 'hover:shadow-emerald-100',
    glow: 'group-hover:ring-emerald-200',
  },
  amber: {
    bg: 'bg-amber-50',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    valueText: 'text-amber-700',
    border: 'border-amber-200',
    hoverBorder: 'hover:border-amber-300',
    shadow: 'hover:shadow-amber-100',
    glow: 'group-hover:ring-amber-200',
  },
  rose: {
    bg: 'bg-rose-50',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-600',
    valueText: 'text-rose-700',
    border: 'border-rose-200',
    hoverBorder: 'hover:border-rose-300',
    shadow: 'hover:shadow-rose-100',
    glow: 'group-hover:ring-rose-200',
  },
  teal: {
    bg: 'bg-teal-50',
    iconBg: 'bg-teal-100',
    iconText: 'text-teal-600',
    valueText: 'text-teal-700',
    border: 'border-teal-200',
    hoverBorder: 'hover:border-teal-300',
    shadow: 'hover:shadow-teal-100',
    glow: 'group-hover:ring-teal-200',
  },
  purple: {
    bg: 'bg-purple-50',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
    valueText: 'text-purple-700',
    border: 'border-purple-200',
    hoverBorder: 'hover:border-purple-300',
    shadow: 'hover:shadow-purple-100',
    glow: 'group-hover:ring-purple-200',
  },
} as const;

// -------------------------------------------------------
// Component
// -------------------------------------------------------
export default function StatCard({ icon, label, value, color }: StatCardProps) {
  const colors = colorMap[color];

  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -4 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className="group"
    >
      <Card
        className={`${colors.bg} ${colors.border} ${colors.hoverBorder} ${colors.shadow} transition-all duration-200 shadow-sm hover:shadow-md cursor-default ring-0 ${colors.glow} hover:ring-2`}
        dir="rtl"
      >
        <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-5">
          {/* Icon */}
          <div
            className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl ${colors.iconBg} shadow-sm transition-transform duration-200 group-hover:scale-110`}
          >
            <span className={colors.iconText}>{icon}</span>
          </div>

          {/* Label & Value */}
          <div className="flex flex-col gap-1 text-right min-w-0">
            <span className="text-xs sm:text-sm text-muted-foreground font-medium">{label}</span>
            <span className={`text-xl sm:text-2xl font-bold leading-tight ${colors.valueText}`}>
              {value}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
