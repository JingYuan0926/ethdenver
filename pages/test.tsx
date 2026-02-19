import { useState, useEffect } from 'react';
import spinners from 'unicode-animations';

const SPINNER_NAMES = [
    'braille',
    'orbit',
    'pulse',
    'scan',
    'rain',
    'sparkle',
    'cascade',
    'columns',
    'breathe',
    'snake',
    'helix',
    'fillsweep',
    'diagswipe',
    'scanline',
    'checkerboard',
    'waverows',
    'braillewave',
    'dna',
] as const;

function Spinner({ name }: { name: string }) {
    const [frame, setFrame] = useState(0);
    const s = (spinners as any)[name];

    useEffect(() => {
        if (!s) return;
        const timer = setInterval(
            () => setFrame((f) => (f + 1) % s.frames.length),
            s.interval
        );
        return () => clearInterval(timer);
    }, [name, s]);

    if (!s) return null;

    return (
        <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
            border: '1px solid #f0f0f0',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default',
            minWidth: '160px',
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)';
            }}
        >
            <div style={{
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '48px',
                lineHeight: 1,
                color: '#1a1a1a',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'pre',
            }}>
                {s.frames[frame]}
            </div>
            <div style={{
                fontFamily: '"Inter", "Segoe UI", sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
            }}>
                {name}
            </div>
            <div style={{
                fontFamily: '"Courier New", monospace',
                fontSize: '11px',
                color: '#bbb',
            }}>
                {s.frames.length} frames · {s.interval}ms
            </div>
        </div>
    );
}

export default function TestPage() {
    return (
        <>
            <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
      `}</style>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 50%, #fafafa 100%)',
                padding: '60px 40px',
                fontFamily: '"Inter", sans-serif',
            }}>
                {/* Header */}
                <div style={{
                    textAlign: 'center',
                    marginBottom: '60px',
                }}>
                    <h1 style={{
                        fontFamily: '"Courier New", Courier, monospace',
                        fontSize: '48px',
                        fontWeight: 700,
                        color: '#1a1a1a',
                        letterSpacing: '8px',
                        marginBottom: '12px',
                    }}>
                        UNICODE
                    </h1>
                    <p style={{
                        fontSize: '14px',
                        fontWeight: 400,
                        color: '#aaa',
                        letterSpacing: '6px',
                        textTransform: 'uppercase',
                    }}>
                        Braille Animations
                    </p>
                    <div style={{
                        width: '40px',
                        height: '2px',
                        background: '#ddd',
                        margin: '24px auto 0',
                    }} />
                </div>

                {/* Spinner Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '24px',
                    maxWidth: '1200px',
                    margin: '0 auto',
                }}>
                    {SPINNER_NAMES.map((name) => (
                        <Spinner key={name} name={name} />
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    textAlign: 'center',
                    marginTop: '60px',
                    color: '#ccc',
                    fontSize: '12px',
                    letterSpacing: '2px',
                }}>
                    <code style={{
                        background: '#fff',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #eee',
                        color: '#888',
                    }}>
                        npm install unicode-animations
                    </code>
                </div>
            </div>
        </>
    );
}
