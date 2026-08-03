import React, { useMemo } from 'react';

/**
 * Tilder Exclusive: Real-time Code Logic Visualization (CodeViz)
 * Transpiles active code into a visual flowchart for architecture review.
 */
export default function CodeViz({ activeTab, settings }) {
    const isVisible = settings?.ai?.codeViz;

    const nodes = useMemo(() => {
        if (!activeTab || !isVisible) return [];
        
        // Very basic parser to simulate visual logic nodes
        const content = activeTab.content || "";
        const lines = content.split('\n');
        const foundNodes = [];
        
        lines.forEach((line, index) => {
            if (line.includes('if (') || line.includes('if(')) {
                foundNodes.push({ id: index, type: 'Decision', label: 'IF Condition', line: index + 1 });
            } else if (line.includes('function ') || line.includes('const ') && line.includes('=>')) {
                foundNodes.push({ id: index, type: 'Process', label: 'Function Entry', line: index + 1 });
            } else if (line.includes('return ')) {
                foundNodes.push({ id: index, type: 'Endpoint', label: 'Return', line: index + 1 });
            }
        });
        
        return foundNodes.slice(0, 10); // Show only top 10 for performance
    }, [activeTab?.content, isVisible]);

    if (!isVisible) return null;

    return (
        <div className="codeviz-container" style={{
            padding: '16px',
            background: 'var(--tilder-panel-bg)',
            backdropFilter: 'var(--tilder-panel-blur)',
            borderRadius: '12px',
            border: 'var(--tilder-border-highlight)',
            marginTop: '12px'
        }}>
            <div className="codeviz-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h6 style={{ fontSize: '12px', color: '#a89eff', margin: 0 }}>CODE LOGIC VIZ</h6>
                <span style={{ fontSize: '10px', opacity: 0.6 }}>Real-time</span>
            </div>
            
            <div className="codeviz-flow" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {nodes.length > 0 ? nodes.map((node, i) => (
                    <React.Fragment key={node.id}>
                        <div className={`codeviz-node ${node.type.toLowerCase()}`} style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(168,158,255,0.2)',
                            borderRadius: '6px',
                            fontSize: '11px',
                            position: 'relative',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '9px', opacity: 0.5, marginBottom: '2px' }}>{node.type} @ Line {node.line}</div>
                            {node.label}
                        </div>
                        {i < nodes.length - 1 && (
                            <div className="codeviz-arrow" style={{ 
                                height: '12px', 
                                width: '1px', 
                                background: 'rgba(168,158,255,0.3)', 
                                margin: '0 auto' 
                            }} />
                        )}
                    </React.Fragment>
                )) : (
                    <div style={{ fontSize: '11px', opacity: 0.5, textAlign: 'center', padding: '20px' }}>
                        No complex logic nodes detected in current view.
                    </div>
                )}
            </div>
        </div>
    );
}
