import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// The map itself is Leaflet and irrelevant here; only the search box is under test.
vi.mock('next/dynamic', () => ({
    default: () => () => null,
}));

vi.mock('react-leaflet', () => ({
    useMap: vi.fn(),
    useMapEvents: vi.fn(),
    Circle: () => null,
}));

vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

import { AreaSelector } from '../../src/components/AreaSelector';

const mockFetch = vi.fn();

/** Debounce in AreaSelector is 400 ms; give waitFor room past it. */
const WAIT = { timeout: 2000 };

function typeQuery(value: string) {
    fireEvent.change(screen.getByPlaceholderText('searchPlaceholder'), { target: { value } });
}

describe('AreaSelector search', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('does not look up queries shorter than 3 characters', async () => {
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('Lo');
        await new Promise(resolve => setTimeout(resolve, 600));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows suggestions for a longer query', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ addresses: [{ latitude: 51.5, longitude: -0.1, formattedAddress: 'London, UK' }] }),
        });
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('London');

        expect(await screen.findByText('London, UK', {}, WAIT)).toBeInTheDocument();
        expect(mockFetch).toHaveBeenCalledOnce();
        expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ query: 'London' });
    });

    it('sends only the last query when typing quickly', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ addresses: [] }) });
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('Lon');
        typeQuery('Lond');
        typeQuery('London');

        await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce(), WAIT);
        expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ query: 'London' });
    });

    it('tells the user when searches are rate limited', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('London');

        expect(await screen.findByText('searchRateLimited', {}, WAIT)).toBeInTheDocument();
    });

    it('tells the user when the search service errors', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('London');

        expect(await screen.findByText('searchFailed', {}, WAIT)).toBeInTheDocument();
    });

    it('tells the user when the request itself fails', async () => {
        mockFetch.mockRejectedValue(new Error('offline'));
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('London');

        expect(await screen.findByText('searchFailed', {}, WAIT)).toBeInTheDocument();
    });

    it('ignores a lookup that a newer keystroke cancelled', async () => {
        // The first request only settles when aborted; the second answers normally.
        mockFetch
            .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ addresses: [{ latitude: 52.2, longitude: 21, formattedAddress: 'Warsaw, PL' }] }),
            });
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('Lon');
        await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce(), WAIT);
        typeQuery('Warsaw');

        expect(await screen.findByText('Warsaw, PL', {}, WAIT)).toBeInTheDocument();
        expect(screen.queryByText('searchFailed')).not.toBeInTheDocument();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('clears the error once the query is shortened again', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
        render(<AreaSelector onAreaSelect={vi.fn()} />);

        typeQuery('London');
        await screen.findByText('searchRateLimited', {}, WAIT);

        typeQuery('Lo');
        await waitFor(() => expect(screen.queryByText('searchRateLimited')).not.toBeInTheDocument(), WAIT);
    });
});
