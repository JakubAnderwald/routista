import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSelector } from '../../src/components/ModeSelector';
import type { TransportMode } from '../../src/config';

// Mock next-intl
vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

describe('ModeSelector', () => {
    const mockOnSelect = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initial render', () => {
        it('should render all three transport modes', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            // Check for all three mode buttons
            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(3);
        });

        it('should display walking mode', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            expect(screen.getByText('walking')).toBeInTheDocument();
            expect(screen.getByText('walkingDesc')).toBeInTheDocument();
        });

        it('should display cycling mode', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            expect(screen.getByText('cycling')).toBeInTheDocument();
            expect(screen.getByText('cyclingDesc')).toBeInTheDocument();
        });

        it('should display driving mode', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            expect(screen.getByText('driving')).toBeInTheDocument();
            expect(screen.getByText('drivingDesc')).toBeInTheDocument();
        });

        it('should render with responsive grid layout', () => {
            const { container } = render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            const grid = container.querySelector('.grid');
            expect(grid).toHaveClass('md:grid-cols-3');
        });
    });

    describe('selection behavior', () => {
        it('should call onSelect with foot-walking when walking mode is clicked', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            const walkingButton = screen.getByText('walking').closest('button');
            fireEvent.click(walkingButton!);

            expect(mockOnSelect).toHaveBeenCalledWith('foot-walking');
        });

        it('should call onSelect with cycling-regular when cycling mode is clicked', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            const cyclingButton = screen.getByText('cycling').closest('button');
            fireEvent.click(cyclingButton!);

            expect(mockOnSelect).toHaveBeenCalledWith('cycling-regular');
        });

        it('should call onSelect with driving-car when driving mode is clicked', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            const drivingButton = screen.getByText('driving').closest('button');
            fireEvent.click(drivingButton!);

            expect(mockOnSelect).toHaveBeenCalledWith('driving-car');
        });
    });

    describe('selected state styling', () => {
        it('should highlight walking mode when selected', () => {
            render(<ModeSelector selectedMode={'foot-walking' as TransportMode} onSelect={mockOnSelect} />);

            const walkingButton = screen.getByText('walking').closest('button');
            expect(walkingButton).toHaveClass('border-blue-600');
            expect(walkingButton).toHaveClass('bg-blue-50');
        });

        it('should highlight cycling mode when selected', () => {
            render(<ModeSelector selectedMode={'cycling-regular' as TransportMode} onSelect={mockOnSelect} />);

            const cyclingButton = screen.getByText('cycling').closest('button');
            expect(cyclingButton).toHaveClass('border-blue-600');
        });

        it('should highlight driving mode when selected', () => {
            render(<ModeSelector selectedMode={'driving-car' as TransportMode} onSelect={mockOnSelect} />);

            const drivingButton = screen.getByText('driving').closest('button');
            expect(drivingButton).toHaveClass('border-blue-600');
        });

        it('should not highlight unselected modes', () => {
            render(<ModeSelector selectedMode={'foot-walking' as TransportMode} onSelect={mockOnSelect} />);

            const cyclingButton = screen.getByText('cycling').closest('button');
            const drivingButton = screen.getByText('driving').closest('button');

            expect(cyclingButton).not.toHaveClass('border-blue-600');
            expect(drivingButton).not.toHaveClass('border-blue-600');
        });

        it('should show no selection when selectedMode is null', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            const buttons = screen.getAllByRole('button');
            buttons.forEach((button) => {
                expect(button).not.toHaveClass('border-blue-600');
            });
        });
    });

    describe('icon styling', () => {
        it('should show blue icon background when mode is selected', () => {
            render(<ModeSelector selectedMode={'foot-walking' as TransportMode} onSelect={mockOnSelect} />);

            const walkingButton = screen.getByText('walking').closest('button');
            const iconContainer = walkingButton?.querySelector('.rounded-full');
            expect(iconContainer).toHaveClass('bg-blue-600');
            expect(iconContainer).toHaveClass('text-white');
        });

        it('should show gray icon background when mode is not selected', () => {
            render(<ModeSelector selectedMode={null} onSelect={mockOnSelect} />);

            const walkingButton = screen.getByText('walking').closest('button');
            const iconContainer = walkingButton?.querySelector('.rounded-full');
            expect(iconContainer).toHaveClass('bg-gray-100');
        });
    });
});

