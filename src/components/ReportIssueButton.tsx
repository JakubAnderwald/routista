import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";

export function ReportIssueButton() {
    return (
        <Link
            href="https://github.com/JakubAnderwald/routista/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105 hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
            <MessageSquarePlus className="h-4 w-4" />
            <span>Report Issue</span>
        </Link>
    );
}
