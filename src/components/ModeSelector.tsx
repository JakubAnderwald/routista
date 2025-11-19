import { Car, Footprints, Bike } from "lucide-react";
import { cn } from "@/lib/utils";

export type TransportMode = "foot-walking" | "cycling-regular" | "driving-car";

interface ModeSelectorProps {
    selectedMode: TransportMode | null;
    onSelect: (mode: TransportMode) => void;
}

export function ModeSelector({ selectedMode, onSelect }: ModeSelectorProps) {
    const modes = [
        {
            id: "foot-walking",
            label: "Walking",
            icon: Footprints,
            description: "Best for parks and city centers.",
        },
        {
            id: "cycling-regular",
            label: "Cycling",
            icon: Bike,
            description: "Good for larger shapes and roads.",
        },
        {
            id: "driving-car",
            label: "Driving",
            icon: Car,
            description: "For massive shapes across cities.",
        },
    ] as const;

    return (
        <div className="grid md:grid-cols-3 gap-4 w-full max-w-3xl">
            {modes.map((mode) => {
                const Icon = mode.icon;
                const isSelected = selectedMode === mode.id;
                return (
                    <button
                        key={mode.id}
                        onClick={() => onSelect(mode.id)}
                        className={cn(
                            "flex flex-col items-center p-6 rounded-xl border-2 transition-all text-left hover:border-blue-300 hover:bg-blue-50",
                            isSelected
                                ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                                : "border-gray-200 bg-white"
                        )}
                    >
                        <div
                            className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center mb-4",
                                isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                            )}
                        >
                            <Icon className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold mb-1">{mode.label}</h3>
                        <p className="text-sm text-gray-500 text-center">{mode.description}</p>
                    </button>
                );
            })}
        </div>
    );
}
