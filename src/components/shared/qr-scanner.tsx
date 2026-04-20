'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Loader2, CheckCircle2, XCircle, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface QrScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
}

export default function QrScanner({ open, onClose, onScan, title = 'مسح رمز QR' }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const isStopping = useRef(false);

  const stopScanner = useCallback(async () => {
    if (isStopping.current) return;
    isStopping.current = true;

    try {
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      }
    } catch (err) {
      console.error('Stop scanner error:', err);
    } finally {
      setScanning(false);
      isStopping.current = false;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (scanning || !open) return;

    setError(null);
    setScannedData(null);
    setStatus('scanning');

    try {
      // Ensure previous instance is cleaned up
      await stopScanner();

      // Small delay to ensure DOM is ready
      await new Promise((r) => setTimeout(r, 300));

      const scannerId = 'qr-scanner-region';
      // Make sure the element exists
      const el = document.getElementById(scannerId);
      if (!el) {
        setError('عنصر الماسح غير جاهز');
        setStatus('error');
        return;
      }

      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Successfully scanned
          setScannedData(decodedText);
          setStatus('success');
          onScan(decodedText);
          // Stop after successful scan
          stopScanner();
        },
        () => {
          // QR code not found in frame (normal during scanning) - ignore
        }
      );

      setScanning(true);
    } catch (err: unknown) {
      console.error('Start scanner error:', err);
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('NotAllowedError') || message.includes('Permission')) {
        setError('تم رفض إذن الكاميرا. يرجى السماح بالوصول للكاميرا في إعدادات المتصفح');
      } else if (message.includes('NotFoundError') || message.includes('Requested device not found')) {
        setError('لم يتم العثور على كاميرا. يرجى التأكد من وجود كاميرا على جهازك');
      } else if (message.includes('NotReadableError') || message.includes('Could not start')) {
        setError('لا يمكن الوصول للكاميرا. ربما تكون مستخدمة من تطبيق آخر');
      } else {
        setError('حدث خطأ أثناء تشغيل الكاميرا. يرجى المحاولة مرة أخرى');
      }
      setStatus('error');
      setScanning(false);
    }
  }, [open, onScan, stopScanner]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopScanner();
      setStatus('idle');
      setError(null);
      setScannedData(null);
    }
  }, [open, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleClose = () => {
    stopScanner();
    setStatus('idle');
    setError(null);
    setScannedData(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-emerald-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Scanner viewport */}
          <div className="relative w-full overflow-hidden rounded-xl bg-black/5 border" style={{ minHeight: '280px' }}>
            <div id="qr-scanner-region" ref={containerRef} className="w-full" />

            {/* Overlay when not scanning */}
            {!scanning && status !== 'success' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/5 gap-3">
                <Camera className="h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">اضغط لبدء المسح</p>
              </div>
            )}

            {/* Success overlay */}
            {status === 'success' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-50/90 gap-3">
                <CheckCircle2 className="h-14 w-14 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">تم المسح بنجاح!</p>
              </div>
            )}

            {/* Error overlay */}
            {status === 'error' && error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50/90 gap-3 p-4">
                <XCircle className="h-12 w-12 text-rose-500" />
                <p className="text-sm text-rose-700 text-center">{error}</p>
              </div>
            )}
          </div>

          {/* Scan instruction */}
          {scanning && (
            <p className="text-xs text-muted-foreground text-center animate-pulse">
              وجّه الكاميرا نحو رمز QR لتسجيل الحضور...
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 w-full">
            {!scanning && status !== 'success' && (
              <Button
                onClick={startScanner}
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Camera className="h-4 w-4" />
                بدء المسح
              </Button>
            )}

            {scanning && (
              <Button
                onClick={stopScanner}
                variant="destructive"
                className="flex-1 gap-2"
              >
                <X className="h-4 w-4" />
                إيقاف المسح
              </Button>
            )}

            {status === 'error' && (
              <Button
                onClick={startScanner}
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Loader2 className="h-4 w-4" />
                إعادة المحاولة
              </Button>
            )}

            {status === 'success' && (
              <Button
                onClick={handleClose}
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                تم
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
