export function Footer() {
    return (
        <footer className="border-t border-gray-200 bg-gray-50 py-8">
            <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
                <p>&copy; {new Date().getFullYear()} Routista. All rights reserved.</p>
            </div>
        </footer>
    );
}
