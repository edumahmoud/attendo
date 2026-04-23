'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, User, Mail, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { UserProfile } from '@/lib/types';
import { getRoleLabel as getSharedRoleLabel } from '@/lib/utils';

// -------------------------------------------------------
// Types
// -------------------------------------------------------
interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
  onDeleteAccount: () => Promise<void>;
}

// -------------------------------------------------------
// Animation variants
// -------------------------------------------------------
const sectionVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.3, ease: 'easeOut' },
  }),
};

// -------------------------------------------------------
// Component
// -------------------------------------------------------
export default function SettingsModal({
  open,
  onOpenChange,
  profile,
  onUpdateProfile,
  onDeleteAccount,
}: SettingsModalProps) {
  const [name, setName] = useState(profile.name);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Keep local name in sync when the profile prop updates
  useEffect(() => {
    setName(profile.name);
  }, [profile.name]);

  const roleLabel = getSharedRoleLabel(profile.role, profile.gender, profile.title_id) || profile.role;

  // ─── Handlers ─────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('الاسم مطلوب');
      return;
    }

    setIsUpdating(true);
    try {
      const result = await onUpdateProfile({ name: trimmed });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('تم تحديث الملف الشخصي بنجاح');
      }
    } catch {
      toast.error('حدث خطأ أثناء التحديث');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await onDeleteAccount();
      toast.success('تم حذف الحساب بنجاح');
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } catch {
      toast.error('حدث خطأ أثناء حذف الحساب');
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-right">
            <Settings className="h-5 w-5 text-emerald-600" />
            الإعدادات
          </DialogTitle>
          <DialogDescription className="text-right">
            إدارة الملف الشخصي وإعدادات الحساب
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ── Profile section ── */}
          <motion.div
            className="space-y-4"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={0}
          >
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-foreground">الملف الشخصي</h3>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="settings-name" className="text-sm text-muted-foreground">
                الاسم
              </Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="أدخل اسمك"
                className="text-right"
                disabled={isUpdating}
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="settings-email" className="text-sm text-muted-foreground">
                البريد الإلكتروني
              </Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground select-all">{profile.email}</span>
              </div>
            </div>

            {/* Role badge */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">الدور</Label>
              <div>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {roleLabel}
                </Badge>
              </div>
            </div>
          </motion.div>

          <Separator />

          {/* ── Danger zone ── */}
          <motion.div
            className="space-y-4"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            custom={1}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-rose-600">منطقة الخطر</h3>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
              <p className="text-sm text-rose-700 mb-3">
                حذف الحساب سيؤدي إلى إزالة جميع بياناتك نهائياً. هذا الإجراء لا يمكن التراجع عنه.
              </p>

              <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف الحساب
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader className="text-right">
                    <AlertDialogTitle className="text-right">
                      تأكيد حذف الحساب
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-right">
                      هل أنت متأكد من حذف حسابك؟ سيتم حذف جميع بياناتك بشكل نهائي ولا يمكن استرجاعها.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogCancel disabled={isDeleting}>إلغاء</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          جاري الحذف...
                        </span>
                      ) : (
                        'حذف الحساب نهائياً'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </motion.div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:gap-2">
          <Button
            onClick={handleSave}
            disabled={isUpdating || name === profile.name}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {isUpdating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري الحفظ...
              </span>
            ) : (
              'حفظ التغييرات'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
