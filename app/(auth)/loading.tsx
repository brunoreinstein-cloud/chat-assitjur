export default function AuthLoading() {
  return (
    <div
      className="flex h-dvh w-screen items-center justify-center bg-background"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden
        />
        <p className="text-muted-foreground text-sm">A carregar…</p>
      </div>
    </div>
  );
}
