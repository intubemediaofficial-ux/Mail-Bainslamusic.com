import Link from "next/link";

export default function Logo({ className = "", companyName = "KVSPT" }: { className?: string; companyName?: string }) {
  const head = companyName.slice(0, Math.max(1, companyName.length - 2));
  const tail = companyName.slice(head.length);
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`} aria-label={`${companyName} home`}>
      <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-600 to-cyan-500 shadow-lg shadow-fuchsia-600/30">
        <span className="flex h-4 items-end gap-[3px]">
          <span className="eq-bar h-full w-[3px] rounded-full bg-white" style={{ animationDelay: "0s" }} />
          <span className="eq-bar h-full w-[3px] rounded-full bg-white" style={{ animationDelay: "0.2s" }} />
          <span className="eq-bar h-full w-[3px] rounded-full bg-white" style={{ animationDelay: "0.4s" }} />
          <span className="eq-bar h-full w-[3px] rounded-full bg-white" style={{ animationDelay: "0.1s" }} />
        </span>
      </span>
      <span className="text-xl font-extrabold tracking-tight text-white">
        {head}
        <span className="gradient-text">{tail}</span>
      </span>
    </Link>
  );
}
