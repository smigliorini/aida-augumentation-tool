import React, { useState, useEffect, useCallback } from 'react';

// --- PrimeReact Component Imports ---
import { Card } from 'primereact/card';
import { MultiSelect } from 'primereact/multiselect';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Divider } from 'primereact/divider';
// Import the base URL for API calls.
import { API_BASE_URL } from '../socket';

/**
 * A utility function to group an array of objects by a specific key.
 * @param {Array<object>} array - The array to group.
 * @param {string} key - The key to group by (e.g., 'source').
 * @returns {object} An object with keys corresponding to the grouped values.
 */
const groupBy = (array, key) => {
    return array.reduce((acc, item) => {
        (acc[item[key]] = acc[item[key]] || []).push(item);
        return acc;
    }, {});
};

/**
 * A component to visualize Fractal Dimension data using large, styled numerical displays.
 * It fetches available data sources and their corresponding fractal values,
 * then renders them in separate, stacked cards for easy comparison.
 *
 * @param {object} props
 * @param {number} props.refreshKey - A key that, when changed, triggers a data refetch.
 */
function FractalDataExplorer({ refreshKey }) {
    const [availableSources, setAvailableSources] = useState([]);
    const [selectedSources, setSelectedSources] = useState([]);
    const [apiData, setApiData] = useState(null); // State to hold the direct response from the API
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // A color palette for styling the numerical values.
    const colorPalette = [
        '#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0',
        '#00BCD4', '#FF5722', '#795548', '#607D8B', '#F44336'
    ];

    // Fetches the list of all available dataset sources from the server.
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

    // Fetches the fractal dimension data for the currently selected sources.
    const fetchFractalData = useCallback(async () => {
        if (selectedSources.length === 0) {
            setApiData(null); // Clear data if no sources are selected
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
            setApiData(data); // The backend now returns data pre-grouped by dataset_id
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedSources]);

    // Initial data fetch and subsequent refreshes triggered by the parent component.
    useEffect(() => {
        fetchSources();
    }, [fetchSources, refreshKey]);

    // Re-fetch data whenever the user's selection changes.
    useEffect(() => {
        fetchFractalData();
    }, [fetchFractalData]);
    
    /**
     * Formats a number for display, adding thousands separators and limiting decimal places.
     * @param {number} value - The number to format.
     * @returns {string} The formatted number string.
     */
    const formatNumber = (value) => {
        if (typeof value !== 'number') return 'N/A';
        // Use toLocaleString for robust formatting. It handles integers and decimals well.
        return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
    };

    return (
        <Card title="Fractal Dimension Data Explorer">
            <div className="flex flex-column gap-4">
                <div>
                    <label htmlFor="sourceSelect" className="font-bold block mb-2">
                        Select Dataset Colletion to Visualize
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
                            {Object.entries(apiData).map(([datasetId, results]) => {
                                const dataBySource = groupBy(results, 'source');
                                return (
                                    <Card key={datasetId} title={datasetId} className="p-card-shadow"  style={{ backgroundColor: '#20262E' }}>
                                        {/* Level 2: Iterate over each source ('Input Caratceristic', 'Output Metrics', etc.) */}
                                        {Object.entries(dataBySource).map(([sourceName, params], sourceIndex) => (
                                            <div key={sourceName}>
                                                {sourceIndex > 0 && <Divider />}
                                                <h3 className="text-lg font-semibold mt-2 mb-3">{sourceName}</h3>
                                                <div className="grid text-center">
                                                    {params.map((param, paramIndex) => (
                                                        <div key={param.parameter} className="col-12 md:col-6 lg:col-3 p-2">
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
                                            </div>
                                        ))}
                                    </Card>
                                );
                            })}
                        </div>
                    ) : (
                        !isLoading && <Message severity="info" text="Select one or more datasets to display their data." className="mt-4 w-full" />
                    )
                )}
            </div>
        </Card>
    );
}

export default FractalDataExplorer;
