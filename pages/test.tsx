import { useEffect, useState } from 'react';

export default function TestPage() {
    const rows = 10;
    // Use state to track window width to calculate columns dynamically
    const [colsPerDomain, setColsPerDomain] = useState(30);

    const domainColors = [
        "#2ea043", // Segment 1: Green (DeFi)
        "#d29922", // Segment 2: Yellow (API)
        "#da3633", // Segment 3: Red (Security)
        "#1f6feb", // Segment 4: Blue (Identity)
        "#8957e5"  // Segment 5: Purple (AI)
    ];

    useEffect(() => {
        const updateCols = () => {
            // Screen width divided by 5 domains.
            // 40px left/right padding.
            // 6 border columns (1 left + 1 right + 4 inner).
            const gap = 2; // Tighter gap for a more continuous look
            const pixelSize = 10 + gap; // 12px

            const availableWidth = window.innerWidth - 40;
            const maxCols = Math.floor(availableWidth / pixelSize);

            // Subtract the 6 black border columns and distribute the rest evenly among 5 domains
            const availableForDomains = Math.max(0, maxCols - 6);
            const perDomain = Math.floor(availableForDomains / 5);
            setColsPerDomain(Math.max(1, perDomain)); // render at least 1 column for safety
        };

        updateCols();
        window.addEventListener('resize', updateCols);
        return () => window.removeEventListener('resize', updateCols);
    }, []);

    const getPixelColor = (baseColor: string, level: number) => {
        // Opacities mapped from 0 to 4. Level 0 is 20% opacity.
        const opacities = [0.2, 0.4, 0.6, 0.8, 1];
        return baseColor + Math.floor(opacities[level] * 255).toString(16).padStart(2, '0');
    };

    const renderColumn = (key: string, type: 'border' | 'domain', domainColor?: string) => {
        const pixels = [];
        for (let r = 0; r < rows; r++) {
            if (type === 'border') {
                pixels.push('#111111'); // Black border
            } else {
                const rand = Math.random();
                let level = 4;
                if (rand < 0.3) level = 0;
                else if (rand < 0.6) level = 1;
                else if (rand < 0.8) level = 2;
                else if (rand < 0.95) level = 3;

                pixels.push(getPixelColor(domainColor!, level));
            }
        }
        // 11th pixel for every column acts as the continuous bottom border seamlessly connecting sides
        pixels.push('#111111');

        return (
            <div key={key} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}>
                {pixels.map((color, i) => {
                    const isBorderPixel = type === 'border' || i === rows;
                    return (
                        <div
                            key={i}
                            style={{
                                width: '10px',
                                height: '10px',
                                backgroundColor: color,
                                borderRadius: '2px',
                                transition: 'all 0.2s ease',
                                cursor: !isBorderPixel ? 'pointer' : 'default'
                            }}
                            onMouseEnter={(e) => {
                                if (!isBorderPixel) {
                                    e.currentTarget.style.transform = 'scale(1.2)';
                                    e.currentTarget.style.boxShadow = `0 2px 8px ${domainColor}60`;
                                    e.currentTarget.style.zIndex = '10';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isBorderPixel) {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.zIndex = '1';
                                }
                            }}
                        />
                    );
                })}
            </div>
        );
    };

    // Construct the entire layout strictly dynamically to prevent gaps/overflows
    const columns = [];

    // Leftmost black border column
    columns.push(renderColumn('left-border', 'border'));

    // 5 Colored Domains with dividers
    domainColors.forEach((color, dIndex) => {
        for (let c = 0; c < colsPerDomain; c++) {
            columns.push(renderColumn(`domain-${dIndex}-${c}`, 'domain', color));
        }
        // Divider mapping (acts as right border for the final domain as well!)
        columns.push(renderColumn(`divider-${dIndex}`, 'border'));
    });

    return (
        <div style={{
            minHeight: '100vh',
            background: '#ffffff', // Pure white background
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center', // Center vertically on the screen
            width: '100%',
            overflowX: 'hidden'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'row', // Align all columns side-by-side
                gap: '2px', // The same gap spacing is uniformly maintained everywhere!
                padding: '0 20px', // Page padding
                justifyContent: 'center'
            }}>
                {columns}
            </div>
        </div>
    );
}
