/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupportButton } from '@/components/SupportButton';

// Mock the analytics module
vi.mock('@/lib/analytics', () => ({
    track: vi.fn(),
}));

import { track } from '@/lib/analytics';

describe('SupportButton', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render with the provided label', () => {
        render(<SupportButton location="home" label="Buy Me a Coffee" />);
        
        expect(screen.getByRole('link')).toBeDefined();
        expect(screen.getByText('Buy Me a Coffee')).toBeDefined();
    });

    it('should link to Buy Me a Coffee', () => {
        render(<SupportButton location="home" label="Support" />);
        
        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('https://buymeacoffee.com/jakubanderwald');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('should track support_click event with home location', () => {
        render(<SupportButton location="home" label="Support" />);
        
        const link = screen.getByRole('link');
        fireEvent.click(link);
        
        expect(track).toHaveBeenCalledWith('support_click', { location: 'home' });
    });

    it('should track support_click event with about location', () => {
        render(<SupportButton location="about" label="Support" />);
        
        const link = screen.getByRole('link');
        fireEvent.click(link);
        
        expect(track).toHaveBeenCalledWith('support_click', { location: 'about' });
    });

    it('should render with different labels', () => {
        const { rerender } = render(<SupportButton location="home" label="Support Us" />);
        expect(screen.getByText('Support Us')).toBeDefined();
        
        rerender(<SupportButton location="about" label="Donate Now" />);
        expect(screen.getByText('Donate Now')).toBeDefined();
    });
});
