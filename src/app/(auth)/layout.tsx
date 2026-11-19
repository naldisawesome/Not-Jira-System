import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-fade-in">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Tessera</p>
      </div>
      <div className="relative hidden overflow-hidden bg-[#0d3b36] lg:block">
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "linear-gradient(#5eead4 1px, transparent 1px), linear-gradient(90deg, #5eead4 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <div className="mb-10 grid w-fit grid-cols-3 gap-3">
            {["#5eead4", "#ffffff", "#2dd4bf", "#ffffff22", "#99f6e4", "#ffffff", "#14b8a6", "#ffffff22", "#5eead4"].map((c, i) => (
              <div key={i} className="size-16 rounded-xl" style={{ background: c, opacity: c.endsWith("22") ? 1 : 0.9 }} />
            ))}
          </div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Every piece of work, fitted into place.</h2>
          <p className="mt-3 max-w-md text-sm text-teal-100/80">Projects, issues, sprints and files in one calm workspace — so your team spends less time updating tools and more time shipping.</p>
        </div>
      </div>
    </div>
  );
}
