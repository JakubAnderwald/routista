"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { X, Check, Trash2, Undo } from "lucide-react";
import { useTranslations } from 'next-intl';

interface Point {
    x: number;
    y: number;
}

interface ShapeEditorProps {
    imageSrc: string | null;
    initialPoints?: Point[]; // Normalized 0-1
    onSave: (points: Point[]) => void;
    onCancel: () => void;
}

export function ShapeEditor({ imageSrc, initialPoints = [], onSave, onCancel }: ShapeEditorProps) {
    const t = useTranslations('ShapeEditor');
    const [points, setPoints] = useState<Point[]>(initialPoints);
    const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const isDraggingRef = useRef(false);

    const getNormalizedPoint = (e: React.MouseEvent<Element> | React.TouchEvent<Element>) => {
        if (!svgRef.current) return null;
        const rect = svgRef.current.getBoundingClientRect();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        return { x, y };
    };

    const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
        // Prevent adding point if we just finished dragging
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            return;
        }

        const point = getNormalizedPoint(e);
        if (point) {
            setPoints([...points, point]);
        }
    };

    const handlePointMouseDown = (e: React.MouseEvent, index: number) => {
        e.stopPropagation(); // Prevent SVG click
        setDraggingPointIndex(index);
        isDraggingRef.current = false;
    };

    const handlePointTouchStart = (e: React.TouchEvent, index: number) => {
        e.stopPropagation();
        setDraggingPointIndex(index);
        isDraggingRef.current = false;
    };

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (draggingPointIndex === null) return;

        isDraggingRef.current = true;
        const point = getNormalizedPoint(e);
        if (point) {
            const newPoints = [...points];
            newPoints[draggingPointIndex] = point;
            setPoints(newPoints);
        }
    };

    const handleMouseUp = () => {
        setDraggingPointIndex(null);
        // We delay resetting isDraggingRef slightly to catch the click event if it fires immediately
        setTimeout(() => {
            isDraggingRef.current = false;
        }, 100);
    };

    const handleUndo = () => {
        setPoints(points.slice(0, -1));
    };

    const handleClear = () => {
        setPoints([]);
    };

    const handleSave = () => {
        if (points.length < 3) {
            alert(t('minPointsError'));
            return;
        }
        onSave(points);
    };

    // Convert normalized points to SVG coordinates string
    const getPolygonPoints = () => {
        return points.map(p => `${p.x * 100},${p.y * 100}`).join(" ");
    };

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold dark:text-white">{t('title')}</h3>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleUndo} disabled={points.length === 0} title={t('undo')}>
                        <Undo className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClear} disabled={points.length === 0} title={t('clear')}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                </div>
            </div>

            <div
                className="relative flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 select-none touch-none flex items-center justify-center p-4"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                onTouchCancel={handleMouseUp}
            >
                {/* Container that matches image aspect ratio */}
                <div className="relative inline-flex max-w-full max-h-full" style={{ aspectRatio: 'auto' }}>
                    {/* Background Image */}
                    {imageSrc ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={imageSrc}
                            alt="Reference"
                            className="max-w-full max-h-full w-auto h-auto object-contain opacity-50 pointer-events-none block"
                            draggable={false}
                        />
                    ) : (
                        <div className="w-[500px] h-[500px] max-w-full max-h-full opacity-10 pointer-events-none"
                            style={{ backgroundImage: 'radial-gradient(circle, #888 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                        />
                    )}

                    {/* Drawing Surface - Absolute over the image container */}
                    <svg
                        ref={svgRef}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full cursor-crosshair"
                        onClick={handleSvgClick}
                    >
                        {/* The Polygon Preview */}
                        {points.length > 0 && (
                            <polygon
                                points={getPolygonPoints()}
                                fill="rgba(59, 130, 246, 0.2)"
                                stroke="#3b82f6"
                                strokeWidth="0.5"
                                vectorEffect="non-scaling-stroke"
                                className="pointer-events-none"
                            />
                        )}

                        {/* The Points */}
                        {points.map((p, i) => (
                            <circle
                                key={i}
                                cx={p.x * 100}
                                cy={p.y * 100}
                                r="2"
                                fill={i === points.length - 1 ? "#ffff00" : "white"}
                                stroke="#3b82f6"
                                strokeWidth="0.5"
                                vectorEffect="non-scaling-stroke"
                                className="cursor-move hover:r-3 transition-all"
                                onMouseDown={(e) => handlePointMouseDown(e, i)}
                                onTouchStart={(e) => handlePointTouchStart(e, i)}
                            />
                        ))}

                        {/* Closing Line Preview (if > 2 points) */}
                        {points.length > 2 && (
                            <line
                                x1={points[points.length - 1].x * 100}
                                y1={points[points.length - 1].y * 100}
                                x2={points[0].x * 100}
                                y2={points[0].y * 100}
                                stroke="#3b82f6"
                                strokeWidth="0.5"
                                strokeDasharray="2"
                                opacity="0.5"
                                vectorEffect="non-scaling-stroke"
                                className="pointer-events-none"
                            />
                        )}
                    </svg>
                </div>
            </div>

            <div className="flex justify-between mt-4 relative z-20">
                <Button variant="outline" onClick={onCancel}>
                    <X className="w-4 h-4 mr-2" />
                    {t('cancel')}
                </Button>
                <Button onClick={handleSave} disabled={points.length < 3} data-testid="save-shape-button" type="button">
                    <Check className="w-4 h-4 mr-2" />
                    {t('save')}
                </Button>
            </div>
        </div>
    );
}
