import Link from "next/link";
import { Map } from "lucide-react";

export function Header() {
    return (
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl text-blue-600">
                    <Map className="h-6 w-6" />
                    <span>Routista</span>
                </Link>
                <nav className="flex gap-6 text-sm font-medium text-gray-600">
                    <Link href="/" className="hover:text-blue-600 transition-colors">
                        Home
                    </Link>
                    <Link href="/about" className="hover:text-blue-600 transition-colors">
                        About
                    </Link>
                </nav>
            </div>
        </header>
    );
}
