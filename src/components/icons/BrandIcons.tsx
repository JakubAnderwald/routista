import { forwardRef, type SVGProps } from "react";

/**
 * Brand icons that lucide-react removed in v1.
 *
 * lucide dropped its brand/logo marks (Facebook, Github, Instagram, Twitter) at the
 * 1.x boundary, which is what broke the build on the 0.554 -> 1.x bump. These are the
 * original lucide paths, kept so the icons render exactly as they did before, and so
 * we don't pull in a whole icon package for four glyphs.
 *
 * Props mirror lucide's own signature — `size` plus any SVG attribute — so call sites
 * only change their import, not their usage.
 *
 * Paths from lucide-react@0.554.0, ISC licensed. https://lucide.dev
 */

export interface BrandIconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
    size?: number | string;
}

/** Shared lucide rendering conventions: 24px grid, round stroke, no fill. */
const withLucideDefaults = (
    displayName: string,
    slug: string,
    children: React.ReactNode,
) => {
    const Icon = forwardRef<SVGSVGElement, BrandIconProps>(function Icon(
        { size = 24, className, ...props },
        ref,
    ) {
        return (
            <svg
                ref={ref}
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={className ? `lucide lucide-${slug} ${className}` : `lucide lucide-${slug}`}
                aria-hidden="true"
                {...props}
            >
                {children}
            </svg>
        );
    });
    Icon.displayName = displayName;
    return Icon;
};

export const Facebook = withLucideDefaults(
    "Facebook",
    "facebook",
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
);

export const Github = withLucideDefaults(
    "Github",
    "github",
    <>
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
    </>,
);

export const Instagram = withLucideDefaults(
    "Instagram",
    "instagram",
    <>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </>,
);

export const Twitter = withLucideDefaults(
    "Twitter",
    "twitter",
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />,
);
