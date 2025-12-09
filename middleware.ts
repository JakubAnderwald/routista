import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './src/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const AB_COOKIE_NAME = 'routista-ab-variant';
const AB_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default function middleware(request: NextRequest) {
    // Run the next-intl middleware first
    const response = intlMiddleware(request);
    
    // Check if A/B variant cookie exists
    const existingVariant = request.cookies.get(AB_COOKIE_NAME)?.value;
    
    if (!existingVariant) {
        // Assign random variant (50/50 split)
        const variant = Math.random() < 0.5 ? 'A' : 'B';
        
        // Set the cookie on the response
        response.cookies.set(AB_COOKIE_NAME, variant, {
            maxAge: AB_COOKIE_MAX_AGE,
            path: '/',
            sameSite: 'lax',
        });
    }
    
    return response;
}

export const config = {
    // Match all pathnames except for:
    // - API routes
    // - Static files (_next/static)
    // - Image optimization files (_next/image)
    // - Favicon and other public files (e.g. images)
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp)).*)']
};
