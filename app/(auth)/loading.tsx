export default function AuthLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex h-dvh w-screen items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
        <p className="text-muted-foreground text-sm">A carregar…</p>
      </div>
    </div>
  );
}
