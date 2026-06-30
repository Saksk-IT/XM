import { Loader2, Save } from "lucide-react";
import type { ReactNode } from "react";
import type { Priority } from "@xm/shared";
import { priorityLabels } from "@xm/shared";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block text-xs font-semibold text-muted">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="focus-ring rounded-md p-1.5 text-muted hover:bg-slate-100" aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function ModalActions({ onClose, saving }: { onClose: () => void; saving: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="focus-ring h-10 rounded-md border border-line px-4 text-sm hover:bg-slate-50"
      >
        取消
      </button>
      <button
        className="focus-ring flex h-10 items-center gap-2 rounded-md bg-feature px-4 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
        disabled={saving}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        保存
      </button>
    </div>
  );
}

export function Metric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-panel">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const styles: Record<Priority, string> = {
    HIGH: "border-red-200 bg-red-50 text-red-700",
    MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
    LOW: "border-green-200 bg-green-50 text-green-700"
  };
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold ${styles[priority]}`}>
      {priorityLabels[priority]}
    </span>
  );
}
