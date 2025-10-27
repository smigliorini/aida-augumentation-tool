import React, { useState, useRef, useEffect } from 'react';
// The direct import of 'io' is no longer needed.
// import { io } from 'socket.io-client';

// --- PrimeReact Component Imports ---
import MyMenu from '../Components/MyMenu';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { Panel } from 'primereact/panel';
import { Divider } from 'primereact/divider';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Dialog } from 'primereact/dialog';
import { ProgressBar } from 'primereact/progressbar';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';

// --- Custom Component Imports ---
import FractalDimSelector from '../Components/FractalDimSelector';
import FractalDataExplorer from '../Components/FractalDataExplorer';
// Import the centralized socket instance and API base URL.
import { socket, API_BASE_URL } from '../socket';

/**
 * Orchestrates the Fractal Dimension calculation workflow.
 */
function FractalDimension() {
    // --- State for the main workflow (calculation part) ---
    const [analysisType, setAnalysisType] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [parametersToRun, setParametersToRun] = useState([]);
    const [parameterOptions, setParameterOptions] = useState([]);
    const [rqSource, setRqSource] = useState('original');

    // --- State for the controlled FractalDimSelector component ---
    const [selectorRootKey, setSelectorRootKey] = useState(null);
    const [selectorExpandedKeys, setSelectorExpandedKeys] = useState({});
    
    // --- State to trigger data refresh in the explorer ---
    const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);

    // --- State for UI feedback and execution ---
    const [error, setError] = useState('');
    const toast = useRef(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [paramLoading, setParamLoading] = useState(false);
    const [cpuUsage, setCpuUsage] = useState(0);
    const [ramUsage, setRamUsage] = useState(0);
    const [progressMessage, setProgressMessage] = useState('Starting...');
    const [showProgressDialog, setShowProgressDialog] = useState(false);
    const [detailedProgress, setDetailedProgress] = useState({ current: 0, total: 0, name: '' });
    const [progressValue, setProgressValue] = useState(0);

    // --- Static configuration objects ---
    const analysisTypeOptions = [
        { label: 'Input Spatial Distributions (E2)', value: 'distribution' },
        { label: 'Input Spatial Properties', value: 'summary' },
        { label: 'Ground Truth Values', value: 'range_query' },
    ];
    
    const parameterConfig = {
        distribution: [{ label: 'Distribution (E2)', value: 'distribution' }],
        summary: [ { label: 'Average Area', value: 'avg_area' }, { label: 'Average Side Length 0', value: 'avg_side_length_0' }, { label: 'Average Side Length 1', value: 'avg_side_length_1' },  { label: 'E2 Distribution', value: 'E2' }],
        range_query: [ { label: 'Cardinality', value: 'cardinality' }, { label: 'Execution Time', value: 'executionTime' }, { label: 'MBR Tests', value: 'mbrTests' }, ],
    };

    // --- Effect for WebSocket connection ---
    useEffect(() => {
        socket.connect();
        socket.on('connect', () => console.log('Socket.IO connected for Fractal Dimension page'));
        
        socket.on('resource_usage', (data) => { setCpuUsage(data.cpu); setRamUsage(data.ram); });
        socket.on('fractal_dimension_progress', (data) => setProgressMessage(data.message || 'Processing...'));
        
        socket.on('fractal_dimension_complete', (data) => {
            toast.current.show({ severity: 'success', summary: 'Success', detail: 'Calculation completed. The explorer has been updated.', life: 8000 });
            setIsExecuting(false); 
            setShowProgressDialog(false);
            // Trigger a refresh in the data explorer component
            setExplorerRefreshKey(prevKey => prevKey + 1);
        });

        socket.on('fractal_dimension_error', (data) => {
            setError(data.error || "An unexpected error occurred.");
            toast.current.show({ severity: 'error', summary: 'Execution Error', detail: data.error, life: 5000 });
            setIsExecuting(false); 
            setShowProgressDialog(false);
        });

        socket.on('fractal_dimension_dataset_progress', (data) => {
            const percentage = data.total > 0 ? Math.floor((data.current / data.total) * 100) : 0;
            setProgressValue(percentage);
            setDetailedProgress({
                current: data.current,
                total: data.total,
                name: data.datasetName
            });
        });
        
        return () => { socket.disconnect(); };
    }, []);

    // Effect to update UI when analysisType or rqSource changes.
    useEffect(() => {
        setSelectedNode(null);
        setParametersToRun([]);
        setParameterOptions(parameterConfig[analysisType] || []);
        
        if (analysisType === 'distribution') { setParametersToRun(['distribution']); }

        let rootKey = null;
        if (analysisType === 'range_query') {
            rootKey = rqSource === 'original' ? 'range_query_results' : 'trainingSets';
        } else {
            const rootKeyMapping = { 'distribution': 'parent_dir_dataset', 'summary': 'parent_dir_input_ds', };
            rootKey = rootKeyMapping[analysisType] || null;
        }
        
        setSelectorRootKey(rootKey);
        setSelectorExpandedKeys({});
    }, [analysisType, rqSource]);

    // --- Event Handlers ---
    
    // Handles the selection of a node (file or folder) from the file tree.
    // Validates the selection based on the current analysis type.
    const handleNodeSelect = async (node) => {
        // Reset any previous error messages and set the newly selected node in the state.
        setError('');
        setSelectedNode(node);

        // --- 1. Validate Selection based on Analysis Type ---
        // If the analysis requires a folder, but the user selected a file, show a warning and reset.
        if (analysisType === 'distribution' && node.type !== 'folder') {
            toast.current.show({ severity: 'warn', summary: 'Invalid Selection', detail: 'Please select a folder for this analysis.', life: 3000 });
            setSelectedNode(null); return;
        }
        // If the analysis requires a file, but the user selected a folder, show a warning and reset.
        if ((analysisType === 'summary' || analysisType === 'range_query') && node.type !== 'file') {
            toast.current.show({ severity: 'warn', summary: 'Invalid Selection', detail: 'Please select a file for this analysis.', life: 3000 });
            setSelectedNode(null); return;
        }

        // If the selection is valid, show an informational toast to the user.
        toast.current.show({ severity: 'info', summary: 'Selection Made', detail: node.data.path, life: 2000 });

        // --- 2. Fetch and Parse File Content for Parameter Options (if applicable) ---
        // This logic only runs for analyses that operate on single files.
        if (analysisType === 'summary' || analysisType === 'range_query') {
            // Set loading state for the parameter selection UI.
            setParamLoading(true);
            // Reset previously selected parameters and available options.
            setParametersToRun([]);
            setParameterOptions([]);

            try {
                // Split the full path to construct the API request URL correctly.
                const baseDir = node.data.path.split('/')[0];
                const relativePath = node.data.path.split('/').slice(1).join('/');
                
                // Fetch a preview of the selected CSV file from the backend API.
                const response = await fetch(`${API_BASE_URL}/preview/file/${relativePath}?base_dir=${baseDir}`);
                if (!response.ok) { throw new Error('Failed to fetch file content.'); }
                const csvContent = await response.text();

                // Analyzes the CSV content to find columns that contain actual data
                const getValidParameters = (content, potentialParams) => {
                    const lines = content.trim().split('\n');
                    // If the file has no data rows, return no valid parameters.
                    if (lines.length < 2) return [];

                    const headers = lines[0].trim().split(';').map(h => h.trim());
                    // Use a Set to efficiently store the names of columns that contain data.
                    const validColumns = new Set();

                    // Iterate over data rows (skipping the header line).
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].trim().split(';');
                        headers.forEach((header, index) => {
                            // If a value exists in this column for this row, mark the column header as valid.
                            if (values[index] && values[index].trim() !== '') {
                                validColumns.add(header);
                            }
                        });
                    }
                    // Filter the initial list of potential parameters, keeping only those found in the valid columns.
                    return potentialParams.filter(param => validColumns.has(param.value));
                };

                // Get all possible parameters for the current analysis from a configuration object.
                const potentialOptions = parameterConfig[analysisType];
                // Determine the actual available parameters based on the file content.
                const availableOptions = getValidParameters(csvContent, potentialOptions);

                // If no valid parameters are found, inform the user.
                if (availableOptions.length === 0) {
                    toast.current.show({ severity: 'warn', summary: 'No Data', detail: 'The selected file does not contain valid data for this analysis.', life: 4000 });
                }
                // Update the state to populate the parameter selection UI (e.g., a dropdown).
                setParameterOptions(availableOptions);

            } catch (err) {
                console.error("Error fetching or parsing file:", err);
                toast.current.show({ severity: 'error', summary: 'File Error', detail: 'Could not read the selected file.', life: 3000 });
                setSelectedNode(null); // Reset selection on error.
            } finally {
                // Ensure the loading indicator is turned off, whether the process succeeded or failed.
                setParamLoading(false);
            }
        }
    };

    /**
     * Handles the click event for the "Run Script" button.
     * It validates that all necessary selections have been made, prepares a payload,
     * and emits a Socket.IO event to trigger the backend analysis.
     */
    const handleRunScript = () => {
        // --- 1. Pre-execution Validation ---
        // Ensure a node has been selected and at least one parameter is chosen.
        if (!selectedNode || parametersToRun.length === 0) {
            setError("Please complete all steps before execution.");
            return;
        }

        // --- 2. Initialize UI for Execution ---
        // Set execution state, show progress dialog, and reset progress indicators.
        setIsExecuting(true);
        setShowProgressDialog(true);
        setError('');
        setProgressMessage('Initializing calculation...');
        setProgressValue(0);
        setDetailedProgress({ current: 0, total: 0, name: '' });

        // --- 3. Prepare and Send Payload to Backend ---
        // Construct the data payload with all necessary information for the backend script.
        const payload = {
            analysisType: analysisType,
            selectedPath: selectedNode.data.path,
            parameters: parametersToRun,
            rqSource: rqSource,
        };

        // Emit a socket event to the server to start the fractal dimension calculation.
        socket.emit('run_fractal_dimension', payload);
    };

    // --- Render ---
    return (
        <div>
            <MyMenu />
            <Toast ref={toast} />
            <div className="p-grid p-fluid">
                <div className="p-col-12"><h1 className="m-3">Fractal Dimension</h1><Divider /></div>

                <div className="p-col-12 p-md-5">
                    <div className="flex flex-column gap-3">
                        {/* --- STEP 1: ANALYSIS TYPE --- */}
                        <Card title="1. Select Analysis Type">
                            <Dropdown 
                                value={analysisType} 
                                options={analysisTypeOptions} 
                                onChange={(e) => setAnalysisType(e.value)} 
                                placeholder="Select an Analysis Type" 
                                className="w-full"
                            />
                            {analysisType === 'range_query' && (
                                <div className="mt-3">
                                    <label className="font-bold block mb-2">Select Query Source</label>
                                    <SelectButton 
                                        value={rqSource} 
                                        onChange={(e) => setRqSource(e.value)} 
                                        options={[
                                            { label: 'Original Collection (3. Range Query)', value: 'original' },
                                            { label: 'Augmented Collections (4. Training Set)', value: 'training_set' }
                                        ]} 
                                        className="w-full"
                                    />
                                </div>
                            )}
                        </Card>

                        {/* --- STEP 2: SELECT TARGET --- */}
                        <Card title="2. Select Target">
                            <FractalDimSelector 
                                rootKey={selectorRootKey}
                                selectedKey={selectedNode ? selectedNode.key : null}
                                onSelect={(e) => handleNodeSelect(e.node)}
                                expandedKeys={selectorExpandedKeys}
                                onExpansionChange={setSelectorExpandedKeys}
                            />
                        </Card>

                        {/* --- STEP 3: CONFIGURE & EXECUTE --- */}
                        {selectedNode && (
                            <Card title="3. Configure & Execute">
                                <Panel header="Current Selection" toggleable collapsed>
                                    <p className="m-0" style={{wordBreak: 'break-all'}}><strong>Selected:</strong> {selectedNode.data.path}</p>
                                </Panel>
                                <div className="mt-3">
                                    <label htmlFor="params" className="font-bold block mb-2">Parameter(s) to Calculate</label>
                                    <MultiSelect 
                                        id="params" 
                                        value={parametersToRun} 
                                        options={parameterOptions} 
                                        onChange={(e) => setParametersToRun(e.value)} 
                                        placeholder={paramLoading ? "Analyzing file..." : "Select parameter(s)"} 
                                        display="chip" 
                                        className="w-full" 
                                        disabled={analysisType === 'distribution' || paramLoading}
                                    />
                                </div>
                                <div className="mt-4">
                                    <Button 
                                        label={isExecuting ? 'Calculating...' : 'Run Calculation'} 
                                        icon="pi pi-play" 
                                        className="w-full p-button-success" 
                                        onClick={handleRunScript} 
                                        disabled={!selectedNode || isExecuting || parametersToRun.length === 0} 
                                    />
                                    {error && <Message severity="error" text={error} className="mt-2 w-full" />}
                                </div>
                            </Card>
                        )}
                    </div>
                </div>

                <Divider></Divider>

                {/* --- RESULTS EXPLORER (RIGHT COLUMN) --- */}
                <div className="p-col-12 p-md-7">
                    <FractalDataExplorer refreshKey={explorerRefreshKey} />
                </div>
            </div>

            {/* --- Progress Dialog --- */}
            <Dialog 
                header="Fractal Dimension Calculation" 
                visible={showProgressDialog} 
                style={{ width: '50vw' }} 
                modal 
                closable={!isExecuting} 
                onHide={() => !isExecuting && setShowProgressDialog(false)}
            >
                <div className="flex flex-column gap-3 pt-2">
                    <div>
                        <label className='font-bold block mb-2'>
                            {detailedProgress.total > 0
                                ? `Processing ${detailedProgress.current} / ${detailedProgress.total}: ${detailedProgress.name}`
                                : progressMessage
                            }
                        </label>
                        <ProgressBar 
                            mode={detailedProgress.total > 0 ? "determinate" : "indeterminate"} 
                            value={progressValue} 
                            style={{ height: '20px' }} 
                            className="mt-2" 
                            displayValueTemplate={(value) => `${value}%`}
                        />
                    </div>
                    
                    <Divider/>

                    <div>
                        <label>CPU Usage</label>
                        <ProgressBar 
                            mode="determinate" 
                            value={cpuUsage} 
                            color="#FFD700"
                            displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} 
                        />
                    </div>
                    <div>
                        <label>RAM Usage</label>
                        <ProgressBar 
                            mode="determinate" 
                            value={ramUsage} 
                            color="#87CEFA"
                            displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} 
                        />
                    </div>
                </div>
            </Dialog>

            {/* <Dialog header="Fractal Dimension Calculation" visible={showProgressDialog} style={{ width: '50vw' }} modal closable={!isExecuting} onHide={() => !isExecuting && setShowProgressDialog(false)}>
                <div className="flex flex-column gap-3 pt-2">
                    <div><label className='font-bold'>{progressMessage}</label><ProgressBar mode="indeterminate" style={{ height: '6px' }} className="mt-2" /></div><Divider/>
                    <div><label>CPU Usage</label><ProgressBar mode="determinate" value={cpuUsage} color="#FFD700" displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} /></div>
                    <div><label>RAM Usage</label><ProgressBar mode="determinate" value={ramUsage} color="#87CEFA" displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} /></div>
                </div>
            </Dialog> */}
        </div>
    );
}

export default FractalDimension;