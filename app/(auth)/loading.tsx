export default function AuthLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[200px] w-full items-center justify-center"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          aria-hidden
          className="size-8 animate-spin rounded-full border-2 border-gold-accent border-t-transparent"
        />
        <p className="text-assistjur-gray-light text-sm">A carregar…</p>
      </div>
    </div>
  );
}
