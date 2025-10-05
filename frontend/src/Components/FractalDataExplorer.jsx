import React, { useState, useEffect, useCallback } from 'react';

// --- PrimeReact Component Imports ---
import { Card } from 'primereact/card';
import { MultiSelect } from 'primereact/multiselect';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Divider } from 'primereact/divider';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';

// Import the base URL for API calls.
import { API_BASE_URL } from '../socket';

/**
 * A component to visualize Fractal Dimension data across different analysis types.
 * It fetches and displays data for E2 distribution, dataset group properties,
 * and range query results, including specific training sets.
 *
 * @param {object} props
 * @param {number} props.refreshKey - A key that, when changed, triggers a data refetch.
 */
function FractalDataExplorer({ refreshKey }) {
    const [availableSources, setAvailableSources] = useState([]);
    const [selectedSources, setSelectedSources] = useState([]);
    const [apiData, setApiData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // A color palette for styling the numerical values in grids.
    const colorPalette = [
        '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
        '#00BCD4', '#FF5722', '#795548', '#607D8B', '#F44336'
    ];

    // Fetches the list of all available dataset collections from the server.
    const fetchSources = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/fractal/sources`);
            if (!response.ok) throw new Error('Failed to fetch available data sources.');
            const data = await response.json();
            setAvailableSources(data.map(id => ({ label: id, value: id })));
        } catch (err) {
            setError(err.message);
        }
    }, []);

    // Fetches the structured fractal dimension data for the currently selected sources.
    const fetchFractalData = useCallback(async () => {
        if (selectedSources.length === 0) {
            setApiData(null);
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/fractal/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataset_ids: selectedSources }),
            });
            if (!response.ok) throw new Error('Failed to fetch fractal data.');
            const data = await response.json();
            setApiData(data); // The backend now returns data pre-structured
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedSources]);

    // Initial sources fetch and subsequent refreshes triggered by the parent.
    useEffect(() => {
        fetchSources();
    }, [fetchSources, refreshKey]);

    // Re-fetch data whenever the user's selection changes OR the parent signals a refresh.
    useEffect(() => {
        fetchFractalData();
    }, [fetchFractalData, refreshKey]);
    
    /**
     * Formats a number for display, adding thousands separators and limiting decimal places.
     * @param {number} value - The number to format.
     * @returns {string} The formatted number string.
     */
    const formatNumber = (value) => {
        if (typeof value !== 'number') return 'N/A';
        return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
    };

    /**
     * Renders a grid of fractal dimension values for a given set of parameters.
     * @param {Array<object>} params - Array of parameter objects { parameter, value }.
     */
    const renderValueGrid = (params) => (
        <div className="grid text-center">
            {params.map((param, paramIndex) => (
                <div key={param.parameter} className="col-12 md:col-6 lg:col-4 p-2">
                    <div className="p-2 border-1 surface-border border-round h-full flex flex-column justify-content-center">
                        <div className="text-lg font-medium text-color-secondary">{param.parameter}</div>
                        <div
                            className="text-4xl font-bold mt-2"
                            style={{ color: colorPalette[paramIndex % colorPalette.length] }}
                        >
                            {formatNumber(param.value)}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
    
    return (
        <Card title="Fractal Dimension Data Explorer">
            <div className="flex flex-column gap-4">
                <div>
                    <label htmlFor="sourceSelect" className="font-bold block mb-2">
                        Select Dataset Collection to Visualize
                    </label>
                    <MultiSelect
                        id="sourceSelect"
                        value={selectedSources}
                        options={availableSources}
                        onChange={(e) => setSelectedSources(e.value)}
                        placeholder="Select sources"
                        display="chip"
                        className="w-full"
                    />
                </div>

                {isLoading && <div className="text-center mt-4"><ProgressSpinner style={{width: '50px', height: '50px'}} /></div>}
                {error && <Message severity="error" text={error} />}

                {!isLoading && !error && (
                    apiData && Object.keys(apiData).length > 0 ? (
                        <div className="mt-4 flex flex-column gap-4">
                            {/* Level 1: Iterate over each selected dataset_id */}
                            {Object.entries(apiData).map(([datasetId, data]) => (
                                <Card key={datasetId} title={datasetId} className="p-card-shadow" style={{ backgroundColor: '#20262E' }}>
                                    
                                    {/* --- Section 1: E2 Distribution --- */}
                                    {data.e2Distribution && data.e2Distribution.length > 0 && (
                                        <div>
                                            <h3 className="text-xl font-semibold mt-2 mb-3">Dataset Distribution (E2)</h3>
                                            <DataTable value={data.e2Distribution} stripedRows paginator rows={5} className="p-datatable-sm">
                                                <Column field="datasetName" header="Dataset Name" sortable />
                                                <Column field="e2Value" header="E2 Value" body={(rowData) => formatNumber(rowData.e2Value)} sortable />
                                            </DataTable>
                                        </div>
                                    )}

                                    {/* --- Section 2: Dataset Group Properties --- */}
                                    {data.groupProperties && data.groupProperties.length > 0 && (
                                        <div>
                                            <Divider />
                                            <h3 className="text-xl font-semibold mt-2 mb-3">Dataset Group Properties</h3>
                                            {renderValueGrid(data.groupProperties)}
                                        </div>
                                    )}
                                    
                                    {/* --- Section 3: Range Query Results --- */}
                                    {data.rangeQueryResults && (data.rangeQueryResults.original.length > 0 || data.rangeQueryResults.trainingSets.length > 0) && (
                                        <div>
                                            <Divider />
                                            <h3 className="text-xl font-semibold mt-2 mb-3">Range Query Results</h3>
                                            {/* Original RQ */}
                                            {data.rangeQueryResults.original.length > 0 && (
                                                <div className="mb-4">
                                                    <h4 className="text-lg font-semibold mt-2 mb-3 text-color-secondary">Original Query Set</h4>
                                                     {renderValueGrid(data.rangeQueryResults.original)}
                                                </div>
                                            )}
                                            {/* Training Sets */}
                                            {data.rangeQueryResults.trainingSets.map((ts, index) => (
                                                <div key={ts.source}>
                                                     {index > 0 && <Divider type="dotted" />}
                                                     <h4 className="text-lg font-semibold mt-3 mb-3 text-color-secondary">{ts.source}</h4>
                                                     {renderValueGrid(ts.data)}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    ) : (
                        !isLoading && <Message severity="info" text="Select one or more dataset collections to display their data." className="mt-4 w-full" />
                    )
                )}
            </div>
        </Card>
    );
}

export default FractalDataExplorer;