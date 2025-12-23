/**
 * Image processing configuration
 * 
 * Contains constants for shape extraction from images.
 */

export const IMAGE_PROCESSING = {
    /** Maximum dimension (width or height) for processing - images are scaled down */
    maxDimension: 800,
    
    /** Default number of points to sample from shape boundary */
    defaultNumPoints: 150,
    
    /** Minimum boundary points for a component to be considered significant */
    minSignificantPoints: 50,
    
    /** Noise detection thresholds */
    noise: {
        /** Components with fewer points than this are considered "small" */
        smallComponentPoints: 500,
        /** Components with fewer points than this are considered "tiny" */
        tinyComponentPoints: 200,
        /** Max small components before flagging as noise */
        maxSmallComponents: 3,
    },
    
    /** Otsu threshold fallback boundaries */
    otsu: {
        minThreshold: 20,
        maxThreshold: 235,
        defaultThreshold: 128,
    },
    
    /** Minimum light coverage ratio to consider inverting detection */
    minLightCoverageForInvert: 0.05,
};

