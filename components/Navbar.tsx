import Link from "next/link";

export function Navbar() {
  return (
    <header className="flex items-end gap-6 px-[2.5%] pt-4">
      <Link href="/landing">
        <img src="/logo.png" alt="SPARK" className="h-11" />
      </Link>
      <Link href="/dashboard" className="text-lg text-[#483519] underline transition hover:opacity-60">
        Dashboard
      </Link>
      <Link href="/settings" className="text-lg text-[#483519] underline transition hover:opacity-60">
        Settings
      </Link>
      <Link
        href="/register"
        className="ml-auto rounded-full bg-[#483519] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#483519]/80"
      >
        Register
      </Link>
    </header>
  );
}
