/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock next/navigation before importing the component
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/en/create'),
  useSearchParams: vi.fn(() => ({
    toString: () => 'step=1',
  })),
}));

// Mock posthog-js
const mockInit = vi.fn();
const mockCapture = vi.fn();
const mockRegister = vi.fn();
const mockPosthog = {
  init: mockInit,
  capture: mockCapture,
  register: mockRegister,
};

vi.mock('posthog-js', () => ({
  default: mockPosthog,
}));

// Mock posthog-js/react
const mockUsePostHog = vi.fn(() => mockPosthog);
vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
  usePostHog: () => mockUsePostHog(),
}));

describe('PostHogProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state between tests
    vi.resetModules();
    process.env = { ...originalEnv };
    // Mock non-localhost hostname for most tests
    Object.defineProperty(window, 'location', {
      value: { hostname: 'routista.eu' },
      writable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should warn and skip init when NEXT_PUBLIC_POSTHOG_KEY is not set', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

      // Re-import to get fresh module state
      const { PostHogProvider } = await import('@/components/PostHogProvider');
      
      const { render } = await import('@testing-library/react');
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      // Wait for useEffect
      await vi.waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[PostHog] NEXT_PUBLIC_POSTHOG_KEY not set, analytics disabled'
        );
      });

      expect(mockInit).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should initialize PostHog when key is provided', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockInit).toHaveBeenCalledWith('phc_test_key', {
          api_host: 'https://eu.i.posthog.com',
          person_profiles: 'identified_only',
          capture_pageview: false,
          capture_pageleave: true,
          persistence: 'localStorage+cookie',
        });
      });

      // Should register environment as super property (without $ prefix - reserved by PostHog)
      expect(mockRegister).toHaveBeenCalledWith({
        environment: 'production',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('[PostHog] Initialized (env: production)');
      consoleLogSpy.mockRestore();
    });

    it('should register preview environment on Vercel preview deployments', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          environment: 'preview',
        });
      });
    });

    it('should register development environment when using vercel dev', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'development';

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          environment: 'development',
        });
      });
    });

    it('should register unknown environment when NEXT_PUBLIC_VERCEL_ENV is not set', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          environment: 'unknown',
        });
      });
    });

    it('should use default host when NEXT_PUBLIC_POSTHOG_HOST is not set', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockInit).toHaveBeenCalledWith('phc_test_key', expect.objectContaining({
          api_host: 'https://eu.i.posthog.com',
        }));
      });
    });

    it('should only initialize once (idempotent)', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      const { unmount: unmount1 } = render(
        <PostHogProvider>
          <div>Test 1</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockInit).toHaveBeenCalledTimes(1);
      });

      // Unmount and remount - should NOT call init again
      unmount1();
      
      render(
        <PostHogProvider>
          <div>Test 2</div>
        </PostHogProvider>
      );

      // Still only called once due to module-scoped flag
      expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it('should skip initialization on localhost', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      
      // Mock localhost
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost' },
        writable: true,
      });

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith('[PostHog] Skipped (localhost)');
      });

      expect(mockInit).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should skip initialization on 127.0.0.1', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      
      // Mock 127.0.0.1
      Object.defineProperty(window, 'location', {
        value: { hostname: '127.0.0.1' },
        writable: true,
      });

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith('[PostHog] Skipped (localhost)');
      });

      expect(mockInit).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should skip initialization on IPv6 localhost (::1)', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      
      // Mock IPv6 localhost
      Object.defineProperty(window, 'location', {
        value: { hostname: '::1' },
        writable: true,
      });

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith('[PostHog] Skipped (localhost)');
      });

      expect(mockInit).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  describe('pageview tracking', () => {
    it('should capture pageview with correct URL', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';

      // Mock window.origin
      Object.defineProperty(window, 'origin', {
        value: 'https://routista.eu',
        writable: true,
      });

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockCapture).toHaveBeenCalledWith('$pageview', {
          $current_url: 'https://routista.eu/en/create?step=1',
        });
      });
    });

    it('should capture pageview without search params when empty', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';

      // Mock empty search params
      const { useSearchParams } = await import('next/navigation');
      vi.mocked(useSearchParams).mockReturnValue({
        toString: () => '',
      } as ReturnType<typeof useSearchParams>);

      Object.defineProperty(window, 'origin', {
        value: 'https://routista.eu',
        writable: true,
      });

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      await vi.waitFor(() => {
        expect(mockCapture).toHaveBeenCalledWith('$pageview', {
          $current_url: 'https://routista.eu/en/create',
        });
      });
    });

    it('should skip pageview tracking on localhost', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';

      // Mock localhost
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost' },
        writable: true,
      });

      Object.defineProperty(window, 'origin', {
        value: 'http://localhost:3000',
        writable: true,
      });

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div>Test</div>
        </PostHogProvider>
      );

      // Wait a bit to ensure no calls are made
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe('children rendering', () => {
    it('should render children correctly', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { PostHogProvider } = await import('@/components/PostHogProvider');
      const { render, screen } = await import('@testing-library/react');
      
      render(
        <PostHogProvider>
          <div data-testid="child">Hello World</div>
        </PostHogProvider>
      );

      expect(screen.getByTestId('child')).toBeDefined();
      expect(screen.getByText('Hello World')).toBeDefined();
    });
  });
});
