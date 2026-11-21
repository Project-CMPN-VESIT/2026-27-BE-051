import { AdminGate } from "@/components/admin/gate";
import { AdminSidebar, AdminMobileNav } from "@/components/admin/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <div className="flex items-start">
        <AdminSidebar />
        <div className="flex-1 min-w-0">
          <AdminMobileNav />
          <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-6xl mx-auto">{children}</div>
        </div>
      </div>
    </AdminGate>
  );
}
