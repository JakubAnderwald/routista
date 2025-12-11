import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: Parameters<typeof intlMiddleware>[0]) {
    return intlMiddleware(request);
}

export const config = {
    // Match all pathnames except for:
    // - API routes
    // - Static files (_next/static)
    // - Image optimization files (_next/image)
    // - Favicon and other public files (e.g. images)
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)).*)']
};
