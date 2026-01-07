import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageUpload } from '../../src/components/ImageUpload';

// Mock next-intl
vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} {...props} />
    ),
}));

// Mock FileReader
class MockFileReader {
    result: string | null = null;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

    readAsDataURL() {
        // Simulate async file reading
        setTimeout(() => {
            this.result = 'data:image/png;base64,testdata';
            if (this.onload) {
                this.onload({ target: { result: this.result } } as unknown as ProgressEvent<FileReader>);
            }
        }, 0);
    }
}

describe('ImageUpload', () => {
    const mockOnImageSelect = vi.fn();
    const originalFileReader = global.FileReader;

    beforeEach(() => {
        vi.clearAllMocks();
        // Replace FileReader with mock
        global.FileReader = MockFileReader as unknown as typeof FileReader;
    });

    afterEach(() => {
        // Restore original FileReader
        global.FileReader = originalFileReader;
    });

    describe('initial render', () => {
        it('should render dropzone when no image is selected', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            expect(screen.getByTestId('image-upload-dropzone')).toBeInTheDocument();
            expect(screen.getByText('title')).toBeInTheDocument();
            expect(screen.getByText('description')).toBeInTheDocument();
            expect(screen.getByText('instruction')).toBeInTheDocument();
        });

        it('should render upload button', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            expect(screen.getByTestId('image-upload-button')).toBeInTheDocument();
            expect(screen.getByText('button')).toBeInTheDocument();
        });

        it('should have hidden file input', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const input = screen.getByTestId('image-upload-input');
            expect(input).toHaveClass('hidden');
            expect(input).toHaveAttribute('type', 'file');
            expect(input).toHaveAttribute('accept', 'image/*');
        });

        it('should use custom testId when provided', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} testId="custom-upload" />);

            expect(screen.getByTestId('custom-upload-dropzone')).toBeInTheDocument();
            expect(screen.getByTestId('custom-upload-button')).toBeInTheDocument();
            expect(screen.getByTestId('custom-upload-input')).toBeInTheDocument();
        });
    });

    describe('file selection', () => {
        it('should call onImageSelect when valid image file is selected', async () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const file = new File(['test'], 'test.png', { type: 'image/png' });
            const input = screen.getByTestId('image-upload-input');

            fireEvent.change(input, { target: { files: [file] } });

            expect(mockOnImageSelect).toHaveBeenCalledWith(file);
        });

        it('should not call onImageSelect for non-image files', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const file = new File(['test'], 'test.txt', { type: 'text/plain' });
            const input = screen.getByTestId('image-upload-input');

            fireEvent.change(input, { target: { files: [file] } });

            expect(mockOnImageSelect).not.toHaveBeenCalled();
        });

        it('should show preview after selecting an image', async () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const file = new File(['test'], 'test.png', { type: 'image/png' });
            const input = screen.getByTestId('image-upload-input');

            fireEvent.change(input, { target: { files: [file] } });

            // Wait for FileReader to complete and preview to show
            await waitFor(() => {
                expect(screen.getByTestId('image-upload-preview')).toBeInTheDocument();
            });
            expect(screen.getByAltText('Preview')).toBeInTheDocument();
        });
    });

    describe('drag and drop', () => {
        it('should handle drag over', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');

            fireEvent.dragOver(dropzone);

            // Should have dragging styles (blue border)
            expect(dropzone).toHaveClass('border-blue-500');
        });

        it('should handle drag leave', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');

            fireEvent.dragOver(dropzone);
            fireEvent.dragLeave(dropzone);

            // Should not have dragging styles
            expect(dropzone).not.toHaveClass('border-blue-500');
        });

        it('should handle file drop', async () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');
            const file = new File(['test'], 'test.png', { type: 'image/png' });

            // Create a proper DataTransfer-like object
            const dataTransfer = {
                files: [file],
            };

            fireEvent.drop(dropzone, { dataTransfer });

            await waitFor(() => {
                expect(mockOnImageSelect).toHaveBeenCalledWith(file);
            });
        });
    });

    describe('keyboard accessibility', () => {
        it('should have role="button" and tabIndex on dropzone', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');
            expect(dropzone).toHaveAttribute('role', 'button');
            expect(dropzone).toHaveAttribute('tabIndex', '0');
        });

        it('should trigger file input on Enter key', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');
            const input = screen.getByTestId('image-upload-input') as HTMLInputElement;
            const clickSpy = vi.spyOn(input, 'click');

            fireEvent.keyDown(dropzone, { key: 'Enter' });

            expect(clickSpy).toHaveBeenCalled();
        });

        it('should trigger file input on Space key', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');
            const input = screen.getByTestId('image-upload-input') as HTMLInputElement;
            const clickSpy = vi.spyOn(input, 'click');

            fireEvent.keyDown(dropzone, { key: ' ' });

            expect(clickSpy).toHaveBeenCalled();
        });
    });

    describe('clear image', () => {
        it('should clear image and show dropzone again when clear button is clicked', async () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            // First, select an image
            const file = new File(['test'], 'test.png', { type: 'image/png' });
            const input = screen.getByTestId('image-upload-input');

            fireEvent.change(input, { target: { files: [file] } });

            // Wait for preview to appear
            await waitFor(() => {
                expect(screen.getByTestId('image-upload-preview')).toBeInTheDocument();
            });

            // Click clear button
            const clearButton = screen.getByTestId('image-upload-clear');
            fireEvent.click(clearButton);

            // Dropzone should be visible again
            expect(screen.getByTestId('image-upload-dropzone')).toBeInTheDocument();
            expect(screen.queryByTestId('image-upload-preview')).not.toBeInTheDocument();
        });
    });

    describe('click behavior', () => {
        it('should trigger file input when dropzone is clicked', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const dropzone = screen.getByTestId('image-upload-dropzone');
            const input = screen.getByTestId('image-upload-input') as HTMLInputElement;
            const clickSpy = vi.spyOn(input, 'click');

            fireEvent.click(dropzone);

            expect(clickSpy).toHaveBeenCalled();
        });

        it('should trigger file input when button is clicked', () => {
            render(<ImageUpload onImageSelect={mockOnImageSelect} />);

            const button = screen.getByTestId('image-upload-button');
            const input = screen.getByTestId('image-upload-input') as HTMLInputElement;
            const clickSpy = vi.spyOn(input, 'click');

            fireEvent.click(button);

            expect(clickSpy).toHaveBeenCalled();
        });
    });
});

