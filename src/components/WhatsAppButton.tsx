import { MessageCircle } from "lucide-react";

export default function WhatsAppButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-green-500/30 transition hover:scale-105"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
