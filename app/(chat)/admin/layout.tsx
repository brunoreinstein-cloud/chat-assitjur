import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-border/60 border-b bg-muted/30 px-4 py-2">
        <AdminNav />
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
