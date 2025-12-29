import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    mapModeToStravaType,
    getStoredTokens,
    storeTokens,
    clearTokens,
    isConnected,
    isTokenExpired,
    buildOAuthUrl,
    exchangeCodeForTokens,
    refreshTokens,
    StravaTokens,
} from '../../src/lib/stravaService';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        reset: () => {
            store = {};
        },
    };
})();

// Mock fetch
const mockFetch = vi.fn();

describe('stravaService', () => {
    beforeEach(() => {
        // Setup localStorage mock
        Object.defineProperty(global, 'window', {
            value: { localStorage: localStorageMock },
            writable: true,
        });
        Object.defineProperty(global, 'localStorage', {
            value: localStorageMock,
            writable: true,
        });
        localStorageMock.reset();
        vi.clearAllMocks();
        
        // Setup fetch mock
        global.fetch = mockFetch;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('mapModeToStravaType', () => {
        it('should map foot-walking to run type', () => {
            const result = mapModeToStravaType('foot-walking');
            
            expect(result.type).toBe(2); // 2 = run
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should map cycling-regular to ride type', () => {
            const result = mapModeToStravaType('cycling-regular');
            
            expect(result.type).toBe(1); // 1 = ride
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should map driving-car to ride type (fallback)', () => {
            const result = mapModeToStravaType('driving-car');
            
            // Driving doesn't fit Strava, defaults to ride
            expect(result.type).toBe(1); // 1 = ride
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should default to run for unknown modes', () => {
            const result = mapModeToStravaType('unknown-mode');
            
            expect(result.type).toBe(2); // 2 = run
            expect(result.sub_type).toBe(1); // 1 = road
        });

        it('should default to run for empty string', () => {
            const result = mapModeToStravaType('');
            
            expect(result.type).toBe(2); // 2 = run
            expect(result.sub_type).toBe(1); // 1 = road
        });
    });

    describe('getStoredTokens', () => {
        it('should return null when no tokens stored', () => {
            const result = getStoredTokens();
            expect(result).toBeNull();
        });

        it('should return tokens when stored', () => {
            const tokens: StravaTokens = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                athlete: { id: 123, firstname: 'John', lastname: 'Doe' },
            };
            localStorageMock.setItem('routista_strava_tokens', JSON.stringify(tokens));
            
            const result = getStoredTokens();
            
            expect(result).toEqual(tokens);
        });

        it('should return null for invalid JSON', () => {
            localStorageMock.setItem('routista_strava_tokens', 'invalid-json');
            localStorageMock.getItem.mockReturnValueOnce('invalid-json');
            
            const result = getStoredTokens();
            
            expect(result).toBeNull();
        });
    });

    describe('storeTokens', () => {
        it('should store tokens in localStorage', () => {
            const tokens: StravaTokens = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            };
            
            storeTokens(tokens);
            
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'routista_strava_tokens',
                JSON.stringify(tokens)
            );
        });
    });

    describe('clearTokens', () => {
        it('should remove tokens from localStorage', () => {
            clearTokens();
            
            expect(localStorageMock.removeItem).toHaveBeenCalledWith('routista_strava_tokens');
        });
    });

    describe('isConnected', () => {
        it('should return false when no tokens stored', () => {
            expect(isConnected()).toBe(false);
        });

        it('should return true when tokens are stored', () => {
            const tokens: StravaTokens = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
            };
            localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(tokens));
            
            expect(isConnected()).toBe(true);
        });
    });

    describe('isTokenExpired', () => {
        it('should return true when no tokens stored', () => {
            expect(isTokenExpired()).toBe(true);
        });

        it('should return true when token is expired', () => {
            const tokens: StravaTokens = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) - 100, // Expired
            };
            localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(tokens));
            
            expect(isTokenExpired()).toBe(true);
        });

        it('should return true when token expires within 60 seconds', () => {
            const tokens: StravaTokens = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 30, // Expires in 30s
            };
            localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(tokens));
            
            expect(isTokenExpired()).toBe(true);
        });

        it('should return false when token is valid', () => {
            const tokens: StravaTokens = {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_at: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
            };
            localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(tokens));
            
            expect(isTokenExpired()).toBe(false);
        });
    });

    describe('buildOAuthUrl', () => {
        it('should throw error when client ID is not configured', () => {
            vi.stubEnv('NEXT_PUBLIC_STRAVA_CLIENT_ID', '');
            vi.stubEnv('NEXT_PUBLIC_STRAVA_REDIRECT_URI', 'https://example.com/callback');
            
            expect(() => buildOAuthUrl()).toThrow('Strava client ID not configured');
        });

        it('should throw error when redirect URI is not configured', () => {
            vi.stubEnv('NEXT_PUBLIC_STRAVA_CLIENT_ID', 'test-client-id');
            vi.stubEnv('NEXT_PUBLIC_STRAVA_REDIRECT_URI', '');
            
            expect(() => buildOAuthUrl()).toThrow('Strava redirect URI not configured');
        });

        it('should build correct OAuth URL', () => {
            vi.stubEnv('NEXT_PUBLIC_STRAVA_CLIENT_ID', 'test-client-id');
            vi.stubEnv('NEXT_PUBLIC_STRAVA_REDIRECT_URI', 'https://example.com/callback');
            
            const url = buildOAuthUrl();
            
            expect(url).toContain('https://www.strava.com/oauth/authorize');
            expect(url).toContain('client_id=test-client-id');
            expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
            expect(url).toContain('response_type=code');
            expect(url).toContain('scope=read%2Cactivity%3Awrite%2Cread_all');
            expect(url).toContain('approval_prompt=auto');
        });
    });

    describe('exchangeCodeForTokens', () => {
        it('should exchange code for tokens successfully', async () => {
            const mockResponse = {
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_at: 1234567890,
                athlete: { id: 123, firstname: 'John', lastname: 'Doe' },
            };
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });
            
            const result = await exchangeCodeForTokens('auth-code', 'client-id', 'client-secret');
            
            expect(mockFetch).toHaveBeenCalledWith(
                'https://www.strava.com/oauth/token',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: 'client-id',
                        client_secret: 'client-secret',
                        code: 'auth-code',
                        grant_type: 'authorization_code',
                    }),
                })
            );
            
            expect(result).toEqual({
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                expires_at: 1234567890,
                athlete: { id: 123, firstname: 'John', lastname: 'Doe' },
            });
        });

        it('should throw error when exchange fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            });
            
            await expect(
                exchangeCodeForTokens('invalid-code', 'client-id', 'client-secret')
            ).rejects.toThrow('Token exchange failed: 401');
        });
    });

    describe('refreshTokens', () => {
        it('should refresh tokens successfully', async () => {
            const mockResponse = {
                access_token: 'refreshed-access-token',
                refresh_token: 'refreshed-refresh-token',
                expires_at: 1234567890,
            };
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });
            
            const result = await refreshTokens('old-refresh-token', 'client-id', 'client-secret');
            
            expect(mockFetch).toHaveBeenCalledWith(
                'https://www.strava.com/oauth/token',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: 'client-id',
                        client_secret: 'client-secret',
                        refresh_token: 'old-refresh-token',
                        grant_type: 'refresh_token',
                    }),
                })
            );
            
            expect(result).toEqual({
                access_token: 'refreshed-access-token',
                refresh_token: 'refreshed-refresh-token',
                expires_at: 1234567890,
            });
        });

        it('should throw error when refresh fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => 'Invalid refresh token',
            });
            
            await expect(
                refreshTokens('invalid-token', 'client-id', 'client-secret')
            ).rejects.toThrow('Token refresh failed: 401');
        });
    });
});
