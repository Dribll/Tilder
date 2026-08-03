import React, { useState } from 'react';

export default function SpreadsheetEditor({ initialContent, onChange }) {
  const parseGrid = (content) => {
    if (!content) return Array(20).fill(0).map(() => Array(10).fill(''));
    try {
      if (content.startsWith('data:')) return Array(20).fill(0).map(() => Array(10).fill(''));
      return content.split('\n').map(row => row.split(','));
    } catch {
      return Array(20).fill(0).map(() => Array(10).fill(''));
    }
  };

  const [grid, setGrid] = useState(parseGrid(initialContent));

  const updateCell = (rowIndex, colIndex, value) => {
    const newGrid = [...grid];
    newGrid[rowIndex] = [...newGrid[rowIndex]];
    newGrid[rowIndex][colIndex] = value;
    setGrid(newGrid);
    onChange(newGrid.map(row => row.join(',')).join('\n'));
  };

  const getColumnLabel = (index) => {
    let label = '';
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode(65 + (temp % 26)) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  };

  return (
    <div className="office-editor spreadsheet">
      <div className="office-toolbar">
        <div className="office-toolbar-title">Spreadsheet Editor</div>
        <button className="office-btn" onClick={() => setGrid([...grid, Array(grid[0].length).fill('')])}>Add Row</button>
        <button className="office-btn" onClick={() => setGrid(grid.map(row => [...row, '']))}>Add Column</button>
      </div>
      <div className="office-grid-container">
        <table className="office-grid">
          <thead>
            <tr>
              <th className="office-grid-header corner"></th>
              {grid[0]?.map((_, i) => (
                <th key={i} className="office-grid-header">{getColumnLabel(i)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="office-grid-row-header">{rowIndex + 1}</td>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="office-grid-cell">
                    <input
                      value={cell}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
