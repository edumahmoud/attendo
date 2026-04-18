'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  LayoutDashboard,
  FileText,
  ClipboardList,
  Users,
  Settings,
  TrendingUp,
  LogOut,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

// -------------------------------------------------------
// Types
// -------------------------------------------------------
interface AppSidebarProps {
  role: 'student' | 'teacher';
  activeSection: string;
  onSectionChange: (section: string) => void;
  userName: string;
  onSignOut: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

// -------------------------------------------------------
// Navigation items per role
// -------------------------------------------------------
const studentNavItems: NavItem[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard className="h-5 w-5" /> },
  { id: 'summaries', label: 'الملخصات', icon: <FileText className="h-5 w-5" /> },
  { id: 'quizzes', label: 'الاختبارات', icon: <ClipboardList className="h-5 w-5" /> },
  { id: 'teachers', label: 'المعلمون', icon: <Users className="h-5 w-5" /> },
  { id: 'settings', label: 'الإعدادات', icon: <Settings className="h-5 w-5" /> },
];

const teacherNavItems: NavItem[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard className="h-5 w-5" /> },
  { id: 'students', label: 'الطلاب', icon: <Users className="h-5 w-5" /> },
  { id: 'quizzes', label: 'الاختبارات', icon: <ClipboardList className="h-5 w-5" /> },
  { id: 'analytics', label: 'التقارير', icon: <TrendingUp className="h-5 w-5" /> },
  { id: 'settings', label: 'الإعدادات', icon: <Settings className="h-5 w-5" /> },
];

// -------------------------------------------------------
// Sidebar inner content (shared between desktop & mobile)
// -------------------------------------------------------
function SidebarContent({
  role,
  activeSection,
  onSectionChange,
  userName,
  onSignOut,
  onNavClick,
}: AppSidebarProps & { onNavClick?: () => void }) {
  const navItems = role === 'student' ? studentNavItems : teacherNavItems;
  const roleLabel = role === 'student' ? 'طالب' : 'معلم';
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <div className="flex h-full flex-col" dir="rtl">
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 shadow-md">
          <GraduationCap className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-emerald-600">EduAI</h1>
      </div>

      <Separator />

      {/* ── User info ── */}
      <div className="flex items-center gap-3 px-6 py-4">
        <Avatar className="h-10 w-10 border-2 border-emerald-200">
          <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold text-sm">
            {initials || 'م'}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{userName}</span>
          <Badge
            variant="secondary"
            className="w-fit bg-emerald-100 text-emerald-700 border-emerald-200 text-xs"
          >
            {roleLabel}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* ── Navigation ── */}
      <ScrollArea className="flex-1">
        <nav className="px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <li key={item.id}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onSectionChange(item.id);
                      onNavClick?.();
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent'
                    }`}
                  >
                    <span
                      className={`transition-colors duration-200 ${
                        isActive ? 'text-emerald-600' : 'text-muted-foreground'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="mr-auto h-2 w-2 rounded-full bg-emerald-500"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </nav>
      </ScrollArea>

      <Separator />

      {/* ── Sign out ── */}
      <div className="p-4">
        <Button
          variant="ghost"
          onClick={onSignOut}
          className="w-full justify-start gap-3 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
        >
          <LogOut className="h-5 w-5" />
          <span>تسجيل الخروج</span>
        </Button>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Main exported component
// -------------------------------------------------------
export default function AppSidebar({
  role,
  activeSection,
  onSectionChange,
  userName,
  onSignOut,
}: AppSidebarProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ─── Mobile: Sheet / drawer ───
  if (isMobile) {
    return (
      <>
        {/* Sticky top bar */}
        <div className="fixed top-0 right-0 left-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur-sm px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-emerald-600">EduAI</span>
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">فتح القائمة</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>القائمة الرئيسية</SheetTitle>
              </SheetHeader>
              <SidebarContent
                role={role}
                activeSection={activeSection}
                onSectionChange={onSectionChange}
                userName={userName}
                onSignOut={() => {
                  setMobileOpen(false);
                  onSignOut();
                }}
                onNavClick={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>

        {/* Spacer for the fixed top bar */}
        <div className="h-14" />
      </>
    );
  }

  // ─── Desktop: Fixed right sidebar (RTL) ───
  return (
    <aside className="fixed right-0 top-0 z-30 h-screen w-72 border-l bg-background shadow-sm">
      <SidebarContent
        role={role}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        userName={userName}
        onSignOut={onSignOut}
      />
    </aside>
  );
}
