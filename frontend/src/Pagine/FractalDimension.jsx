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
import FractalDataExplorer from '../Components/FractalDataExplorer'; // NEW COMPONENT
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
    // The socket ref is no longer needed; the imported instance is used directly.
    // const socket = useRef(null);

    // --- Static configuration objects ---
    const analysisTypeOptions = [
        { label: 'Dataset Distribution (E2)', value: 'distribution' },
        { label: 'Dataset Group Properties', value: 'summary' },
        { label: 'Range Query Results', value: 'range_query' },
    ];
    
    const parameterConfig = {
        distribution: [{ label: 'Distribution (E2)', value: 'distribution' }],
        summary: [ { label: 'Average Area', value: 'avg_area' }, { label: 'Average Side Length 0', value: 'avg_side_length_0' }, { label: 'Average Side Length 1', value: 'avg_side_length_1' }, ],
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

    // --- Event Handlers (remain unchanged) ---
    const handleNodeSelect = async (node) => {
        setError('');
        setSelectedNode(node);
        if (analysisType === 'distribution' && node.type !== 'folder') {
            toast.current.show({ severity: 'warn', summary: 'Invalid Selection', detail: 'Please select a folder for this analysis.', life: 3000 });
            setSelectedNode(null); return;
        }
        if ((analysisType === 'summary' || analysisType === 'range_query') && node.type !== 'file') {
            toast.current.show({ severity: 'warn', summary: 'Invalid Selection', detail: 'Please select a file for this analysis.', life: 3000 });
            setSelectedNode(null); return;
        }
        toast.current.show({ severity: 'info', summary: 'Selection Made', detail: node.data.path, life: 2000 });
        if (analysisType === 'summary' || analysisType === 'range_query') {
            setParamLoading(true);
            setParametersToRun([]); setParameterOptions([]);
            try {
                const baseDir = node.data.path.split('/')[0];
                const relativePath = node.data.path.split('/').slice(1).join('/');
                const response = await fetch(`${API_BASE_URL}/preview/file/${relativePath}?base_dir=${baseDir}`);
                if (!response.ok) { throw new Error('Failed to fetch file content.'); }
                const csvContent = await response.text();
                const getValidParameters = (content, potentialParams) => {
                    const lines = content.trim().split('\n');
                    if (lines.length < 2) return [];
                    const headers = lines[0].trim().split(';').map(h => h.trim());
                    const validColumns = new Set();
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].trim().split(';');
                        headers.forEach((header, index) => {
                            if (values[index] && values[index].trim() !== '') { validColumns.add(header); }
                        });
                    }
                    return potentialParams.filter(param => validColumns.has(param.value));
                };
                const potentialOptions = parameterConfig[analysisType];
                const availableOptions = getValidParameters(csvContent, potentialOptions);
                if (availableOptions.length === 0) { toast.current.show({ severity: 'warn', summary: 'No Data', detail: 'The selected file does not contain valid data for this analysis.', life: 4000 }); }
                setParameterOptions(availableOptions);
            } catch (err) {
                console.error("Error fetching or parsing file:", err);
                toast.current.show({ severity: 'error', summary: 'File Error', detail: 'Could not read the selected file.', life: 3000 });
                setSelectedNode(null);
            } finally { setParamLoading(false); }
        }
    };
    
    const handleRunScript = () => {
        if (!selectedNode || parametersToRun.length === 0) { setError("Please complete all steps before execution."); return; }
        setIsExecuting(true); setShowProgressDialog(true); setError(''); setProgressMessage('Initializing calculation...');
        const payload = { analysisType: analysisType, selectedPath: selectedNode.data.path, parameters: parametersToRun, };
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
                                            { label: 'Range Query (Folder 3)', value: 'original' },
                                            { label: 'Training Sets (Folder 4)', value: 'training_set' }
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
            <Dialog header="Fractal Dimension Calculation" visible={showProgressDialog} style={{ width: '50vw' }} modal closable={!isExecuting} onHide={() => !isExecuting && setShowProgressDialog(false)}>
                <div className="flex flex-column gap-3 pt-2">
                    <div><label className='font-bold'>{progressMessage}</label><ProgressBar mode="indeterminate" style={{ height: '6px' }} className="mt-2" /></div><Divider/>
                    <div><label>CPU Usage</label><ProgressBar mode="determinate" value={cpuUsage} displayValueTemplate={() => `${cpuUsage.toFixed(1)}%`} /></div>
                    <div><label>RAM Usage</label><ProgressBar mode="determinate" value={ramUsage} displayValueTemplate={() => `${ramUsage.toFixed(1)}%`} /></div>
                </div>
            </Dialog>
        </div>
    );
}

export default FractalDimension;