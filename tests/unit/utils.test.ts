import { describe, it, expect } from 'vitest';
import { cn } from '../../src/lib/utils';

describe('utils', () => {
    describe('cn', () => {
        it('should merge multiple class names', () => {
            const result = cn('class1', 'class2', 'class3');
            expect(result).toBe('class1 class2 class3');
        });

        it('should handle empty inputs', () => {
            expect(cn()).toBe('');
            expect(cn('')).toBe('');
            expect(cn('', '')).toBe('');
        });

        it('should handle undefined and null inputs', () => {
            expect(cn(undefined)).toBe('');
            expect(cn(null)).toBe('');
            expect(cn(undefined, null, 'class1')).toBe('class1');
        });

        it('should handle boolean inputs (clsx syntax)', () => {
            expect(cn('base', false && 'hidden')).toBe('base');
            expect(cn('base', true && 'visible')).toBe('base visible');
        });

        it('should handle object syntax (clsx conditional classes)', () => {
            expect(cn({ hidden: false, visible: true })).toBe('visible');
            expect(cn('base', { active: true, disabled: false })).toBe('base active');
        });

        it('should handle array syntax', () => {
            expect(cn(['class1', 'class2'])).toBe('class1 class2');
            expect(cn('base', ['nested1', 'nested2'])).toBe('base nested1 nested2');
        });

        it('should merge conflicting Tailwind classes (tailwind-merge)', () => {
            // tailwind-merge should keep the later class when there's a conflict
            expect(cn('px-2', 'px-4')).toBe('px-4');
            expect(cn('pt-2', 'pt-4')).toBe('pt-4');
            expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
        });

        it('should handle complex Tailwind class conflicts', () => {
            // More complex merging scenarios
            expect(cn('p-4', 'px-2')).toBe('p-4 px-2');
            expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
            expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500');
        });

        it('should preserve non-conflicting classes', () => {
            expect(cn('flex', 'items-center', 'justify-between', 'gap-4')).toBe(
                'flex items-center justify-between gap-4'
            );
        });

        it('should handle mixed input types', () => {
            const result = cn(
                'base-class',
                undefined,
                { conditional: true },
                ['array-class'],
                null,
                'final-class'
            );
            expect(result).toBe('base-class conditional array-class final-class');
        });

        it('should handle whitespace in class names', () => {
            expect(cn('  class1  ', 'class2')).toBe('class1 class2');
        });
    });
});

