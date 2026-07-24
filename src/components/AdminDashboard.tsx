export function AdminDashboard() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <section className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Bytspot ops</p>
        <h1 className="mt-3 text-3xl font-black">Dashboard unavailable</h1>
        <p className="mt-4 text-sm font-semibold leading-6 text-white/70">
          Internal operations have moved to the approved admin approvals surface. This compatibility
          screen keeps legacy routes build-safe without exposing consumer App Store functionality.
        </p>
      </section>
    </main>
  );
}

export default AdminDashboard;
