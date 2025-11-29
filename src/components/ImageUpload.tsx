"use client";

import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useTranslations } from 'next-intl';

interface ImageUploadProps {
    onImageSelect: (file: File) => void;
    className?: string;
    testId?: string;
}

export function ImageUpload({ onImageSelect, className, testId = "image-upload" }: ImageUploadProps) {
    const t = useTranslations('ImageUpload');
    const [preview, setPreview] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        if (file && file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
            onImageSelect(file);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const clearImage = () => {
        setPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className={cn("w-full", className)}>
            {!preview ? (
                <div
                    data-testid={`${testId}-dropzone`}
                    className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer min-h-[300px]",
                        isDragging
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                    )}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-4">
                        <Upload className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('title')}</h3>
                    <p className="text-gray-500 mb-6 max-w-xs">
                        {t('description')}
                    </p>
                    <Button data-testid={`${testId}-button`} variant="outline" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        {t('button')}
                    </Button>
                    <input
                        ref={fileInputRef}
                        data-testid={`${testId}-input`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleChange}
                    />
                </div>
            ) : (
                <div data-testid={`${testId}-preview`} className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 min-h-[300px] flex items-center justify-center">
                    <Image
                        src={preview}
                        alt="Preview"
                        width={400}
                        height={400}
                        className="max-w-full max-h-[400px] object-contain"
                    />
                    <button
                        data-testid={`${testId}-clear`}
                        onClick={clearImage}
                        className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-sm text-sm font-medium text-gray-700 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        {t('selected')}
                    </div>
                </div>
            )}
        </div>
    );
}
